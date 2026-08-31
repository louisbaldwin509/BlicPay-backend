import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { generateReference } from '../utils/reference.js';

export const withdrawalsRouter = Router();

const VALID_METHODS = ['moncash', 'natcash', 'usdt', 'zelle', 'biwo'];

// Kreye yon demand retrè. Balans lan RETIRE IMEDYATMAN (nan yon transaksyon)
// pou anpeche moun nan mande menm lajan an de fwa pandan l ap tann admin.
// Si admin refize demand la pita, lajan an remèt (wè /admin/withdrawals/:id/reject).
//
// Verifikasyon balans lan ak dekont lan fèt nan YON SÈL operasyon atomik
// (updateMany ak yon kondisyon `balance >= montan`) pou anpeche de demand
// ki soti anba men (double-klik, koneksyon lan) pase tou de an menm tan
// epi mennen balans lan anba 0.
withdrawalsRouter.post('/', requireAuth, requireVerified, async (req, res) => {
  const { amount, method } = req.body;
  const numericAmount = Math.round(Number(amount));

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Metòd retrè a pa rekonèt.' });
  }

  try {
    const withdrawal = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.user.updateMany({
        where: { id: req.user.id, balance: { gte: numericAmount } },
        data: { balance: { decrement: numericAmount } },
      });

      if (updateResult.count === 0) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      return tx.withdrawal.create({
        data: {
          userId: req.user.id,
          amount: numericAmount,
          method,
          reference: generateReference('RET-'),
        },
      });
    });

    res.status(201).json({ withdrawal });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'Ou pa gen ase lajan pou retrè sa a.' });
    }
    throw err;
  }
});

withdrawalsRouter.get('/:id', requireAuth, async (req, res) => {
  const withdrawal = await prisma.withdrawal.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!withdrawal) return res.status(404).json({ error: 'Retrè a pa jwenn.' });
  res.json({ withdrawal });
});
