import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { memberPayoutDate, getPeriodDates, formatHtDate } from '../utils/solDates.js';
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

adminRouter.post('/sol/requests/:id/approve', async (req, res) => {
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

// ---- BLIC Sòl: wotasyon reyèl (kòmanse gwoup la, trete chak peryòd, eskli manm) ----

const SOL_GRACE_DAYS = 3;        // 3 premye jou yo — pa gen penalite ditou
const SOL_PENALTY_WINDOW_DAYS = 5; // 5 jou apre gras la — penalite 1%/jou akimile
const SOL_DAILY_PENALTY_RATE = 0.01;

// Admin kòmanse wotasyon an — sèlman posib lè gwoup la PLEN. Sa kreye premye
// seri kotizasyon yo (peryòd 0) pou tout manm apwouve yo.
adminRouter.post('/sol/groups/:id/start', async (req, res) => {
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
adminRouter.post('/sol/groups/:id/process-period', async (req, res) => {
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
        await prisma.user.update({ where: { id: recipient.userId }, data: { balance: { increment: potAmount } } });
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
adminRouter.post('/sol/memberships/:id/exclude', async (req, res) => {
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

adminRouter.post('/sol/requests/:id/reject', async (req, res) => {
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

adminRouter.post('/sol/memberships/:id/documents', async (req, res) => {
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

adminRouter.patch('/sol/memberships/:id/form-approve', async (req, res) => {
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

  await notifyUser(loan.userId, {
    title: 'Prè apwouve',
    body: `Prè ${loan.amount.toLocaleString('fr-FR')} HTG ou a apwouve — lajan an nan balans ou.`,
    type: 'loan',
  });

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

  await notifyUser(loan.userId, {
    title: 'Demand prè refize',
    body: `Demand prè ${loan.amount.toLocaleString('fr-FR')} HTG ou a refize.`,
    type: 'loan',
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

// ---- KYC (Didit): egzamine rapò otomatik la anvan desizyon final ----
// Didit fè kaptirasyon dokiman + selfi + liveness + AML pou nou — nou stoke
// sèlman rapò rezilta a. Admin toujou dwe konfime (mòd semi-otomatik).

adminRouter.get('/kyc/didit/pending', async (req, res) => {
  const verifications = await prisma.kycVerification.findMany({
    where: { status: 'pending' },
    orderBy: { startedAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ verifications });
});

adminRouter.get('/kyc/didit/:id', async (req, res) => {
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
adminRouter.post('/kyc/didit/:id/refresh', async (req, res) => {
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

adminRouter.post('/kyc/didit/:id/approve', async (req, res) => {
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

adminRouter.post('/kyc/didit/:id/reject', async (req, res) => {
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
