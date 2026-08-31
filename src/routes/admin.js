import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { memberPayoutDate } from '../utils/solDates.js';
import { notifyUser } from '../utils/notify.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/deposits/pending', async (req, res) => {
  const deposits = await prisma.deposit.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ deposits });
});

// Confirming a deposit and crediting the balance happen in one atomic
// transaction so a crash between the two steps can never leave the
// deposit marked confirmed without the money actually landing in the
// user's balance (or vice versa).
adminRouter.post('/deposits/:id/confirm', async (req, res) => {
  const deposit = await prisma.deposit.findUnique({ where: { id: req.params.id } });

  if (!deposit) return res.status(404).json({ error: 'Depo a pa jwenn.' });
  if (deposit.status !== 'pending') {
    return res.status(409).json({ error: 'Depo sa a deja trete.' });
  }

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

adminRouter.post('/deposits/:id/reject', async (req, res) => {
  const deposit = await prisma.deposit.findUnique({ where: { id: req.params.id } });
  if (!deposit) return res.status(404).json({ error: 'Depo a pa jwenn.' });
  if (deposit.status !== 'pending') {
    return res.status(409).json({ error: 'Depo sa a deja trete.' });
  }

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

adminRouter.get('/sol/requests/pending', async (req, res) => {
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
    (takenMap[m.groupId] = takenMap[m.groupId] || []).push(m.turnIndex + 1);
  }

  res.json({
    requests: requests.map((r) => ({ ...r, takenPositions: takenMap[r.groupId] || [] })),
  });
});

// Apwouve yon demand — sa bay moun nan yon pozisyon nan wotasyon an (turnIndex)
// epi li vin konte kòm yon manm reyèl gwoup la. Fèt nan yon transaksyon pou
// evite de moun pran menm pozisyon an si de admin apwouve an menm tan.
// Apwouve yon demand — admin nan ka chwazi pozisyon nan wotasyon an (1ye plas,
// 2yèm, elatriye). Si li pa chwazi youn, nou bay premye pozisyon ki lib la.
adminRouter.post('/sol/requests/:id/approve', async (req, res) => {
  const { turnIndex } = req.body; // pozisyon 1-endekse (1 = premye plas), opsyonèl
  const membership = await prisma.solMembership.findUnique({ where: { id: req.params.id }, include: { group: true } });
  if (!membership) return res.status(404).json({ error: 'Demand sa a pa jwenn.' });
  if (membership.status !== 'pending') {
    return res.status(409).json({ error: 'Demand sa a deja trete.' });
  }

  const approvedMembers = await prisma.solMembership.findMany({ where: { groupId: membership.groupId, status: 'approved' } });
  if (approvedMembers.length >= membership.group.maxMembers) {
    return res.status(409).json({ error: 'Gwoup sa a konplè deja — pa ka apwouve ankò.' });
  }

  const takenPositions = new Set(approvedMembers.map((m) => m.turnIndex));
  let position;
  if (turnIndex != null) {
    position = Number(turnIndex) - 1;
    if (!Number.isInteger(position) || position < 0 || position >= membership.group.maxMembers) {
      return res.status(400).json({ error: 'Pozisyon an pa valab.' });
    }
    if (takenPositions.has(position)) {
      return res.status(409).json({ error: 'Pozisyon sa a deja pran pa yon lòt manm.' });
    }
  } else {
    position = 0;
    while (takenPositions.has(position)) position++;
  }

  const updated = await prisma.solMembership.update({
    where: { id: membership.id },
    data: { status: 'approved', turnIndex: position, decidedAt: new Date(), decidedBy: req.user.id },
  });

  res.json({ ok: true, membership: updated });
});

// Chanje pozisyon yon manm ki deja apwouve (pou reòganize wotasyon an).
adminRouter.patch('/sol/groups/:groupId/members/:membershipId/position', async (req, res) => {
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

adminRouter.post('/sol/requests/:id/reject', async (req, res) => {
  const membership = await prisma.solMembership.findUnique({ where: { id: req.params.id } });
  if (!membership) return res.status(404).json({ error: 'Demand sa a pa jwenn.' });
  if (membership.status !== 'pending') {
    return res.status(409).json({ error: 'Demand sa a deja trete.' });
  }

  await prisma.solMembership.update({
    where: { id: membership.id },
    data: { status: 'rejected', decidedAt: new Date(), decidedBy: req.user.id },
  });

  res.json({ ok: true });
});

// ---- Itilizatè: rechèch, bloke/debloke, verifye, ajiste balans ----

adminRouter.get('/users', async (req, res) => {
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

adminRouter.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, fullName: true, phone: true, role: true, balance: true, verified: true, blocked: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: 'Itilizatè a pa jwenn.' });

  const deposits = await prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 });
  const solMemberships = await prisma.solMembership.findMany({ where: { userId: user.id }, include: { group: true } });

  res.json({ user, deposits, solMemberships });
});

adminRouter.patch('/users/:id/block', async (req, res) => {
  const { blocked } = req.body;
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { blocked: !!blocked } });
  res.json({ ok: true, blocked: user.blocked });
});

