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
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    balance: user.balance,
  };
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
  const user = await prisma.user.create({
    data: { fullName: fullName.trim(), phone: phone.trim(), passwordHash },
  });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const { phone, password } = req.body;

  const user = await prisma.user.findUnique({ where: { phone } });
  const valid = user && (await bcrypt.compare(password, user.passwordHash));

  if (!valid) {
    return res.status(401).json({ error: 'Nimewo oswa modpas la pa kòrèk.' });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});
