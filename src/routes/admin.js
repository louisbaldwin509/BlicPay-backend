import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/db.js';
import { requireAuth, requireAdmin, requireAdminOrAgent } from '../middleware/auth.js';
import { memberPayoutDate, getPeriodDates, formatHtDate } from '../utils/solDates.js';
import { notifyUser } from '../utils/notify.js';
import { expireStaleMoncashDeposits } from './moncashDeposits.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);

// Kreye yon kòd entèn inik, egzanp "SIK-482913" pou yon siikisal oswa
// "AJT-738204" pou yon ajan — menm mekanis ak generateUniqueClientId nan
// auth.js (prefiks diferan, tès inisite sou tab diferan).
async function generateUniqueBranchCode() {
  for (let i = 0; i < 5; i++) {
    const candidate = 'SIK-' + Math.floor(100000 + Math.random() * 900000);
    const existing = await prisma.branch.findUnique({ where: { code: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Nou pa t ka jenere yon kòd siikisal inik.');
}
async function generateUniqueAgentCode() {
  for (let i = 0; i < 5; i++) {
    const candidate = 'AJT-' + Math.floor(100000 + Math.random() * 900000);
    const existing = await prisma.user.findUnique({ where: { employeeCode: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Nou pa t ka jenere yon kòd ajan inik.');
}

// Verifye yon AJAN gen dwa aji sou (konfime/rejte) yon depo oswa retrè
// espesifik. Filt lis yo (deposits/pending, withdrawals/pending) deja kache
// sa yo pa dwe wè, men filtraj lis pa anpeche yon apèl dirèk a wout
// konfimasyon an — sa a se vrè baryè sekirite a. Sipè admin pa gen
// restriksyon. Metòd ki pa "biwo" (NatCash, elt.) pa mare ak yon kote
// fizik, kidonk tout ajan ka trete yo.
async function checkAgentBranchAccess(req, record) {
  if (req.user.role !== 'agent') return null;
  if (record.method !== 'biwo') return null;
  const agent = await prisma.user.findUnique({ where: { id: req.user.id }, select: { branch: true } });
  if (!agent?.branch || agent.branch !== record.branch) {
    return 'Demand sa a se pou yon lòt siikisal — ou pa gen dwa trete l.';
  }
  return null;
}

// Kalkile revni BLICPay pou yon peryòd espesifik, detaye pa sous. Peryòd yo
// aksepte: "day" (jodi a), "month" (mwa sa a), "year" (ane sa a), "all"
// (tout tan). N ap ajoute lòt sous revni (egzanp enterè Prè) lè fonksyonalite
// sa yo vin aktif. Souvni: frè retrè yo sèlman konte lè retrè a "confirmed"
// — sipoze si yon retrè "rejected" ranbouse kliyan an nèt (montan + frè).
// Sipè admin sèlman ka kreye yon nouvo kont ajan pou yon biwo espesifik.
// Ajan an ka konfime/rejte depo ak retrè, men li pa gen aksè ak jesyon Sòl,
// KYC, itilizatè, oswa rapò finansye — sa rete pou sipè admin sèlman.
// Sipè admin ka ajoute yon nouvo siikisal, kantite li vle.
adminRouter.post('/branches', requireAdmin, async (req, res) => {
  const { name, address, phone, managerName, openingHours } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Non siikisal la obligatwa.' });

  const existing = await prisma.branch.findUnique({ where: { name: name.trim() } });
  if (existing) return res.status(409).json({ error: 'Yon siikisal deja gen non sa a.' });

  const code = await generateUniqueBranchCode();
  const branch = await prisma.branch.create({
    data: {
      name: name.trim(),
      code,
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      managerName: managerName?.trim() || null,
      openingHours: openingHours?.trim() || null,
    },
  });
  res.status(201).json({ branch });
});

// Sipè admin ka wè lis siikisal yo.
adminRouter.get('/branches', requireAdmin, async (req, res) => {
  const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
  res.json({ branches });
});

adminRouter.post('/agents', requireAdmin, async (req, res) => {
  const { fullName, phone, password, branch, email, idNumber, hireDate, photoImage, photoMimeType } = req.body;
  if (!fullName?.trim() || !phone?.trim() || !password || !branch?.trim()) {
    return res.status(400).json({ error: 'Non, telefòn, modpas, ak biwo obligatwa.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Modpas la dwe gen omwen 6 karaktè.' });
  }

  const existing = await prisma.user.findUnique({ where: { phone: phone.trim() } });
  if (existing) {
    return res.status(409).json({ error: 'Yon kont deja itilize telefòn sa a.' });
  }
  if (email?.trim()) {
    const emailTaken = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (emailTaken) return res.status(409).json({ error: 'Yon kont deja itilize imèl sa a.' });
  }
  const branchExists = await prisma.branch.findUnique({ where: { name: branch.trim() } });
  if (!branchExists) {
    return res.status(400).json({ error: 'Siikisal sa a pa egziste — kreye l anvan.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const employeeCode = await generateUniqueAgentCode();
  const agent = await prisma.user.create({
    data: {
      fullName: fullName.trim(),
      phone: phone.trim(),
      passwordHash,
      role: 'agent',
      branch: branch.trim(),
      verified: true,
      employeeCode,
      email: email?.trim() || null,
      idNumber: idNumber?.trim() || null,
      hireDate: hireDate ? new Date(hireDate) : null,
      photoImage: photoImage || null,
      photoMimeType: photoMimeType || null,
    },
    select: { id: true, fullName: true, phone: true, branch: true, createdAt: true, employeeCode: true, email: true, idNumber: true, hireDate: true, photoImage: true, photoMimeType: true },
  });

  res.status(201).json({ agent });
});

// Sipè admin sèlman ka wè lis tout ajan yo, gwoupe pa biwo.
adminRouter.get('/agents', requireAdmin, async (req, res) => {
  const agents = await prisma.user.findMany({
    where: { role: 'agent' },
    select: { id: true, fullName: true, phone: true, branch: true, createdAt: true, blocked: true, employeeCode: true, email: true, idNumber: true, hireDate: true, photoImage: true, photoMimeType: true },
    orderBy: { branch: 'asc' },
  });
  res.json({ agents });
});

// Efase yon kont ajan nèt. Sipoze ajan an poko janm fè okenn depo/retrè/
// tranzaksyon pèsonèl (nòmalman se ka a — kont ajan pa fèt pou itilize
// tankou yon kont kliyan). Si baz done a refize efase l poutèt yon rapò ki
// egziste, nou di admin an bloke l pito olye efase l.
adminRouter.delete('/agents/:id', requireAdmin, async (req, res) => {
  const agent = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!agent || agent.role !== 'agent') {
    return res.status(404).json({ error: 'Ajan sa a pa jwenn.' });
  }
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete agent error:', err);
    res.status(409).json({ error: 'Nou pa t ka efase ajan sa a — li gen istorik ki mare ak li. Bloke l pito.' });
  }
});

// Modifye enfòmasyon yon ajan. Modpas la OPSYONÈL isit la — si li vid,
// ansyen modpas la rete. Telefòn/imèl verifye pou yo pa antre an konfli
// ak yon LÒT kont (pa avèk pwòp kont ajan an k ap modifye a).
adminRouter.patch('/agents/:id', requireAdmin, async (req, res) => {
  const agent = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!agent || agent.role !== 'agent') {
    return res.status(404).json({ error: 'Ajan sa a pa jwenn.' });
  }

  const { fullName, phone, password, branch, email, idNumber, hireDate, photoImage, photoMimeType } = req.body;
  if (!fullName?.trim() || !phone?.trim() || !branch?.trim()) {
    return res.status(400).json({ error: 'Non, telefòn, ak biwo obligatwa.' });
  }
  if (password && password.length < 6) {
    return res.status(400).json({ error: 'Modpas la dwe gen omwen 6 karaktè.' });
  }

  const phoneTaken = await prisma.user.findUnique({ where: { phone: phone.trim() } });
  if (phoneTaken && phoneTaken.id !== agent.id) {
    return res.status(409).json({ error: 'Yon lòt kont deja itilize telefòn sa a.' });
  }
  if (email?.trim()) {
    const emailTaken = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (emailTaken && emailTaken.id !== agent.id) {
      return res.status(409).json({ error: 'Yon lòt kont deja itilize imèl sa a.' });
    }
  }
  const branchExists = await prisma.branch.findUnique({ where: { name: branch.trim() } });
  if (!branchExists) {
    return res.status(400).json({ error: 'Siikisal sa a pa egziste.' });
  }

  const data = {
    fullName: fullName.trim(),
    phone: phone.trim(),
    branch: branch.trim(),
    email: email?.trim() || null,
    idNumber: idNumber?.trim() || null,
    hireDate: hireDate ? new Date(hireDate) : null,
  };
  if (password?.trim()) {
    data.passwordHash = await bcrypt.hash(password.trim(), 10);
  }
  if (photoImage !== undefined) {
    data.photoImage = photoImage || null;
    data.photoMimeType = photoMimeType || null;
  }

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, fullName: true, phone: true, branch: true, createdAt: true, blocked: true, employeeCode: true, email: true, idNumber: true, hireDate: true, photoImage: true, photoMimeType: true },
  });
  res.json({ agent: updated });
});

// Efase yon siikisal. Nou refize si gen ajan ki toujou asiyen ladan l, pou
// pa kite yo san yon biwo valab.
adminRouter.delete('/branches/:id', requireAdmin, async (req, res) => {
  const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!branch) return res.status(404).json({ error: 'Siikisal sa a pa jwenn.' });

  const agentCount = await prisma.user.count({ where: { role: 'agent', branch: branch.name } });
  if (agentCount > 0) {
    return res.status(409).json({ error: `Gen ${agentCount} ajan ki toujou nan siikisal sa a — deplase oswa efase yo anvan.` });
  }

  await prisma.branch.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Modifye enfòmasyon yon siikisal. Si non an chanje, nou mete ajou tout
// AJAN ki asiyen ladan l pou yo swiv nouvo non an — san sa yo ta rete
// "kwoke" sou yon non ki pa egziste ankò.
adminRouter.patch('/branches/:id', requireAdmin, async (req, res) => {
  const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!branch) return res.status(404).json({ error: 'Siikisal sa a pa jwenn.' });

  const { name, address, phone, managerName, openingHours } = req.body;
  const newName = name?.trim();
  if (!newName) return res.status(400).json({ error: 'Non siikisal la obligatwa.' });

  if (newName !== branch.name) {
    const nameTaken = await prisma.branch.findUnique({ where: { name: newName } });
    if (nameTaken) return res.status(409).json({ error: 'Yon lòt siikisal deja gen non sa a.' });
  }

  const [updated] = await prisma.$transaction([
    prisma.branch.update({
      where: { id: req.params.id },
      data: {
        name: newName,
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        managerName: managerName?.trim() || null,
        openingHours: openingHours?.trim() || null,
      },
    }),
    prisma.user.updateMany({ where: { role: 'agent', branch: branch.name }, data: { branch: newName } }),
  ]);

  res.json({ branch: updated });
});

// Kalkile revni BLICPay pou yon peryòd espesifik, detaye pa sous. Peryòd yo
// aksepte: "day" (jodi a), "week" (semèn nan, kòmanse Lendi), "month" (mwa sa
// a), "year" (ane sa a), "all" (tout tan). N ap ajoute lòt sous revni (egzanp
// enterè Prè) lè fonksyonalite sa yo vin aktif. Souvni: frè retrè yo sèlman
// konte lè retrè a "confirmed" — sipoze si yon retrè "rejected" ranbouse
// kliyan an nèt (montan + frè).
adminRouter.get('/finance/summary', requireAdminOrAgent, async (req, res) => {
  const period = req.query.period || 'month';
  const now = new Date();
  let start;
  if (period === 'day') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    const day = now.getDay(); // 0 = Dimanch
    const diffToMonday = day === 0 ? 6 : day - 1;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
  } else if (period === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else if (period === 'all') {
    start = new Date(0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1); // "month" (defo)
  }

  const [paidMemberships, paidPenalties, confirmedWithdrawals] = await Promise.all([
    prisma.solMembership.findMany({
      where: { integrationFeePaid: true, integrationFeePaidAt: { gte: start } },
      include: { group: { select: { amount: true, maxMembers: true } } },
    }),
    prisma.solContribution.aggregate({
      where: { status: 'paid', paidAt: { gte: start }, penaltyAmount: { gt: 0 } },
      _sum: { penaltyAmount: true },
    }),
    prisma.withdrawal.aggregate({
      where: { status: 'confirmed', createdAt: { gte: start } },
      _sum: { fee: true },
    }),
  ]);

  const solIntegrationFees = paidMemberships.reduce(
    (sum, m) => sum + Math.round(m.group.amount * m.group.maxMembers * SOL_INTEGRATION_FEE_RATE),
    0,
  );
  const solPenalties = paidPenalties._sum.penaltyAmount || 0;
  const withdrawalFees = confirmedWithdrawals._sum.fee || 0;

  // Volim total platfòm nan (pa jis sa ajan konfime an biwo) — sa a ba nou
  // vrè volim brit la, ki gen ladan depo MonCash otomatik yo tou.
  const [totalDepositAgg, totalWithdrawalAgg] = await Promise.all([
    prisma.deposit.aggregate({ where: { status: 'confirmed', confirmedAt: { gte: start } }, _sum: { amount: true } }),
    prisma.withdrawal.aggregate({ where: { status: 'confirmed', createdAt: { gte: start } }, _sum: { amount: true } }),
  ]);
  const totalDepositVolume = totalDepositAgg._sum.amount || 0;
  const totalWithdrawalVolume = totalWithdrawalAgg._sum.amount || 0;

  // Kantite kliyan INIK platfòm nan sèvi pandan peryòd la — tout depo/retrè
  // konfime, ke se yon ajan ki konfime l oswa li otomatik (MonCash).
  const [allConfirmedDepositUsers, allConfirmedWithdrawalUsers] = await Promise.all([
    prisma.deposit.findMany({ where: { status: 'confirmed', confirmedAt: { gte: start } }, select: { userId: true } }),
    prisma.withdrawal.findMany({ where: { status: 'confirmed', createdAt: { gte: start } }, select: { userId: true } }),
  ]);
  const totalUniqueClients = new Set([
    ...allConfirmedDepositUsers.map((d) => d.userId),
    ...allConfirmedWithdrawalUsers.map((w) => w.userId),
  ]).size;

  // Detay pa siikisal: pou chak depo/retrè konfime pandan peryòd la, jwenn
  // biwo ajan ki konfime l la te travay ladan l (gras a `confirmedBy`), PLIS
  // konbyen KLIYAN INIK (pa kont tranzaksyon) chak biwo sèvi pandan peryòd la.
  const [confirmedDeposits, confirmedWithdrawalsFull] = await Promise.all([
    prisma.deposit.findMany({
      where: { status: 'confirmed', confirmedAt: { gte: start }, confirmedBy: { not: null } },
      select: { amount: true, confirmedBy: true, userId: true },
    }),
    prisma.withdrawal.findMany({
      where: { status: 'confirmed', createdAt: { gte: start }, confirmedBy: { not: null } },
      select: { amount: true, fee: true, confirmedBy: true, userId: true },
    }),
  ]);

  const agentIds = [...new Set([
    ...confirmedDeposits.map((d) => d.confirmedBy),
    ...confirmedWithdrawalsFull.map((w) => w.confirmedBy),
  ])].filter((id) => id && id !== 'moncash-auto');

  const agents = await prisma.user.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, branch: true },
  });
  const branchByUserId = Object.fromEntries(agents.map((a) => [a.id, a.branch || 'San siikisal']));

  const byBranch = {};
  const clientSetByBranch = {};
  const allBranches = await prisma.branch.findMany({ select: { name: true } });
  for (const b of allBranches) {
    byBranch[b.name] = { volume: 0, fees: 0, count: 0, depositVolume: 0, withdrawalVolume: 0, depositCount: 0, withdrawalCount: 0 };
    clientSetByBranch[b.name] = new Set();
  }
  const addToBranch = (branch, { volume = 0, fees = 0, count = 0, depositVolume = 0, withdrawalVolume = 0, depositCount = 0, withdrawalCount = 0 }) => {
    if (!byBranch[branch]) byBranch[branch] = { volume: 0, fees: 0, count: 0, depositVolume: 0, withdrawalVolume: 0, depositCount: 0, withdrawalCount: 0 };
    if (!clientSetByBranch[branch]) clientSetByBranch[branch] = new Set();
    byBranch[branch].volume += volume;
    byBranch[branch].fees += fees;
    byBranch[branch].count += count;
    byBranch[branch].depositVolume += depositVolume;
    byBranch[branch].withdrawalVolume += withdrawalVolume;
    byBranch[branch].depositCount += depositCount;
    byBranch[branch].withdrawalCount += withdrawalCount;
  };

  for (const d of confirmedDeposits) {
    const branch = branchByUserId[d.confirmedBy];
    if (branch) {
      addToBranch(branch, { volume: d.amount, count: 1, depositVolume: d.amount, depositCount: 1 });
      clientSetByBranch[branch].add(d.userId);
    }
  }
  for (const w of confirmedWithdrawalsFull) {
    const branch = branchByUserId[w.confirmedBy];
    if (branch) {
      addToBranch(branch, { volume: w.amount, fees: w.fee, count: 1, withdrawalVolume: w.amount, withdrawalCount: 1 });
      clientSetByBranch[branch].add(w.userId);
    }
  }
  for (const branch of Object.keys(byBranch)) {
    byBranch[branch].uniqueClients = clientSetByBranch[branch] ? clientSetByBranch[branch].size : 0;
  }

  // Konte konbyen ajan aktif (pa bloke) chak siikisal genyen — endepandan de
  // si yo te konfime yon bagay pandan peryòd sa a oswa non.
  const allAgents = await prisma.user.findMany({
    where: { role: 'agent', blocked: false },
    select: { branch: true },
  });
  const agentCountByBranch = {};
  for (const a of allAgents) {
    const branch = a.branch || 'San siikisal';
    agentCountByBranch[branch] = (agentCountByBranch[branch] || 0) + 1;
  }
  for (const branch of Object.keys(byBranch)) {
    byBranch[branch].agentCount = agentCountByBranch[branch] || 0;
  }

  const sortedByBranch = Object.fromEntries(
    Object.entries(byBranch).sort((a, b) => b[1].fees - a[1].fees),
  );

  // Volim jou pa jou (depo/retrè konfime), pou grafik la — limite a peryòd
  // la si li kout, oswa 30 dènye jou yo si peryòd la pi long pase sa.
  const chartStart = period === 'all' || period === 'year'
    ? new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    : start;
  const [chartDeposits, chartWithdrawals] = await Promise.all([
    prisma.deposit.findMany({
      where: { status: 'confirmed', confirmedAt: { gte: chartStart } },
      select: { amount: true, confirmedAt: true },
    }),
    prisma.withdrawal.findMany({
      where: { status: 'confirmed', createdAt: { gte: chartStart } },
      select: { amount: true, createdAt: true },
    }),
  ]);
  const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
  const dailyMap = {};
  for (const d of chartDeposits) {
    const k = dayKey(d.confirmedAt);
    if (!dailyMap[k]) dailyMap[k] = { date: k, deposits: 0, withdrawals: 0 };
    dailyMap[k].deposits += d.amount;
  }
  for (const w of chartWithdrawals) {
    const k = dayKey(w.createdAt);
    if (!dailyMap[k]) dailyMap[k] = { date: k, deposits: 0, withdrawals: 0 };
    dailyMap[k].withdrawals += w.amount;
  }
  const dailyVolume = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // Pwodwi 100% dijital — pa gen siikisal ki enplike, se lajan kliyan an
  // k ap deplase anndan pwòp kont li.
  const [pocketAgg, activeGoalsAgg, completedGoalsCount, activeLoansAgg] = await Promise.all([
    prisma.pocket.aggregate({ _sum: { balance: true }, _count: true }),
    prisma.savingsGoal.aggregate({ where: { status: 'active' }, _sum: { saved: true }, _count: true }),
    prisma.savingsGoal.count({ where: { status: 'completed' } }),
    prisma.loan.aggregate({ where: { status: 'active' }, _sum: { totalDue: true, amount: true }, _count: true }),
  ]);

  // Volim pa gwoup Sòl: potansyèl (montan × kantite manm maks) vs sa ki
  // deja kolekte (kotizasyon peye), pou gwoup ki gen manm apwouve.
  const solGroups = await prisma.solGroup.findMany({
    where: { memberships: { some: { status: 'approved' } } },
    select: {
      id: true, name: true, tier: true, frequency: true, amount: true, maxMembers: true,
      memberships: { where: { status: 'approved' }, select: { id: true } },
      contributions: { where: { status: 'paid' }, select: { amount: true, penaltyAmount: true } },
    },
  });
  const solGroupVolumes = solGroups.map((g) => ({
    name: g.name, tier: g.tier, frequency: g.frequency,
    memberCount: g.memberships.length, maxMembers: g.maxMembers,
    potential: g.amount * g.maxMembers,
    collected: g.contributions.reduce((sum, c) => sum + c.amount, 0),
  })).sort((a, b) => b.potential - a.potential);

  // Yon AJAN sèlman gen dwa wè volim PWÒP SIIKISAL LI — pa okenn lòt siikisal,
  // pa detay revni entèn, ni pwodwi dijital/gwoup Sòl (sa yo se pou sipè admin).
  if (req.user.role === 'agent') {
    const agent = await prisma.user.findUnique({ where: { id: req.user.id }, select: { branch: true } });
    const myBranch = agent?.branch || null;
    const myStats = (myBranch && sortedByBranch[myBranch]) || {
      volume: 0, fees: 0, count: 0, depositVolume: 0, withdrawalVolume: 0, depositCount: 0, withdrawalCount: 0, agentCount: 0, uniqueClients: 0,
    };
    return res.json({
      period,
      since: start,
      myBranch,
      totalDepositVolume: myStats.depositVolume,
      totalWithdrawalVolume: myStats.withdrawalVolume,
      totalUniqueClients: myStats.uniqueClients,
      byBranch: myBranch ? { [myBranch]: myStats } : {},
    });
  }

  res.json({
    period,
    since: start,
    breakdown: {
      solIntegrationFees,
      solPenalties,
      withdrawalFees,
    },
    total: solIntegrationFees + solPenalties + withdrawalFees,
    totalDepositVolume,
    totalWithdrawalVolume,
    totalUniqueClients,
    byBranch: sortedByBranch,
    dailyVolume,
    digitalProducts: {
      pockets: { totalBalance: pocketAgg._sum.balance || 0, activeCount: pocketAgg._count || 0 },
      goals: { totalSaved: activeGoalsAgg._sum.saved || 0, activeCount: activeGoalsAgg._count || 0, completedCount: completedGoalsCount },
      loans: { totalOutstanding: activeLoansAgg._sum.totalDue || 0, totalDisbursed: activeLoansAgg._sum.amount || 0, activeCount: activeLoansAgg._count || 0 },
    },
    solGroups: solGroupVolumes,
  });
});

// Admin ka fòse netwayaj depo MonCash ki rete "pending" plis pase 24è san
// pa tann pwochen tantativ yon kliyan.
adminRouter.post('/deposits/moncash/expire-stale', requireAdmin, async (req, res) => {
  await expireStaleMoncashDeposits();
  res.json({ ok: true });
});

adminRouter.get('/deposits/pending', requireAdminOrAgent, async (req, res) => {
  let agentBranch = null;
  if (req.user.role === 'agent') {
    const agent = await prisma.user.findUnique({ where: { id: req.user.id }, select: { branch: true } });
    agentBranch = agent?.branch || null;
  }

  const deposits = await prisma.deposit.findMany({
    // Depo MonCash yo TOUJOU otomatik (webhook konfime yo, oswa yo ekspire
    // apre 24è si kliyan an pa fini peman an) — yo pa dwe janm parèt isit
    // la pou konfimasyon MANYÈL, paske sa ta pèmèt kredite yon montan
    // pèsonn pa reyèlman verifye.
    //
    // Yon AJAN sèlman wè demand "biwo" ki matche pwòp siikisal li — lòt
    // metòd yo (NatCash, elt.) pa gen rapò ak yon kote fizik, kidonk tout
    // ajan ka wè yo.
    where: {
      status: 'pending',
      method: { not: 'moncash' },
      ...(agentBranch ? { OR: [{ method: { not: 'biwo' } }, { branch: agentBranch }] } : {}),
    },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ deposits });
});

// Istorik KONPLE tout depo yo (konfime, refize, ak toujou k ap tann), pou
// admin/ajan ka gade sa ki te pase deja — pa jis demand ki poko trete.
adminRouter.get('/deposits/history', requireAdminOrAgent, async (req, res) => {
  let agentBranch = null;
  if (req.user.role === 'agent') {
    const agent = await prisma.user.findUnique({ where: { id: req.user.id }, select: { branch: true } });
    agentBranch = agent?.branch || null;
  }

  const deposits = await prisma.deposit.findMany({
    where: {
      ...(agentBranch ? { OR: [{ method: { not: 'biwo' } }, { branch: agentBranch }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ deposits });
});

// Confirming a deposit and crediting the balance happen in one atomic
// transaction so a crash between the two steps can never leave the
// deposit marked confirmed without the money actually landing in the
// user's balance (or vice versa).
adminRouter.post('/deposits/:id/confirm', requireAdminOrAgent, async (req, res) => {
  const deposit = await prisma.deposit.findUnique({ where: { id: req.params.id } });

  if (!deposit) return res.status(404).json({ error: 'Depo a pa jwenn.' });
  if (deposit.status !== 'pending') {
    return res.status(409).json({ error: 'Depo sa a deja trete.' });
  }
  if (deposit.method === 'moncash') {
    return res.status(409).json({
      error: 'Depo MonCash yo konfime otomatikman — yo pa ka konfime alamen. Si li rete "pending", se paske peman an poko fini.',
    });
  }
  const branchError = await checkAgentBranchAccess(req, deposit);
  if (branchError) return res.status(403).json({ error: branchError });

  const [, updatedUser] = await prisma.$transaction([
    prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: 'confirmed', confirmedAt: new Date(), confirmedBy: req.user.id },
    }),
    prisma.user.update({
      where: { id: deposit.userId },
      data: { balance: { increment: deposit.amount } },
    }),
  ]);

  await notifyUser(deposit.userId, {
    title: 'Depo konfime',
    body: `Depo ${deposit.amount.toLocaleString('fr-FR')} HTG ou a konfime — lajan an nan balans ou.`,
    type: 'deposit',
  });

  res.json({ ok: true, newBalance: updatedUser.balance });
});

adminRouter.post('/deposits/:id/reject', requireAdminOrAgent, async (req, res) => {
  const deposit = await prisma.deposit.findUnique({ where: { id: req.params.id } });
  if (!deposit) return res.status(404).json({ error: 'Depo a pa jwenn.' });
  if (deposit.status !== 'pending') {
    return res.status(409).json({ error: 'Depo sa a deja trete.' });
  }
  const branchError = await checkAgentBranchAccess(req, deposit);
  if (branchError) return res.status(403).json({ error: branchError });

  await prisma.deposit.update({
    where: { id: deposit.id },
    data: { status: 'rejected', confirmedAt: new Date(), confirmedBy: req.user.id },
  });

  await notifyUser(deposit.userId, {
    title: 'Depo refize',
    body: `Depo ${deposit.amount.toLocaleString('fr-FR')} HTG ou a refize. Kontakte sipò si w panse gen yon erè.`,
    type: 'deposit',
  });

  res.json({ ok: true });
});

// ---- BLIC Sòl: apwobasyon adhezyon ----

adminRouter.get('/sol/requests/pending', requireAdmin, async (req, res) => {
  const requests = await prisma.solMembership.findMany({
    where: { status: 'pending' },
    orderBy: { requestedAt: 'asc' },
    include: {
      user: { select: { fullName: true, phone: true } },
      group: { select: { id: true, name: true, tier: true, frequency: true, amount: true, maxMembers: true } },
    },
  });

  // Pou chak gwoup ki gen yon demand, jwenn ki pozisyon ki deja pran, pou
  // admin ka wè ki plas ki lib pou chwazi.
  const groupIds = [...new Set(requests.map((r) => r.groupId))];
  const approvedByGroup = await prisma.solMembership.findMany({
    where: { groupId: { in: groupIds }, status: 'approved' },
    select: { groupId: true, turnIndex: true },
  });
  const takenMap = {};
  for (const m of approvedByGroup) {
    const g = (takenMap[m.groupId] = takenMap[m.groupId] || {});
    g[m.turnIndex + 1] = (g[m.turnIndex + 1] || 0) + 1;
  }

  res.json({
    requests: requests.map((r) => ({ ...r, positionCounts: takenMap[r.groupId] || {} })),
  });
});

// Apwouve yon demand — sa bay moun nan yon pozisyon nan wotasyon an (turnIndex)
// epi li vin konte kòm yon manm reyèl gwoup la. Fèt nan yon transaksyon pou
// evite de moun pran menm pozisyon an si de admin apwouve an menm tan.
// Apwouve yon demand — admin nan ka chwazi pozisyon nan wotasyon an (1ye plas,
// 2yèm, elatriye). Si li pa chwazi youn, nou bay premye pozisyon ki lib la.
const SOL_INTEGRATION_FEE_RATE = 0.015; // 1.5% — chaje sèlman lè admin apwouve manm nan

// Nenpòt retrè mande yon prèv (foto resi/kapti) OBLIGATWA anvan li ka
// konfime — pwoteksyon kont fwod, kèlkeswa gwosè montan an.

// ---- Rezèv manyèl pa metòd (MonCash, NatCash) ----

adminRouter.get('/reserves', requireAdminOrAgent, async (req, res) => {
  const reserves = await prisma.platformReserve.findMany({ orderBy: { method: 'asc' } });
  res.json({ reserves });
});

// Sèlman sipè admin ka modifye rezèv la — se yon chif ki afekte desizyon
// finansye, pa yon aksyon operasyonèl debaz tankou konfime yon depo/retrè.
adminRouter.patch('/reserves/:method', requireAdmin, async (req, res) => {
  const { method } = req.params;
  const { balance } = req.body;
  const numericBalance = Number(balance);
  if (!['moncash', 'natcash'].includes(method)) {
    return res.status(400).json({ error: 'Metòd sa a pa sipòte pou rezèv.' });
  }
  if (!Number.isFinite(numericBalance) || numericBalance < 0) {
    return res.status(400).json({ error: 'Balans lan pa valab.' });
  }

  const reserve = await prisma.platformReserve.upsert({
    where: { method },
    update: { balance: Math.round(numericBalance), updatedBy: req.user.id },
    create: { method, balance: Math.round(numericBalance), updatedBy: req.user.id },
  });
  res.json({ reserve });
});


adminRouter.post('/sol/requests/:id/approve', requireAdmin, async (req, res) => {
  const { turnIndex } = req.body; // pozisyon 1-endekse (1 = premye plas), opsyonèl
  const membership = await prisma.solMembership.findUnique({ where: { id: req.params.id }, include: { group: true } });
  if (!membership) return res.status(404).json({ error: 'Demand sa a pa jwenn.' });
  if (membership.status !== 'pending') {
    return res.status(409).json({ error: 'Demand sa a deja trete.' });
  }
  if (!membership.integrationFeePaid) {
    return res.status(409).json({ error: 'Kliyan an poko peye frè entegrasyon li a — ou pa ka apwouve toujou.' });
  }

  const approvedMembers = await prisma.solMembership.findMany({ where: { groupId: membership.groupId, status: 'approved' } });

  // Pozisyon yo ka gen jiska 2 manm (egzanp: 2 vre kliyan k ap pataje menm
  // pozisyon an). Konte konbyen moun ki deja nan chak pozisyon olye senpman
  // tcheke si l "pran" oswa non. Pozisyon 1-5 rete VID espre pou tout Sòl —
  // pèsonn pa ka apwouve la, se rezèv gwoup la sèlman.
  const POSITION_CAPACITY = 2;
  const FIRST_ASSIGNABLE_POSITION = 5; // pozisyon 6 (0-endekse: 5)
  const occupancyCount = {};
  for (const m of approvedMembers) {
    occupancyCount[m.turnIndex] = (occupancyCount[m.turnIndex] || 0) + 1;
  }

  let position;
  if (turnIndex != null) {
    position = Number(turnIndex) - 1;
    if (!Number.isInteger(position) || position < 0 || position >= membership.group.maxMembers) {
      return res.status(400).json({ error: 'Pozisyon an pa valab.' });
    }
    if (position < FIRST_ASSIGNABLE_POSITION) {
      return res.status(409).json({ error: `Pozisyon 1 a ${FIRST_ASSIGNABLE_POSITION} rete vid espre — pa gen manm ki ka mete la.` });
    }
    if ((occupancyCount[position] || 0) >= POSITION_CAPACITY) {
      return res.status(409).json({ error: 'Pozisyon sa a deja plen.' });
    }
  } else {
    position = FIRST_ASSIGNABLE_POSITION;
    while ((occupancyCount[position] || 0) >= POSITION_CAPACITY) position++;
    if (position >= membership.group.maxMembers) {
      return res.status(409).json({ error: 'Gwoup sa a konplè deja — pa ka apwouve ankò.' });
    }
  }

  const updated = await prisma.solMembership.update({
    where: { id: membership.id },
    data: { status: 'approved', turnIndex: position, decidedAt: new Date(), decidedBy: req.user.id },
  });

  await notifyUser(membership.userId, {
    title: 'Demand Sòl apwouve',
    body: `Ou antre nan gwoup "${membership.group.name}" — pozisyon #${position + 1} nan wotasyon an.`,
    type: 'sol',
  });

  res.json({ ok: true, membership: updated });
});

// Chanje pozisyon yon manm ki deja apwouve (pou reòganize wotasyon an).
adminRouter.patch('/sol/groups/:groupId/members/:membershipId/position', requireAdmin, async (req, res) => {
  const { turnIndex } = req.body;
  const position = Number(turnIndex) - 1;

  const group = await prisma.solGroup.findUnique({ where: { id: req.params.groupId } });
  if (!group) return res.status(404).json({ error: 'Gwoup sa a pa jwenn.' });
  if (!Number.isInteger(position) || position < 0 || position >= group.maxMembers) {
    return res.status(400).json({ error: 'Pozisyon an pa valab.' });
  }

  const membership = await prisma.solMembership.findFirst({
    where: { id: req.params.membershipId, groupId: req.params.groupId, status: 'approved' },
  });
  if (!membership) return res.status(404).json({ error: 'Manm sa a pa jwenn.' });

  const conflict = await prisma.solMembership.findFirst({
    where: { groupId: req.params.groupId, status: 'approved', turnIndex: position, NOT: { id: membership.id } },
  });
  if (conflict) return res.status(409).json({ error: 'Pozisyon sa a deja pran pa yon lòt manm.' });

  const updated = await prisma.solMembership.update({ where: { id: membership.id }, data: { turnIndex: position } });
  res.json({ ok: true, membership: updated });
});

// ---- BLIC Sòl: wotasyon reyèl (kòmanse gwoup la, trete chak peryòd, eskli manm) ----

const SOL_GRACE_DAYS = 3;        // 3 premye jou yo — pa gen penalite ditou
const SOL_PENALTY_WINDOW_DAYS = 5; // 5 jou apre gras la — penalite 1%/jou akimile
const SOL_DAILY_PENALTY_RATE = 0.01;

// Admin kòmanse wotasyon an — sèlman posib lè gwoup la PLEN. Sa kreye premye
// seri kotizasyon yo (peryòd 0) pou tout manm apwouve yo.
adminRouter.post('/sol/groups/:id/start', requireAdmin, async (req, res) => {
  const group = await prisma.solGroup.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: 'Gwoup sa a pa jwenn.' });
  if (group.startedAt) return res.status(409).json({ error: 'Wotasyon sa a deja kòmanse.' });

  const approvedMembers = await prisma.solMembership.findMany({ where: { groupId: group.id, status: 'approved' } });

  // Nan sistèm sa a, pozisyon 1 a 5 rete VID espre (pèsonn pa resevwa pandan
  // 5 premye mwa yo — kotizasyon yo jis akimile kòm rezèv). Sèlman pozisyon
  // 6 a 10 (turnIndex 5-9) bezwen omwen 1 manm chak pou gwoup la ka kòmanse.
  const occupiedTurns = new Set(approvedMembers.map((m) => m.turnIndex));
  const missingTurns = [];
  for (let i = 5; i < group.maxMembers; i++) {
    if (!occupiedTurns.has(i)) missingTurns.push(i + 1);
  }
  if (missingTurns.length > 0) {
    return res.status(409).json({ error: `Gwoup la poko plen — pozisyon ${missingTurns.join(', ')} pa gen okenn manm.` });
  }

  const updatedGroup = await prisma.$transaction(async (tx) => {
    const g = await tx.solGroup.update({ where: { id: group.id }, data: { startedAt: new Date() } });
    await tx.solContribution.createMany({
      data: approvedMembers.map((m) => ({
        membershipId: m.id,
        groupId: group.id,
        period: 0,
        amount: group.amount,
      })),
    });
    return g;
  });

  const dates = getPeriodDates(updatedGroup, 0);
  for (const m of approvedMembers) {
    await notifyUser(m.userId, {
      title: 'Wotasyon Sòl kòmanse',
      body: dates ? `Gwoup "${group.name}" kòmanse — kotizasyon ou dwe peye anvan ${formatHtDate(dates.deadline)}.` : `Gwoup "${group.name}" kòmanse.`,
      type: 'sol',
    });
  }

  res.json({ ok: true, group: updatedGroup });
});

// Admin "trete" peryòd aktyèl la: eseye kolekte kotizasyon tout manm ki poko
// peye, aplike gras/penalite si nesesè, epi vèse pòch la si TOUT MOUN peye.
adminRouter.post('/sol/groups/:id/process-period', requireAdmin, async (req, res) => {
  const group = await prisma.solGroup.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: 'Gwoup sa a pa jwenn.' });
  if (!group.startedAt) return res.status(409).json({ error: 'Wotasyon sa a poko kòmanse.' });
  if (group.completedAt) return res.status(409).json({ error: 'Wotasyon sa a fini deja.' });

  const contributions = await prisma.solContribution.findMany({
    where: { groupId: group.id, period: group.currentTurn },
    include: { membership: true },
  });

  const now = new Date();
  const results = [];

  for (const c of contributions) {
    if (c.status === 'paid') { results.push({ id: c.id, status: 'paid' }); continue; }

    if (c.status === 'overdue') {
      // Depase gras + penalite — pa gen plis tantativ otomatik, admin dwe deside.
      results.push({ id: c.id, status: 'overdue' });
      continue;
    }

    const alreadyReceivedPayout = c.membership.turnIndex != null && c.membership.turnIndex < group.currentTurn;
    const daysSinceFail = c.firstFailedAt ? Math.floor((now - new Date(c.firstFailedAt)) / 86400000) : null;
    let currentPenalty = c.penaltyAmount;
    if (!alreadyReceivedPayout && daysSinceFail != null && daysSinceFail > SOL_GRACE_DAYS) {
      const penaltyDays = Math.min(daysSinceFail - SOL_GRACE_DAYS, SOL_PENALTY_WINDOW_DAYS);
      currentPenalty = Math.round(c.amount * SOL_DAILY_PENALTY_RATE * penaltyDays);
    }
    const totalDue = c.amount + currentPenalty;

    const deduction = await prisma.user.updateMany({
      where: { id: c.membership.userId, balance: { gte: totalDue } },
      data: { balance: { decrement: totalDue } },
    });

    if (deduction.count > 0) {
      await prisma.solContribution.update({
        where: { id: c.id },
        data: { status: 'paid', paidAt: now, penaltyAmount: currentPenalty },
      });
      results.push({ id: c.id, status: 'paid', penalty: currentPenalty });
    } else {
      // Echwe — detèmine nouvo estati a. Yon moun ki DEJA resevwa pòch li pa
      // jwenn fenèt penalite a: apre 3 jou gras, li ale dirèkteman nan
      // "overdue" (rekouvreman) paske yon senp frè pa yon bon ensitasyon
      // pou yon moun ki deja jwenn sa l vle.
      if (!c.firstFailedAt) {
        await prisma.solContribution.update({ where: { id: c.id }, data: { firstFailedAt: now, status: 'late' } });
        await notifyUser(c.membership.userId, {
          title: 'Kotizasyon Sòl pa peye',
          body: alreadyReceivedPayout
            ? `Ou gen ${SOL_GRACE_DAYS} jou pou regilarize kotizasyon Sòl ou.`
            : `Ou pa gen ase lajan pou kotizasyon Sòl ou. Ou gen ${SOL_GRACE_DAYS} jou gras anvan penalite kòmanse.`,
          type: 'sol',
        });
        results.push({ id: c.id, status: 'late', penalty: 0 });
      } else if (!alreadyReceivedPayout && daysSinceFail <= SOL_GRACE_DAYS + SOL_PENALTY_WINDOW_DAYS) {
        await prisma.solContribution.update({ where: { id: c.id }, data: { status: 'late', penaltyAmount: currentPenalty } });
        results.push({ id: c.id, status: 'late', penalty: currentPenalty });
      } else if (alreadyReceivedPayout && daysSinceFail <= SOL_GRACE_DAYS) {
        // Toujou nan 3 jou gras yo — pa gen chanjman estati toujou.
        results.push({ id: c.id, status: 'late', penalty: 0 });
      } else {
        await prisma.solContribution.update({ where: { id: c.id }, data: { status: 'overdue', penaltyAmount: currentPenalty } });
        await notifyUser(c.membership.userId, {
          title: 'Kotizasyon Sòl an reta serye',
          body: alreadyReceivedPayout
            ? 'Ou deja resevwa pòch ou pou Sòl sa a, men ou pa peye kotizasyon ou — yon admin BLICPay ap kontakte w.'
            : 'Delè gras ak penalite a pase — yon admin BLICPay ap kontakte w pou desizyon final.',
          type: 'sol',
        });
        results.push({ id: c.id, status: 'overdue', penalty: currentPenalty });
      }
    }
  }

  const allPaid = results.every((r) => r.status === 'paid');
  let payouts = [];

  const totalApproved = await prisma.solMembership.count({ where: { groupId: group.id, status: 'approved' } });

  if (allPaid && contributions.length === totalApproved) {
    // Pozisyon 1-5 rete VID espre — pandan peryòd sa yo, pèsonn pa resevwa,
    // kotizasyon yo jis vin ogmante rezèv gwoup la. Pozisyon 6-10 gen 2 manm
    // chak — toude resevwa yon pòch KONPLÈ, konpanse pa rezèv la akimile a.
    const recipients = await prisma.solMembership.findMany({
      where: { groupId: group.id, status: 'approved', turnIndex: group.currentTurn },
    });

    const potAmount = group.amount * group.maxMembers;
    let reserveDelta = 0;

    if (recipients.length === 0) {
      // Pa gen benefisyè pou peryòd sa a — kotizasyon yo ale nan rezèv la.
      reserveDelta = potAmount;
    } else {
      for (const recipient of recipients) {
        await prisma.user.update({
          where: { id: recipient.userId },
          data: { balance: { increment: potAmount }, solPayoutBalance: { increment: potAmount } },
        });
        await prisma.solPayout.create({
          data: { groupId: group.id, userId: recipient.userId, period: group.currentTurn, amount: potAmount },
        });
        await notifyUser(recipient.userId, {
          title: 'Ou resevwa pòch Sòl ou',
          body: `Ou resevwa ${potAmount.toLocaleString('fr-FR')} HTG pou "${group.name}".`,
          type: 'sol',
        });
        payouts.push({ userId: recipient.userId, amount: potAmount });
      }
      // Premye benefisyè a peye ak kotizasyon peryòd sa a; nenpòt benefisyè
      // anplis (2yèm nan, pa egzanp) peye ak rezèv akimile a.
      reserveDelta = potAmount - (recipients.length * potAmount);
    }

    await prisma.solGroup.update({ where: { id: group.id }, data: { reserveBalance: { increment: reserveDelta } } });

    const nextTurn = group.currentTurn + 1;
    if (nextTurn >= group.maxMembers) {
      await prisma.solGroup.update({ where: { id: group.id }, data: { completedAt: new Date() } });
    } else {
      const approvedMembers = await prisma.solMembership.findMany({ where: { groupId: group.id, status: 'approved' } });
      await prisma.solGroup.update({ where: { id: group.id }, data: { currentTurn: nextTurn } });
      await prisma.solContribution.createMany({
        data: approvedMembers.map((m) => ({
          membershipId: m.id,
          groupId: group.id,
          period: nextTurn,
          amount: group.amount,
        })),
      });
    }
  }

  res.json({ ok: true, results, payouts, allPaid });
});

