import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { generateReference } from '../utils/reference.js';

export const withdrawalsRouter = Router();

const VALID_METHODS = ['moncash', 'natcash', 'usdt', 'zelle', 'biwo'];

// Kreye yon demand retrè. Kliyan an DWE bay kòd PIN 4 chif li a — sa a
// ranplase seyans selfi Didit la (pi rapid, gratis, san rale tan). Balans
// lan RETIRE IMEDYATMAN (nan yon transaksyon atomik) pou anpeche moun nan
// mande menm lajan an de fwa pandan l ap tann admin.
withdrawalsRouter.post('/', requireAuth, requireVerified, async (req, res) => {
  const { amount, method, pin } = req.body;
  const numericAmount = Math.round(Number(amount));

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Metòd retrè a pa rekonèt.' });
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'Kòd PIN 4 chif la obligatwa.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { pinHash: true } });
  if (!user?.pinHash) {
    return res.status(409).json({ error: 'Ou dwe kreye yon kòd PIN anvan ou ka fè yon retrè.' });
  }
  const pinValid = await bcrypt.compare(pin, user.pinHash);
  if (!pinValid) {
    return res.status(401).json({ error: 'Kòd PIN la pa kòrèk.' });
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
