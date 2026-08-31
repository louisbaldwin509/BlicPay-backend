import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const walletRouter = Router();

walletRouter.get('/balance', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ balance: user.balance });
});

// Melanje depo AK retrè nan menm istorik la, klase pa dat, chak youn make
// ak yon `type` ('depo' oswa 'retrè') pou front-end lan ka afiche siy +/- la
// ak koulè ki kòrèk.
walletRouter.get('/transactions', requireAuth, async (req, res) => {
  const [deposits, withdrawals] = await Promise.all([
    prisma.deposit.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.withdrawal.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const merged = [
    ...deposits.map((d) => ({
      id: d.id,
      type: 'depo',
      method: d.method,
      amount: d.amount,
      status: d.status,
      createdAt: d.createdAt,
    })),
    ...withdrawals.map((w) => ({
      id: w.id,
      type: 'retrè',
      method: w.method,
      amount: w.amount,
      status: w.status,
      createdAt: w.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);

  res.json({ transactions: merged });
});