// Admin eskli yon manm apre twòp reta oswa yon defo apre li fin resevwa pòch
// li — bannisman an PÈMANAN pou Sòl AK Prè, men lòt sèvis yo rete aksesib.
adminRouter.post('/sol/memberships/:id/exclude', requireAdmin, async (req, res) => {
  const membership = await prisma.solMembership.findUnique({ where: { id: req.params.id } });
  if (!membership) return res.status(404).json({ error: 'Manm sa a pa jwenn.' });

  await prisma.$transaction([
    prisma.solMembership.update({
      where: { id: membership.id },
      data: { status: 'excluded', decidedAt: new Date(), decidedBy: req.user.id },
    }),
    prisma.user.update({ where: { id: membership.userId }, data: { creditBanned: true } }),
  ]);

  await notifyUser(membership.userId, {
    title: 'Kont ou eskli nan Sòl',
    body: 'Akòz plizyè pwoblèm peman, ou pa ka patisipe nan okenn Sòl oswa Prè ankò. Lòt sèvis BLICPay yo rete disponib.',
    type: 'sol',
  });

  res.json({ ok: true });
});

adminRouter.post('/sol/requests/:id/reject', requireAdmin, async (req, res) => {
  const membership = await prisma.solMembership.findUnique({ where: { id: req.params.id }, include: { group: true } });
  if (!membership) return res.status(404).json({ error: 'Demand sa a pa jwenn.' });
  if (membership.status !== 'pending') {
    return res.status(409).json({ error: 'Demand sa a deja trete.' });
  }

  await prisma.solMembership.update({
    where: { id: membership.id },
    data: { status: 'rejected', decidedAt: new Date(), decidedBy: req.user.id },
  });

  // Si kliyan an te deja peye frè entegrasyon an, remèt li — refi a pa fòt li.
  let refundedFee = 0;
  if (membership.integrationFeePaid) {
    refundedFee = Math.round(membership.group.amount * membership.group.maxMembers * SOL_INTEGRATION_FEE_RATE);
    await prisma.user.update({ where: { id: membership.userId }, data: { balance: { increment: refundedFee } } });
  }

  await notifyUser(membership.userId, {
    title: 'Demand Sòl refize',
    body: refundedFee > 0
      ? `Demand ou pou antre nan gwoup "${membership.group.name}" refize. Nou remèt ${refundedFee.toLocaleString('fr-FR')} HTG frè entegrasyon ou te peye a.`
      : `Demand ou pou antre nan gwoup "${membership.group.name}" refize.`,
    type: 'sol',
  });

  res.json({ ok: true, refundedFee });
});