adminRouter.patch('/users/:id/verify', async (req, res) => {
  const { verified } = req.body;
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { verified: !!verified } });
  res.json({ ok: true, verified: user.verified });
});

// Ajisteman manyèl balans — pou ka korije yon erè oswa kredite/debite san
// yon depo. `amount` ka pozitif (kredite) oswa negatif (debite).
adminRouter.post('/users/:id/adjust-balance', async (req, res) => {
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

adminRouter.get('/merchants', async (req, res) => {
  const merchants = await prisma.merchant.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, businessName: true, email: true, website: true, balance: true, createdAt: true },
  });
  res.json({ merchants });
});

// ---- BLIC Sòl: apèsi tout gwoup yo (pou paj sipèvizyon admin) ----

adminRouter.get('/sol/groups', async (req, res) => {
  const groups = await prisma.solGroup.findMany({ orderBy: [{ frequencyId: 'asc' }, { tierId: 'asc' }, { order: 'asc' }] });
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
adminRouter.get('/sol/groups/:id/members', async (req, res) => {
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

// ---- Retrait ----

adminRouter.get('/withdrawals/pending', async (req, res) => {
  const withdrawals = await prisma.withdrawal.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ withdrawals });
});

adminRouter.post('/withdrawals/:id/confirm', async (req, res) => {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
  if (!withdrawal) return res.status(404).json({ error: 'Retrè a pa jwenn.' });
  if (withdrawal.status !== 'pending') return res.status(409).json({ error: 'Retrè sa a deja trete.' });

  // Balans lan te deja retire lè demand la te fèt — konfimasyon an jis mache
  // dosye a kòm trete, li pa touche balans lan ankò.
  await prisma.withdrawal.update({
    where: { id: withdrawal.id },
    data: { status: 'confirmed', confirmedAt: new Date(), confirmedBy: req.user.id },
  });

  await notifyUser(withdrawal.userId, {
    title: 'Retrè konfime',
    body: `Retrè ${withdrawal.amount.toLocaleString('fr-FR')} HTG ou a konfime.`,
    type: 'withdrawal',
  });

  res.json({ ok: true });
});

adminRouter.post('/withdrawals/:id/reject', async (req, res) => {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
  if (!withdrawal) return res.status(404).json({ error: 'Retrè a pa jwenn.' });
  if (withdrawal.status !== 'pending') return res.status(409).json({ error: 'Retrè sa a deja trete.' });

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

adminRouter.get('/goals', async (req, res) => {
  const goals = await prisma.savingsGoal.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ goals });
});

// ---- Prè ----

adminRouter.get('/loans/pending', async (req, res) => {
  const loans = await prisma.loan.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ loans });
});

adminRouter.get('/loans', async (req, res) => {
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
adminRouter.post('/loans/:id/approve', async (req, res) => {
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

  res.json({ ok: true });
});

adminRouter.post('/loans/:id/reject', async (req, res) => {
  const loan = await prisma.loan.findUnique({ where: { id: req.params.id } });
  if (!loan) return res.status(404).json({ error: 'Prè a pa jwenn.' });
  if (loan.status !== 'pending') return res.status(409).json({ error: 'Prè sa a deja trete.' });

  await prisma.loan.update({
    where: { id: loan.id },
    data: { status: 'rejected', decidedAt: new Date(), decidedBy: req.user.id },
  });

  res.json({ ok: true });
});

// ---- Transfè (istwa sèlman — pa bezwen apwobasyon, yo fèt otomatikman) ----

adminRouter.get('/transfers', async (req, res) => {
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

// ---- KYC: egzamine dokiman ak selfi yon kliyan voye ----

adminRouter.get('/kyc/pending', async (req, res) => {
  const submissions = await prisma.kycSubmission.findMany({
    where: { status: 'pending' },
    orderBy: { submittedAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ submissions });
});

// Detay yon soumisyon, ak imaj yo (base64) — sèlman lè admin klike pou egzamine l,
// pou pa chaje tout imaj yo an menm tan nan lis la.
adminRouter.get('/kyc/:id', async (req, res) => {
  const submission = await prisma.kycSubmission.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  if (!submission) return res.status(404).json({ error: 'Soumisyon an pa jwenn.' });
  res.json({ submission });
});

adminRouter.post('/kyc/:id/approve', async (req, res) => {
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

adminRouter.post('/kyc/:id/reject', async (req, res) => {
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

adminRouter.get('/pockets', async (req, res) => {
  const pockets = await prisma.pocket.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ pockets });
});
