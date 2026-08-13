import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireMerchantAuth } from '../middleware/auth.js';
import { generateKeyPair } from '../utils/keys.js';

export const merchantRouter = Router();

merchantRouter.use(requireMerchantAuth);

merchantRouter.get('/me', async (req, res) => {
  const merchant = await prisma.merchant.findUnique({ where: { id: req.merchantId } });
  if (!merchant) return res.status(404).json({ error: 'Kont marchan an pa jwenn.' });
  const { passwordHash, ...safe } = merchant;
  res.json({ merchant: safe });
});

merchantRouter.get('/payments', async (req, res) => {
  const payments = await prisma.paymentRequest.findMany({
    where: { merchantId: req.merchantId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ payments });
});

merchantRouter.patch('/webhook', async (req, res) => {
  const { webhookUrl } = req.body;
  const merchant = await prisma.merchant.update({
    where: { id: req.merchantId },
    data: { webhookUrl: webhookUrl || null },
  });
  res.json({ webhookUrl: merchant.webhookUrl });
});

// Lets a merchant rotate their keys if the secret key ever leaks.
merchantRouter.post('/rotate-keys', async (req, res) => {
  const { publicKey, secretKey } = generateKeyPair();
  const merchant = await prisma.merchant.update({
    where: { id: req.merchantId },
    data: { publicKey, secretKey },
  });
  res.json({ publicKey: merchant.publicKey, secretKey: merchant.secretKey });
});
