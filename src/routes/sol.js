import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { getPeriodDates, formatHtDate } from '../utils/solDates.js';

export const solRouter = Router();

solRouter.use(requireAuth);

// Lis tout 90 gwoup yo, ak konbyen manm apwouve chak genyen, ak demand
// pwòp itilizatè a (si genyen) pou chak gwoup.
const SOL_INTEGRATION_FEE_RATE = 0.015; // 1.5% — kliyan wè sèlman montan an HTG, jamè pousantaj la

solRouter.get('/groups', async (req, res) => {
  const groups = await prisma.solGroup.findMany({ orderBy: [{ frequencyId: 'asc' }, { tierId: 'asc' }, { order: 'asc' }] });
  const memberships = await prisma.solMembership.findMany({
    where: { status: { in: ['pending', 'approved'] } },
  });

  const approvedCounts = {};
  const myStatusByGroup = {};
  for (const m of memberships) {
    if (m.status === 'approved') approvedCounts[m.groupId] = (approvedCounts[m.groupId] || 0) + 1;
    if (m.userId === req.user.id) myStatusByGroup[m.groupId] = m.status;
  }

  // Detèmine si chak gwoup louvri: tout gwoup anvan l (menm tier+frekans) dwe plen.
  const byBucket = {};
  for (const g of groups) {
    const key = `${g.tierId}:${g.frequencyId}`;
    (byBucket[key] = byBucket[key] || []).push(g);
  }
  const openIds = new Set();
  for (const key in byBucket) {
    let blocked = false;
    for (const g of byBucket[key].sort((a, b) => a.order - b.order)) {
      const count = approvedCounts[g.id] || 0;
      if (!blocked && count < g.maxMembers) openIds.add(g.id);
      if (count < g.maxMembers) blocked = true;
    }
  }

  res.json({
    groups: groups.map((g) => ({
      ...g,
      memberCount: approvedCounts[g.id] || 0,
      isOpen: openIds.has(g.id),
      myStatus: myStatusByGroup[g.id] || null,
      integrationFee: Math.round(g.amount * g.maxMembers * SOL_INTEGRATION_FEE_RATE),
    })),
  });
});

// Detay yon sèl gwoup, ak lis manm apwouve yo (pou paj detay la).
solRouter.get('/groups/:id', async (req, res) => {
  const group = await prisma.solGroup.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: 'Gwoup sa a pa jwenn.' });

  // Pa gen non oswa detay lòt manm ki soti isit la — chak kliyan sèlman ka
  // wè PWÒP adezyon pa li. Sa a se yon chwa konfidansyalite: patisipan yo pa
  // dwe konnen ki lòt moun ki nan menm Sòl la.
  const mine = await prisma.solMembership.findFirst({ where: { groupId: group.id, userId: req.user.id } });

  res.json({ group, myMembership: mine });
});

// Voye yon demand pou antre nan yon gwoup. Sa KREYE yon demand "pending" —
// li PA fè moun nan vin manm otomatikman. Yon admin dwe apwouve l. Kont lan
// dwe verifye (KYC) anvan li ka voye yon demand.
solRouter.post('/groups/:id/request', requireVerified, async (req, res) => {
  const requester = await prisma.user.findUnique({ where: { id: req.user.id }, select: { creditBanned: true } });
  if (requester?.creditBanned) {
    return res.status(403).json({ error: 'Kont ou pa ka patisipe nan Sòl ankò — kontakte sipò BLICPay.' });
  }

  const group = await prisma.solGroup.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: 'Gwoup sa a pa jwenn.' });

  const already = await prisma.solMembership.findFirst({
    where: { groupId: group.id, userId: req.user.id, status: { not: 'rejected' } },
  });
  if (already) {
    return res.status(409).json({ error: 'Ou deja gen yon demand oswa ou deja manm gwoup sa a.' });
  }

  const approvedCount = await prisma.solMembership.count({ where: { groupId: group.id, status: 'approved' } });
  if (approvedCount >= group.maxMembers) {
    return res.status(409).json({ error: 'Gwoup sa a konplè.' });
  }

  const earlierGroups = await prisma.solGroup.findMany({
    where: { tierId: group.tierId, frequencyId: group.frequencyId, order: { lt: group.order } },
  });
  for (const eg of earlierGroups) {
    const c = await prisma.solMembership.count({ where: { groupId: eg.id, status: 'approved' } });
    if (c < eg.maxMembers) {
      return res.status(409).json({ error: `Sòl ${group.tier} #${group.order - 1} dwe ranpli anvan.` });
    }
  }

  const membership = already
    ? await prisma.solMembership.update({ where: { id: already.id }, data: { status: 'pending', requestedAt: new Date(), decidedAt: null, decidedBy: null } })
    : await prisma.solMembership.create({ data: { groupId: group.id, userId: req.user.id } });

  res.status(201).json({ membership });
});

