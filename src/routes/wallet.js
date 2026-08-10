import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const walletRouter = Router();

walletRouter.get('/balance', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ balance: user.balance });
});

walletRouter.get('/transactions', requireAuth, async (req, res) => {
  const deposits = await prisma.deposit.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ transactions: deposits });
});