// ---- Itilizatè: rechèch, bloke/debloke, verifye, ajiste balans ----

adminRouter.get('/users', requireAdmin, async (req, res) => {
  const { search } = req.query;
  const users = await prisma.user.findMany({
    where: search
      ? { OR: [{ fullName: { contains: search } }, { phone: { contains: search } }] }
      : undefined,
    orderBy: { createdAt: 'desc' },
    select: { id: true, fullName: true, phone: true, role: true, balance: true, verified: true, blocked: true, createdAt: true },
  });
  res.json({ users });
});

adminRouter.get('/users/:id', requireAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, fullName: true, phone: true, role: true, balance: true, verified: true, blocked: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: 'Itilizatè a pa jwenn.' });

  const deposits = await prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 });
  const solMemberships = await prisma.solMembership.findMany({
    where: { userId: user.id },
    include: {
      group: true,
      documents: { select: { id: true, title: true, fileMimeType: true, fileName: true, uploadedAt: true } },
    },
  });

  res.json({ user, deposits, solMemberships });
});

// ---- BLIC Sòl: dokiman siyen pou yon adezyon espesifik (fòm enfòmasyon, kontra
// siyen an biwo, elatriye). Admin telechaje yo apre li resevwa yo (email/
// WhatsApp/biwo) — kliyan ka sèlman gade yo, li pa ka modifye anyen.

