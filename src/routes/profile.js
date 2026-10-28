import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

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
