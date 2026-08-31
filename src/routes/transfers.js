import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';

export const transfersRouter = Router();

transfersRouter.use(requireAuth);

// Voye lajan bay yon lòt kliyan BLICPay, idantifye pa nimewo telefòn li.
//
// Verifikasyon balans lan ak dekont lan fèt nan YON SÈL operasyon atomik
// (updateMany ak yon kondisyon `balance >= montan`) pou anpeche de transfè
// ki soti anba men (double-klik, koneksyon lan) pase tou de an menm tan
// epi mennen balans lan anba 0.
transfersRouter.post('/', requireVerified, async (req, res) => {
  const { clientId, amount } = req.body;
  const numericAmount = Math.round(Number(amount));
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!clientId?.trim()) {
    return res.status(400).json({ error: 'ID kliyan destinatè a obligatwa.' });
  }
  const recipient = await prisma.user.findUnique({ where: { clientId: clientId.trim() } });
  if (!recipient) return res.status(404).json({ error: 'Pa gen okenn kont BLICPay ak ID sa a.' });
  if (recipient.id === req.user.id) return res.status(400).json({ error: 'Ou pa ka voye lajan bay tèt ou.' });

  try {
    const transfer = await prisma.$transaction(async (tx) => {
      const senderUpdate = await tx.user.updateMany({
        where: { id: req.user.id, balance: { gte: numericAmount } },
        data: { balance: { decrement: numericAmount } },
      });
      if (senderUpdate.count === 0) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      await tx.user.update({
        where: { id: recipient.id },
        data: { balance: { increment: numericAmount } },
      });

      return tx.transfer.create({
        data: { fromUserId: req.user.id, toUserId: recipient.id, amount: numericAmount },
      });
    });

    res.status(201).json({ transfer });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'Ou pa gen ase lajan pou transfè sa a.' });
    }
    throw err;
  }
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
