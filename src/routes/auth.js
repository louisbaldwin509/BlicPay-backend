import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

export function publicUser(user) {
  return {
    id: user.id,
    clientId: user.clientId,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    branch: user.branch,
    balance: user.balance,
    verified: user.verified,
    accountType: user.accountType ?? 'personal',
  };
}

// Kreye yon ID kliyan tankou "BP-482913", epi eseye ankò si li deja pran
// (ra, men posib ak jenerasyon aleatwa).
export async function generateUniqueClientId() {
  for (let i = 0; i < 5; i++) {
    const candidate = 'BP-' + Math.floor(100000 + Math.random() * 900000);
    const existing = await prisma.user.findUnique({ where: { clientId: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Nou pa t ka jenere yon ID kliyan inik.');
}

authRouter.post('/register', loginLimiter, async (req, res) => {
  const { fullName, phone, password } = req.body;

  if (!fullName?.trim() || !phone?.trim() || !password || password.length < 6) {
    return res.status(400).json({
      error: 'Non, nimewo telefòn, ak yon modpas (6+ karaktè) obligatwa.',
    });
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return res.status(409).json({ error: 'Yon kont deja egziste ak nimewo sa a.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const clientId = await generateUniqueClientId();
  const user = await prisma.user.create({
    data: { clientId, fullName: fullName.trim(), phone: phone.trim(), passwordHash },
  });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

// Rate-limite: pa plis pase 8 tantativ konneksyon pou menm IP la nan 15 min,
// pou anpeche yon atak fòs brit sou modpas kliyan yo.
authRouter.post('/login', loginLimiter, async (req, res) => {
  const { phone, password } = req.body;

  let user = await prisma.user.findUnique({ where: { phone } });
  const valid = user && (await bcrypt.compare(password, user.passwordHash));

  if (!valid) {
    return res.status(401).json({ error: 'Nimewo oswa modpas la pa kòrèk.' });
  }
  if (user.blocked) {
    return res.status(403).json({ error: 'Kont sa a bloke. Kontakte sipò BLICPay.' });
  }

  // Kont ki te egziste anvan nouvo chan clientId a ka pa gen youn — jenere l
  // yon sèl fwa, otomatikman, san moun nan pa remake.
  if (!user.clientId) {
    const clientId = await generateUniqueClientId();
    user = await prisma.user.update({ where: { id: user.id }, data: { clientId } });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

// Nenpòt itilizatè ki konekte (kliyan, ajan, admin) chanje pwòp modpas li.
// Li dwe bay modpas AKTYÈL la kòm prèv — menm si yon moun ta jwenn yon
// telefòn ki toujou konekte, li pa ka chanje modpas la san l pa konnen l.
// Rate-limite menm jan ak koneksyon an pou anpeche divinasyon modpas aktyèl la.
authRouter.post('/change-password', loginLimiter, requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Modpas aktyèl la ak nouvo modpas la obligatwa.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Nouvo modpas la dwe gen omwen 6 karaktè.' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'Nouvo modpas la dwe diferan de ansyen an.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'Kont lan pa jwenn.' });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    // 400 (pa 401) pou front-end lan pa konprann sa kòm yon sesyon ki ekspire.
    return res.status(400).json({ error: 'Modpas aktyèl la pa kòrèk.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});