// Tout demand ak adhezyon pwòp itilizatè a (pou paj "Sòl mwen yo"), ansanm ak
// dokiman ki gen rapò ak chak adezyon (san kontni fichye a — sa a rete leje).
// Kliyan an peye pwòp frè entegrasyon 1.5% li a — OBLIGATWA anvan admin ka
// apwouve demand lan. Operasyon atomik (balance >= frè a) pou anpeche balans
// lan pase anba 0.
solRouter.post('/memberships/:id/pay-integration-fee', requireAuth, async (req, res) => {
  const membership = await prisma.solMembership.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { group: true },
  });
  if (!membership) return res.status(404).json({ error: 'Demand sa a pa jwenn.' });
  if (membership.status !== 'pending') {
    return res.status(409).json({ error: 'Demand sa a deja trete — ou pa ka peye frè a ankò.' });
  }
  if (membership.integrationFeePaid) {
    return res.status(409).json({ error: 'Ou deja peye frè entegrasyon an pou demand sa a.' });
  }

  const fee = Math.round(membership.group.amount * membership.group.maxMembers * SOL_INTEGRATION_FEE_RATE);

  const updateResult = await prisma.user.updateMany({
    where: { id: req.user.id, balance: { gte: fee } },
    data: { balance: { decrement: fee } },
  });
  if (updateResult.count === 0) {
    return res.status(400).json({ error: `Ou pa gen ase lajan pou peye frè entegrasyon an (${fee.toLocaleString('fr-FR')} HTG).` });
  }

  await prisma.solMembership.update({ where: { id: membership.id }, data: { integrationFeePaid: true } });

  res.json({ ok: true, fee });
});

solRouter.get('/my', async (req, res) => {
  const memberships = await prisma.solMembership.findMany({
    where: { userId: req.user.id },
    include: {
      group: true,
      documents: { select: { id: true, title: true, fileMimeType: true, fileName: true, uploadedAt: true } },
    },
    orderBy: { requestedAt: 'desc' },
  });

  // Pou chak adezyon apwouve nan yon gwoup ki deja kòmanse, jwenn kotizasyon
  // peryòd AKTYÈL la — sa pèmèt kliyan an wè "ou peye" oswa "ou an reta" san
  // li pa gen pou l fouye nan notifikasyon pase yo.
  const withContribution = await Promise.all(memberships.map(async (m) => {
    const integrationFee = Math.round(m.group.amount * m.group.maxMembers * SOL_INTEGRATION_FEE_RATE);
    if (m.status !== 'approved' || !m.group.startedAt || m.group.completedAt) {
      return { ...m, integrationFee, currentContribution: null, currentPeriodDates: null };
    }
    const contribution = await prisma.solContribution.findUnique({
      where: { membershipId_period: { membershipId: m.id, period: m.group.currentTurn } },
    });
    const dates = getPeriodDates(m.group, m.group.currentTurn);
    const currentPeriodDates = dates ? {
      deadline: formatHtDate(dates.deadline),
      payoutDate: formatHtDate(dates.payoutDate),
    } : null;
    return { ...m, integrationFee, currentContribution: contribution, currentPeriodDates };
  }));

  res.json({ memberships: withContribution });
});

// Kliyan telechaje/gade yon dokiman espesifik li — sèlman si l aparyen a
// youn nan pwòp adezyon li yo. Sa a se sèl kote kontni fichye a (base64) voye.
solRouter.get('/documents/:id', async (req, res) => {
  const doc = await prisma.solDocument.findUnique({
    where: { id: req.params.id },
    include: { membership: { select: { userId: true } } },
  });
  if (!doc || doc.membership.userId !== req.user.id) {
    return res.status(404).json({ error: 'Dokiman an pa jwenn.' });
  }
  res.json({
    document: {
      id: doc.id,
      title: doc.title,
      fileData: doc.fileData,
      fileMimeType: doc.fileMimeType,
      fileName: doc.fileName,
      uploadedAt: doc.uploadedAt,
    },
  });
});
