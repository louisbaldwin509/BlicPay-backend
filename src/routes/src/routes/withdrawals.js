import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';
import { generateReference } from '../utils/reference.js';

export const withdrawalsRouter = Router();

const VALID_METHODS = ['moncash', 'natcash', 'usdt', 'zelle', 'biwo'];

// Kreye yon demand retrè. Balans lan RETIRE IMEDYATMAN (nan yon transaksyon)
// pou anpeche moun nan mande menm lajan an de fwa pandan l ap tann admin.
// Si admin refize demand la pita, lajan an remèt (wè /admin/withdrawals/:id/reject).
withdrawalsRouter.post('/', requireAuth, async (req, res) => {
  const { amount, method } = req.body;
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Metòd retrè a pa rekonèt.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user.balance < numericAmount) {
    return res.status(400).json({ error: 'Ou pa gen ase lajan pou retrè sa a.' });
  }

  const [, withdrawal] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: Math.round(numericAmount) } } }),
    prisma.withdrawal.create({
      data: {
        userId: user.id,
        amount: Math.round(numericAmount),
        method,
        reference: generateReference('RET-'),
      },
    }),
  ]);

  res.status(201).json({ withdrawal });
});

withdrawalsRouter.get('/:id', requireAuth, async (req, res) => {
  const withdrawal = await prisma.withdrawal.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!withdrawal) return res.status(404).json({ error: 'Retrè a pa jwenn.' });
  res.json({ withdrawal });
});
