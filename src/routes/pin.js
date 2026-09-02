import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const pinRouter = Router();

pinRouter.use(requireAuth);

// Kliyan kreye oswa chanje kòd PIN 4 chif li a. Nou mande modpas kont li a
// (pa PIN aktyèl la) kòm konfimasyon — menm jan ak nenpòt chanjman sansib.
pinRouter.post('/set', async (req, res) => {
  const { password, pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'Kòd PIN la dwe gen egzakteman 4 chif.' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Modpas kont ou obligatwa pou konfime.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    return res.status(401).json({ error: 'Modpas la pa kòrèk.' });
  }

  const pinHash = await bcrypt.hash(pin, 10);
  await prisma.user.update({ where: { id: req.user.id }, data: { pinHash } });

  res.json({ ok: true });
});

// Konfime si kliyan an gen yon PIN deja kreye (pou app la deside si l dwe
// ofri ekran "kreye PIN" oswa "antre PIN" lè l ap reverouye).
pinRouter.get('/status', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { pinHash: true } });
  res.json({ hasPin: !!user?.pinHash });
});

// Verifye kòd PIN la — itilize pou reverouye app la rapidman (san ale nan
// tout paj koneksyon an ak modpas) e pou konfime yon retrè.
pinRouter.post('/verify', async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'Kòd PIN la dwe gen egzakteman 4 chif.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { pinHash: true } });
  if (!user?.pinHash) {
    return res.status(409).json({ error: 'Ou poko gen yon kòd PIN kreye.' });
  }

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) {
    return res.status(401).json({ error: 'Kòd PIN la pa kòrèk.' });
  }

  res.json({ ok: true });
});
