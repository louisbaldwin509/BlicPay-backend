import { Router } from 'express';
import { prisma } from '../utils/db.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { notifyAdmins } from '../utils/notify.js';

export const profileRouter = Router();
profileRouter.use(requireAuth);

// Foto pwofil la estoke nan menm chan `photoImage`/`photoMimeType` ajan yo
// itilize deja (base64). App la redimansyone l (≈ 400×400 JPEG) anvan l voye
// l, kidonk li rete piti.
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BASE64_LENGTH = 1_500_000; // ≈ 1.1 MB imaj

// Enfòmasyon pwofil kliyan ki konekte a (san foto a — li twò lou pou chak apèl).
profileRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      clientId: true,
      fullName: true,
      phone: true,
      role: true,
      branch: true,
      balance: true,
      verified: true,
      createdAt: true,
      photoMimeType: true,
      accountType: true,
      business: { select: { status: true, legalName: true, tradeName: true, legalForm: true } },
    },
  });
  if (!user) return res.status(404).json({ error: 'Kont lan pa jwenn.' });
  const { photoMimeType, ...rest } = user;
  res.json({ user: { ...rest, hasPhoto: !!photoMimeType } });
});

// Foto a li menm.
profileRouter.get('/photo', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { photoImage: true, photoMimeType: true },
  });
  if (!user?.photoImage) return res.json({ photo: null });
  res.json({ photo: { image: user.photoImage, mimeType: user.photoMimeType } });
});

// Mete oswa chanje foto pwofil la.
profileRouter.put('/photo', async (req, res) => {
  const { image, mimeType } = req.body || {};
  if (!image || typeof image !== 'string' || !ALLOWED_MIME.includes(mimeType)) {
    return res.status(400).json({ error: 'Foto a pa valab.' });
  }
  if (image.length > MAX_BASE64_LENGTH) {
    return res.status(400).json({ error: 'Foto a twò gwo.' });
  }
  await prisma.user.update({
    where: { id: req.user.id },
    data: { photoImage: image, photoMimeType: mimeType },
  });
  res.json({ ok: true });
});

// Retire foto pwofil la.
profileRouter.delete('/photo', async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { photoImage: null, photoMimeType: null },
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// EFASE KONT (obligatwa pou Apple App Store ak Google Play).
//
// Kliyan an konfime ak modpas li. Si pa gen anyen ki toujou an kou (balans 0,
// pa gen depo/retrè annatant, pa gen prè aktif, pa gen Sòl an kou, pòch ak
// objektif vid), kont lan efase touswit:
//   - done pèsonèl yo anonimize (non, telefòn, foto, PIN, modpas)
//   - kont lan bloke e pa ka itilize ankò; nimewo telefòn nan vin lib
//   - dosye tranzaksyon ak verifikasyon (KYC) yo RETE, san non, jan lalwa
//     finansye/AML mande
// ---------------------------------------------------------------------------
profileRouter.get('/delete-check', async (req, res) => {
  res.json({ blockers: await deletionBlockers(req.user.id) });
});

profileRouter.post('/delete', async (req, res) => {
  const { password, reason } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Modpas kont ou obligatwa pou konfime.' });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || user.deletedAt) return res.status(404).json({ error: 'Kont lan pa jwenn.' });
  if (user.role !== 'member') {
    return res.status(403).json({ error: 'Kont admin ak ajan pa ka efase depi app la.' });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  // 400 (pa 401) pou app la pa konprann sa kòm yon sesyon ki ekspire.
  if (!valid) return res.status(400).json({ error: 'Modpas la pa kòrèk.' });

  const blockers = await deletionBlockers(user.id);
  if (blockers.length > 0) {
    return res.status(409).json({ error: 'Ou poko ka efase kont ou — gen operasyon ki toujou an kou.', blockers });
  }

  const randomHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        fullName: 'Kont efase',
        phone: `deleted:${user.id}`,
        email: null,
        passwordHash: randomHash,
        pinHash: null,
        photoImage: null,
        photoMimeType: null,
        blocked: true,
        deletedAt: new Date(),
        deletionReason: typeof reason === 'string' ? reason.slice(0, 300) : null,
      },
    }),
  ]);

  res.json({ ok: true });

  notifyAdmins({
    title: 'Yon kliyan efase kont li',
    body: `Kont ${user.clientId ?? user.id} efase pa kliyan an.${reason ? ` Rezon: ${String(reason).slice(0, 120)}` : ''}`,
    type: 'general',
  }).catch(() => {});
});

async function deletionBlockers(userId) {
  const [user, pendingDeposits, pendingWithdrawals, activeLoans, solMemberships, pockets, goals] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { balance: true } }),
    prisma.deposit.count({ where: { userId, status: 'pending' } }),
    prisma.withdrawal.count({ where: { userId, status: 'pending' } }),
    prisma.loan.count({ where: { userId, status: { in: ['pending', 'active'] } } }),
    prisma.solMembership.findMany({ where: { userId, status: { in: ['pending', 'approved'] } }, select: { status: true, group: { select: { completedAt: true } } } }),
    prisma.pocket.aggregate({ where: { userId }, _sum: { balance: true } }),
    prisma.savingsGoal.aggregate({ where: { userId, status: 'active' }, _sum: { saved: true } }),
  ]);
  const blockers = [];
  if ((user?.balance ?? 0) > 0) blockers.push('balance');
  if ((pockets._sum.balance ?? 0) > 0 || (goals._sum.saved ?? 0) > 0) blockers.push('savings');
  if (pendingDeposits + pendingWithdrawals > 0) blockers.push('pending');
  if (activeLoans > 0) blockers.push('loan');
  if (solMemberships.some((m) => m.status === 'pending' || !m.group.completedAt)) blockers.push('sol');
  return blockers;
}
