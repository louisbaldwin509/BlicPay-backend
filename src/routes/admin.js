import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/deposits/pending', async (req, res) => {
  const deposits = await prisma.deposit.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  res.json({ deposits });
});

// Confirming a deposit and crediting the balance happen in one atomic
// transaction so a crash between the two steps can never leave the
// deposit marked confirmed without the money actually landing in the
// user's balance (or vice versa).
adminRouter.post('/deposits/:id/confirm', async (req, res) => {
  const deposit = await prisma.deposit.findUnique({ where: { id: req.params.id } });

  if (!deposit) return res.status(404).json({ error: 'Depo a pa jwenn.' });
  if (deposit.status !== 'pending') {
    return res.status(409).json({ error: 'Depo sa a deja trete.' });
  }

  const [, updatedUser] = await prisma.$transaction([
    prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: 'confirmed', confirmedAt: new Date(), confirmedBy: req.user.id },
    }),
    prisma.user.update({
      where: { id: deposit.userId },
      data: { balance: { increment: deposit.amount } },
    }),
  ]);

  res.json({ ok: true, newBalance: updatedUser.balance });
});

adminRouter.post('/deposits/:id/reject', async (req, res) => {
  const deposit = await prisma.deposit.findUnique({ where: { id: req.params.id } });
  if (!deposit) return res.status(404).json({ error: 'Depo a pa jwenn.' });
  if (deposit.status !== 'pending') {
    return res.status(409).json({ error: 'Depo sa a deja trete.' });
  }

  await prisma.deposit.update({
    where: { id: deposit.id },
    data: { status: 'rejected', confirmedAt: new Date(), confirmedBy: req.user.id },
  });

  res.json({ ok: true });
});