adminRouter.post('/sol/memberships/:id/documents', requireAdmin, async (req, res) => {
  const { title, fileData, fileMimeType, fileName } = req.body;
  if (!title?.trim() || !fileData || !fileMimeType) {
    return res.status(400).json({ error: 'Tit, dokiman an, ak kalite fichye a obligatwa.' });
  }

  const membership = await prisma.solMembership.findUnique({ where: { id: req.params.id } });
  if (!membership) return res.status(404).json({ error: 'Adezyon sa a pa jwenn.' });

  const doc = await prisma.solDocument.create({
    data: {
      membershipId: membership.id,
      title: title.trim(),
      fileData,
      fileMimeType,
      fileName: fileName || null,
      uploadedBy: req.user.id,
    },
  });

  await notifyUser(membership.userId, {
    title: 'Nouvo dokiman disponib',
    body: `Nou ajoute yon nouvo dokiman ("${doc.title}") nan dosye Sòl ou.`,
    type: 'sol',
  });

  res.status(201).json({ ok: true, document: { id: doc.id, title: doc.title, uploadedAt: doc.uploadedAt } });
});

adminRouter.patch('/sol/memberships/:id/form-approve', requireAdmin, async (req, res) => {
  const { approved } = req.body;
  const membership = await prisma.solMembership.findUnique({ where: { id: req.params.id } });
  if (!membership) return res.status(404).json({ error: 'Adezyon sa a pa jwenn.' });

  const updated = await prisma.solMembership.update({
    where: { id: membership.id },
    data: {
      formApproved: !!approved,
      formDecidedAt: new Date(),
      formDecidedBy: req.user.id,
    },
  });

  await notifyUser(membership.userId, {
    title: approved ? 'Dokiman Sòl konfime' : 'Dokiman Sòl an atant',
    body: approved
      ? 'Nou konfime nou resevwa dokiman ki nesesè pou Sòl sa a.'
      : 'Estati dokiman Sòl ou chanje — kontakte sipò si ou gen kesyon.',
    type: 'sol',
  });

  res.json({ ok: true, formApproved: updated.formApproved });
});

