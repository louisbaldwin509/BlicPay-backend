import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db.js';

export const authRouter = Router();

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

function publicUser(user) {
  return {
    id: user.id,
    clientId: user.clientId,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    balance: user.balance,
    verified: user.verified,
  };
}

// Kreye yon ID kliyan tankou "BP-482913", epi eseye ankò si li deja pran
// (ra, men posib ak jenerasyon aleatwa).
async function generateUniqueClientId() {
  for (let i = 0; i < 5; i++) {
    const candidate = 'BP-' + Math.floor(100000 + Math.random() * 900000);
    const existing = await prisma.user.findUnique({ where: { clientId: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Nou pa t ka jenere yon ID kliyan inik.');
}

authRouter.post('/register', async (req, res) => {
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

authRouter.post('/login', async (req, res) => {
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
