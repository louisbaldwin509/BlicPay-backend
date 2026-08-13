import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db.js';
import { generateKeyPair } from '../utils/keys.js';

export const merchantAuthRouter = Router();

function signMerchantToken(merchant) {
  return jwt.sign({ sub: merchant.id, kind: 'merchant' }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

function publicMerchant(m) {
  return {
    id: m.id,
    businessName: m.businessName,
    email: m.email,
    website: m.website,
    publicKey: m.publicKey,
    secretKey: m.secretKey,
    webhookUrl: m.webhookUrl,
    balance: m.balance,
  };
}

merchantAuthRouter.post('/register', async (req, res) => {
  const { businessName, email, password, website } = req.body;

  if (!businessName?.trim() || !email?.trim() || !password || password.length < 6) {
    return res.status(400).json({
      error: 'Non biznis, imèl, ak yon modpas (6+ karaktè) obligatwa.',
    });
  }

  const existing = await prisma.merchant.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'Yon kont marchan deja egziste ak imèl sa a.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { publicKey, secretKey } = generateKeyPair();

  const merchant = await prisma.merchant.create({
    data: { businessName: businessName.trim(), email: email.trim(), passwordHash, website, publicKey, secretKey },
  });

  res.status(201).json({ token: signMerchantToken(merchant), merchant: publicMerchant(merchant) });
});

merchantAuthRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const merchant = await prisma.merchant.findUnique({ where: { email } });
  const valid = merchant && (await bcrypt.compare(password, merchant.passwordHash));

  if (!valid) {
    return res.status(401).json({ error: 'Imèl oswa modpas la pa kòrèk.' });
  }

  res.json({ token: signMerchantToken(merchant), merchant: publicMerchant(merchant) });
});
