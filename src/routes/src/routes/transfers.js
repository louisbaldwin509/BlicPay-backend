import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';

export const transfersRouter = Router();

transfersRouter.use(requireAuth);

// Voye lajan bay yon lòt kliyan BLICPay, idantifye pa nimewo telefòn li.
// Balans yo ajiste nan yon sèl transaksyon atomik. Kont lan dwe verifye (KYC)
// anvan li ka voye lajan.
transfersRouter.post('/', requireVerified, async (req, res) => {
  const { clientId, amount } = req.body;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!clientId?.trim()) {
    return res.status(400).json({ error: 'ID kliyan destinatè a obligatwa.' });
  }
  const recipient = await prisma.user.findUnique({ where: { clientId: clientId.trim() } });
  if (!recipient) return res.status(404).json({ error: 'Pa gen okenn kont BLICPay ak ID sa a.' });
  if (recipient.id === req.user.id) return res.status(400).json({ error: 'Ou pa ka voye lajan bay tèt ou.' });
  const sender = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (sender.balance < numericAmount) return res.status(400).json({ error: 'Ou pa gen ase lajan pou transfè sa a.' });
  const [, , transfer] = await prisma.$transaction([
    prisma.user.update({ where: { id: sender.id }, data: { balance: { decrement: Math.round(numericAmount) } } }),
    prisma.user.update({ where: { id: recipient.id }, data: { balance: { increment: Math.round(numericAmount) } } }),
    prisma.transfer.create({
      data: { fromUserId: sender.id, toUserId: recipient.id, amount: Math.round(numericAmount) },
    }),
  ]);
  res.status(201).json({ transfer });
});

transfersRouter.get('/my', async (req, res) => {
  const transfers = await prisma.transfer.findMany({
    where: { OR: [{ fromUserId: req.user.id }, { toUserId: req.user.id }] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      fromUser: { select: { fullName: true, phone: true } },
      toUser: { select: { fullName: true, phone: true } },
    },
  });
  res.json({ transfers });
});