adminRouter.patch('/users/:id/block', requireAdmin, async (req, res) => {
  const { blocked } = req.body;
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { blocked: !!blocked } });
  res.json({ ok: true, blocked: user.blocked });
});

adminRouter.patch('/users/:id/verify', requireAdmin, async (req, res) => {
  const { verified } = req.body;
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { verified: !!verified } });
  res.json({ ok: true, verified: user.verified });
});

// Ajisteman manyèl balans — pou ka korije yon erè oswa kredite/debite san
// yon depo. `amount` ka pozitif (kredite) oswa negatif (debite).
adminRouter.post('/users/:id/adjust-balance', requireAdmin, async (req, res) => {
  const { amount, reason } = req.body;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!reason?.trim()) {
    return res.status(400).json({ error: 'Yon rezon obligatwa pou yon ajisteman manyèl.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'Itilizatè a pa jwenn.' });
  if (numericAmount < 0 && user.balance + numericAmount < 0) {
    return res.status(400).json({ error: 'Balans lan pa ka pase anba 0.' });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { balance: { increment: Math.round(numericAmount) } },
  });

  res.json({ ok: true, newBalance: updated.balance });
});

// ---- Machann yo (apèsi sèlman — jesyon konplè rete nan dashboard machann nan) ----

adminRouter.get('/merchants', requireAdmin, async (req, res) => {
  const merchants = await prisma.merchant.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, businessName: true, email: true, website: true, balance: true, createdAt: true },
  });
  res.json({ merchants });
});

