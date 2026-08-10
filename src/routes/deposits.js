import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';
import { generateReference } from '../utils/reference.js';

export const depositsRouter = Router();

const VALID_METHODS = ['moncash', 'natcash', 'usdt', 'zelle', 'biwo'];

// Create a deposit request. Every deposit starts as "pending" — nothing
// here touches the user's balance. A deposit only becomes "confirmed"
// (and the balance only increases) through:
//   - an admin manually confirming it (used for "biwo" cash deposits), or
//   - a verified webhook from the payment provider (see README — this is
//     the part that needs real MonCash/NatCash/USDT/Zelle integration
//     before this can go live).
depositsRouter.post('/', requireAuth, async (req, res) => {
  const { amount, method } = req.body;
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Metòd depo a pa rekonèt.' });
  }

  const deposit = await prisma.deposit.create({
    data: {
      userId: req.user.id,
      amount: Math.round(numericAmount),
      method,
      reference: generateReference(),
    },
  });

  res.status(201).json({ deposit });
});

// Used by the app's "refresh" button to poll whether a specific deposit
// has been confirmed yet.
depositsRouter.get('/:id', requireAuth, async (req, res) => {
  const deposit = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!deposit) return res.status(404).json({ error: 'Depo a pa jwenn.' });
  res.json({ deposit });
});
