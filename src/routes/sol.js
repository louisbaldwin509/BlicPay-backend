import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';

export const solRouter = Router();

solRouter.use(requireAuth);

// Lis tout 90 gwoup yo, ak konbyen manm apwouve chak genyen, ak demand
// pwòp itilizatè a (si genyen) pou chak gwoup.
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
    })),
  });
});

// Detay yon sèl gwoup, ak lis manm apwouve yo (pou paj detay la).
solRouter.get('/groups/:id', async (req, res) => {
  const group = await prisma.solGroup.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: 'Gwoup sa a pa jwenn.' });

  const memberships = await prisma.solMembership.findMany({
    where: { groupId: group.id, status: 'approved' },
    orderBy: { turnIndex: 'asc' },
    include: { user: { select: { fullName: true } } },
  });

  const mine = await prisma.solMembership.findFirst({ where: { groupId: group.id, userId: req.user.id } });

  res.json({
    group,
    members: memberships.map((m) => ({
      id: m.id,
      name: m.user.fullName,
      turnIndex: m.turnIndex,
      lastPaidPeriod: m.lastPaidPeriod,
    })),
    myMembership: mine,
  });
});

// Voye yon demand pou antre nan yon gwoup. Sa KREYE yon demand "pending" —
// li PA fè moun nan vin manm otomatikman. Yon admin dwe apwouve l. Kont lan
// dwe verifye (KYC) anvan li ka voye yon demand.
solRouter.post('/groups/:id/request', requireVerified, async (req, res) => {
  const group = await prisma.solGroup.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: 'Gwoup sa a pa jwenn.' });

  const already = await prisma.solMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: req.user.id } },
  });
  if (already && already.status !== 'rejected') {
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
solRouter.get('/my', async (req, res) => {
  const memberships = await prisma.solMembership.findMany({
    where: { userId: req.user.id },
    include: {
      group: true,
      documents: { select: { id: true, title: true, fileMimeType: true, fileName: true, uploadedAt: true } },
    },
    orderBy: { requestedAt: 'desc' },
  });
  res.json({ memberships });
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