// ---- BLIC Sòl: apèsi tout gwoup yo (pou paj sipèvizyon admin) ----

adminRouter.get('/sol/groups', requireAdminOrAgent, async (req, res) => {
  const allGroups = await prisma.solGroup.findMany();
  // Klase FREKANS ak NIVO nan lòd ki gen sans (pa alfabetik — "Basic,
  // Premium, Standard" pa gen sans, ni "kenzenn, mwa, semenn").
  const freqOrder = { semenn: 0, kenzenn: 1, mwa: 2 };
  const tierOrder = { basic: 0, standard: 1, premium: 2 };
  const groups = allGroups.sort((a, b) => {
    const f = (freqOrder[a.frequencyId] ?? 9) - (freqOrder[b.frequencyId] ?? 9);
    if (f !== 0) return f;
    const t = (tierOrder[a.tierId] ?? 9) - (tierOrder[b.tierId] ?? 9);
    if (t !== 0) return t;
    return a.order - b.order;
  });
  const counts = await prisma.solMembership.groupBy({
    by: ['groupId', 'status'],
    _count: true,
  });

  const countMap = {};
  for (const c of counts) {
    countMap[c.groupId] = countMap[c.groupId] || { pending: 0, approved: 0 };
    countMap[c.groupId][c.status] = c._count;
  }

  res.json({
    groups: groups.map((g) => ({
      ...g,
      approvedCount: countMap[g.id]?.approved || 0,
      pendingCount: countMap[g.id]?.pending || 0,
    })),
  });
});

// Detay yon gwoup pou admin: lis manm apwouve yo ak dat yo chak ap resevwa pòch yo.
adminRouter.get('/sol/groups/:id/members', requireAdminOrAgent, async (req, res) => {
  const group = await prisma.solGroup.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: 'Gwoup sa a pa jwenn.' });

  const memberships = await prisma.solMembership.findMany({
    where: { groupId: group.id, status: 'approved' },
    orderBy: { turnIndex: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });

  res.json({
    group,
    members: memberships.map((m) => ({
      id: m.id,
      name: m.user.fullName,
      phone: m.user.phone,
      turnIndex: m.turnIndex,
      lastPaidPeriod: m.lastPaidPeriod,
      payoutDate: memberPayoutDate(group, m.turnIndex),
    })),
  });
});

// Istorik tout pòch Sòl ki te reyèlman peye — kreye pandan "process-period"
// (gade pi wo). Pa gen restriksyon pa siikisal: Sòl pa mare ak yon biwo
// fizik, se yon aksè lekti sèlman pou ajan yo tou.
adminRouter.get('/sol/payouts', requireAdminOrAgent, async (req, res) => {
  const payouts = await prisma.solPayout.findMany({
    orderBy: { paidAt: 'desc' },
    take: 200,
    include: {
      user: { select: { fullName: true, phone: true } },
      group: { select: { name: true, tier: true, frequency: true } },
    },
  });
  res.json({ payouts });
});

// ---- Retrait ----

adminRouter.get('/withdrawals/pending', requireAdminOrAgent, async (req, res) => {
  let agentBranch = null;
  if (req.user.role === 'agent') {
    const agent = await prisma.user.findUnique({ where: { id: req.user.id }, select: { branch: true } });
    agentBranch = agent?.branch || null;
  }

  const withdrawals = await prisma.withdrawal.findMany({
    where: {
      status: 'pending',
      ...(agentBranch ? { OR: [{ method: { not: 'biwo' } }, { branch: agentBranch }] } : {}),
    },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ withdrawals });
});

// Istorik KONPLE tout retrè yo (konfime, refize, ak toujou k ap tann).
adminRouter.get('/withdrawals/history', requireAdminOrAgent, async (req, res) => {
  let agentBranch = null;
  if (req.user.role === 'agent') {
    const agent = await prisma.user.findUnique({ where: { id: req.user.id }, select: { branch: true } });
    agentBranch = agent?.branch || null;
  }

  const withdrawals = await prisma.withdrawal.findMany({
    where: {
      ...(agentBranch ? { OR: [{ method: { not: 'biwo' } }, { branch: agentBranch }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ withdrawals });
});

adminRouter.post('/withdrawals/:id/confirm', requireAdminOrAgent, async (req, res) => {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
  if (!withdrawal) return res.status(404).json({ error: 'Retrè a pa jwenn.' });
  if (withdrawal.status !== 'pending') return res.status(409).json({ error: 'Retrè sa a deja trete.' });
  const branchError = await checkAgentBranchAccess(req, withdrawal);
  if (branchError) return res.status(403).json({ error: branchError });

  const { proofImage, proofMimeType } = req.body;
  if (!proofImage) {
    return res.status(400).json({
      error: 'Ou dwe telechaje yon prèv (foto resi/tranzaksyon) anvan ou konfime nenpòt retrè.',
    });
  }

  // Balans lan te deja retire lè demand la te fèt — konfimasyon an jis mache
  // dosye a kòm trete, li pa touche balans lan ankò.
  await prisma.withdrawal.update({
    where: { id: withdrawal.id },
    data: {
      status: 'confirmed', confirmedAt: new Date(), confirmedBy: req.user.id,
      ...(proofImage ? { proofImage, proofMimeType: proofMimeType || null } : {}),
    },
  });

  await notifyUser(withdrawal.userId, {
    title: 'Retrè konfime',
    body: `Retrè ${withdrawal.amount.toLocaleString('fr-FR')} HTG ou a konfime.`,
    type: 'withdrawal',
  });

  res.json({ ok: true });
});

adminRouter.post('/withdrawals/:id/reject', requireAdminOrAgent, async (req, res) => {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
  if (!withdrawal) return res.status(404).json({ error: 'Retrè a pa jwenn.' });
  if (withdrawal.status !== 'pending') return res.status(409).json({ error: 'Retrè sa a deja trete.' });
  const branchError = await checkAgentBranchAccess(req, withdrawal);
  if (branchError) return res.status(403).json({ error: branchError });

  // Refize yon retrè remèt lajan an nan balans kliyan an, paske li te deja
  // retire lè demand la te fèt.
  await prisma.$transaction([
    prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: 'rejected', confirmedAt: new Date(), confirmedBy: req.user.id },
    }),
    prisma.user.update({ where: { id: withdrawal.userId }, data: { balance: { increment: withdrawal.amount } } }),
  ]);

  await notifyUser(withdrawal.userId, {
    title: 'Retrè refize',
    body: `Retrè ${withdrawal.amount.toLocaleString('fr-FR')} HTG ou a refize — lajan an remèt nan balans ou.`,
    type: 'withdrawal',
  });

  res.json({ ok: true });
});

// ---- Depo Objektif (apèsi sèlman — kliyan an jere pwòp objektif li) ----

adminRouter.get('/goals', requireAdmin, async (req, res) => {
  const goals = await prisma.savingsGoal.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ goals });
});

// ---- Prè ----

adminRouter.get('/loans/pending', requireAdmin, async (req, res) => {
  const loans = await prisma.loan.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ loans });
});

adminRouter.get('/loans', requireAdminOrAgent, async (req, res) => {
  const loans = await prisma.loan.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { fullName: true, phone: true } },
      installments: { orderBy: { n: 'asc' } },
    },
  });
  res.json({ loans });
});

// Apwouve yon prè: kredite montan an nan balans kliyan an epi kreye tout
// vèsman yo (LoanInstallment), tout bagay nan yon sèl transaksyon.
adminRouter.post('/loans/:id/approve', requireAdmin, async (req, res) => {
  const loan = await prisma.loan.findUnique({ where: { id: req.params.id } });
  if (!loan) return res.status(404).json({ error: 'Prè a pa jwenn.' });
  if (loan.status !== 'pending') return res.status(409).json({ error: 'Prè sa a deja trete.' });

  const installments = Array.from({ length: loan.months }, (_, i) => ({
    loanId: loan.id,
    n: i + 1,
    amount: loan.installmentAmount,
  }));

  await prisma.$transaction([
    prisma.loan.update({ where: { id: loan.id }, data: { status: 'active', decidedAt: new Date(), decidedBy: req.user.id } }),
    prisma.user.update({ where: { id: loan.userId }, data: { balance: { increment: loan.amount } } }),
    prisma.loanInstallment.createMany({ data: installments }),
  ]);

  await notifyUser(loan.userId, {
    title: 'Prè apwouve',
    body: `Prè ${loan.amount.toLocaleString('fr-FR')} HTG ou a apwouve — lajan an nan balans ou.`,
    type: 'loan',
  });

  res.json({ ok: true });
});

adminRouter.post('/loans/:id/reject', requireAdmin, async (req, res) => {
  const loan = await prisma.loan.findUnique({ where: { id: req.params.id } });
  if (!loan) return res.status(404).json({ error: 'Prè a pa jwenn.' });
  if (loan.status !== 'pending') return res.status(409).json({ error: 'Prè sa a deja trete.' });

  await prisma.loan.update({
    where: { id: loan.id },
    data: { status: 'rejected', decidedAt: new Date(), decidedBy: req.user.id },
  });

  await notifyUser(loan.userId, {
    title: 'Demand prè refize',
    body: `Demand prè ${loan.amount.toLocaleString('fr-FR')} HTG ou a refize.`,
    type: 'loan',
  });

  res.json({ ok: true });
});

// ---- Transfè (istwa sèlman — pa bezwen apwobasyon, yo fèt otomatikman) ----

adminRouter.get('/transfers', requireAdmin, async (req, res) => {
  const transfers = await prisma.transfer.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      fromUser: { select: { fullName: true, phone: true } },
      toUser: { select: { fullName: true, phone: true } },
    },
  });
  res.json({ transfers });
});

// ---- KYC (Didit): egzamine rapò otomatik la anvan desizyon final ----
// Didit fè kaptirasyon dokiman + selfi + liveness + AML pou nou — nou stoke
// sèlman rapò rezilta a. Admin toujou dwe konfime (mòd semi-otomatik).

adminRouter.get('/kyc/didit/pending', requireAdmin, async (req, res) => {
  const verifications = await prisma.kycVerification.findMany({
    where: { status: 'pending' },
    orderBy: { startedAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ verifications });
});

adminRouter.get('/kyc/didit/:id', requireAdmin, async (req, res) => {
  const verification = await prisma.kycVerification.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  if (!verification) return res.status(404).json({ error: 'Verifikasyon an pa jwenn.' });
  res.json({ verification });
});

// Redemande rezilta a DIRÈKTEMAN nan Didit — pa depann sou webhook la ki ka
// pran reta oswa pa rive. Admin klike sou sa lè rapò a rete "Not Started"
// alòske verifikasyon an montre yon lòt estati sou Didit.
adminRouter.post('/kyc/didit/:id/refresh', requireAdmin, async (req, res) => {
  const verification = await prisma.kycVerification.findUnique({ where: { id: req.params.id } });
  if (!verification) return res.status(404).json({ error: 'Verifikasyon an pa jwenn.' });

  const decisionRes = await fetch(`https://verification.didit.me/v3/session/${verification.diditSessionId}/decision/`, {
    headers: { 'x-api-key': process.env.DIDIT_API_KEY },
  });
  const decision = await decisionRes.json();

  if (!decisionRes.ok) {
    return res.status(502).json({ error: 'Nou pa t ka kontakte Didit — eseye ankò.' });
  }

  const updated = await prisma.kycVerification.update({
    where: { id: verification.id },
    data: { diditStatus: decision.status, diditReport: JSON.stringify(decision) },
    include: { user: { select: { fullName: true, phone: true } } },
  });

  res.json({ verification: updated });
});

adminRouter.post('/kyc/didit/:id/approve', requireAdmin, async (req, res) => {
  const verification = await prisma.kycVerification.findUnique({ where: { id: req.params.id } });
  if (!verification) return res.status(404).json({ error: 'Verifikasyon an pa jwenn.' });
  if (verification.status !== 'pending') return res.status(409).json({ error: 'Verifikasyon sa a deja trete.' });

  await prisma.$transaction([
    prisma.kycVerification.update({
      where: { id: verification.id },
      data: { status: 'approved', decidedAt: new Date(), decidedBy: req.user.id },
    }),
    prisma.user.update({ where: { id: verification.userId }, data: { verified: true } }),
  ]);

  await notifyUser(verification.userId, {
    title: 'Kont ou verifye',
    body: 'Idantite w konfime — kont ou verifye kounye a.',
    type: 'kyc',
  });

  res.json({ ok: true });
});

adminRouter.post('/kyc/didit/:id/reject', requireAdmin, async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'Yon rezon obligatwa pou refize.' });

  const verification = await prisma.kycVerification.findUnique({ where: { id: req.params.id } });
  if (!verification) return res.status(404).json({ error: 'Verifikasyon an pa jwenn.' });
  if (verification.status !== 'pending') return res.status(409).json({ error: 'Verifikasyon sa a deja trete.' });

  await prisma.kycVerification.update({
    where: { id: verification.id },
    data: { status: 'rejected', rejectionReason: reason.trim(), decidedAt: new Date(), decidedBy: req.user.id },
  });

  await notifyUser(verification.userId, {
    title: 'Demand verifikasyon refize',
    body: reason.trim(),
    type: 'kyc',
  });

  res.json({ ok: true });
});

// ---- KYC (ansyen sistèm — kite pou istorik/soumisyon ki poko trete anvan Didit) ----

// ---- KYC: egzamine dokiman ak selfi yon kliyan voye ----

adminRouter.get('/kyc/pending', requireAdmin, async (req, res) => {
  const submissions = await prisma.kycSubmission.findMany({
    where: { status: 'pending' },
    orderBy: { submittedAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ submissions });
});

// Detay yon soumisyon, ak imaj yo (base64) — sèlman lè admin klike pou egzamine l,
// pou pa chaje tout imaj yo an menm tan nan lis la.
adminRouter.get('/kyc/:id', requireAdmin, async (req, res) => {
  const submission = await prisma.kycSubmission.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  if (!submission) return res.status(404).json({ error: 'Soumisyon an pa jwenn.' });
  res.json({ submission });
});

adminRouter.post('/kyc/:id/approve', requireAdmin, async (req, res) => {
  const submission = await prisma.kycSubmission.findUnique({ where: { id: req.params.id } });
  if (!submission) return res.status(404).json({ error: 'Soumisyon an pa jwenn.' });
  if (submission.status !== 'pending') return res.status(409).json({ error: 'Soumisyon sa a deja trete.' });

  await prisma.$transaction([
    prisma.kycSubmission.update({
      where: { id: submission.id },
      data: { status: 'approved', decidedAt: new Date(), decidedBy: req.user.id },
    }),
    prisma.user.update({ where: { id: submission.userId }, data: { verified: true } }),
  ]);

  await notifyUser(submission.userId, {
    title: 'Kont ou verifye',
    body: 'Idantite w konfime — kont ou verifye kounye a.',
    type: 'kyc',
  });

  res.json({ ok: true });
});

adminRouter.post('/kyc/:id/reject', requireAdmin, async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'Yon rezon obligatwa pou refize.' });

  const submission = await prisma.kycSubmission.findUnique({ where: { id: req.params.id } });
  if (!submission) return res.status(404).json({ error: 'Soumisyon an pa jwenn.' });
  if (submission.status !== 'pending') return res.status(409).json({ error: 'Soumisyon sa a deja trete.' });

  await prisma.kycSubmission.update({
    where: { id: submission.id },
    data: { status: 'rejected', rejectionReason: reason.trim(), decidedAt: new Date(), decidedBy: req.user.id },
  });

  await notifyUser(submission.userId, {
    title: 'Demand verifikasyon refize',
    body: reason.trim(),
    type: 'kyc',
  });

  res.json({ ok: true });
});

// ---- BLIC Depo (pòch) — apèsi sèlman, pa bezwen apwobasyon ----

adminRouter.get('/pockets', requireAdmin, async (req, res) => {
  const pockets = await prisma.pocket.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ pockets });
});
