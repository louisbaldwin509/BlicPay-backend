import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const loansRouter = Router();

loansRouter.use(requireAuth);

// Menm plan yo ak sa ki nan App.jsx (LOAN_PLANS) — dwe rete sinkwonize.
const LOAN_PLANS = [
  { months: 3, rate: 0.08 },
  { months: 6, rate: 0.14 },
  { months: 12, rate: 0.24 },
];

loansRouter.get('/my', async (req, res) => {
  const loans = await prisma.loan.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: { installments: { orderBy: { n: 'asc' } } },
  });
  res.json({ loans });
});

// Kreye yon demand prè — rete "pending" jiskaske admin apwouve l. Balans lan
// PA touche jiskaske apwobasyon an fèt.
loansRouter.post('/request', async (req, res) => {
  const { amount, planIdx } = req.body;
  const numericAmount = Number(amount);
  const plan = LOAN_PLANS[planIdx];

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!plan) return res.status(400).json({ error: 'Plan prè a pa valab.' });

  const activeLoan = await prisma.loan.findFirst({ where: { userId: req.user.id, status: { in: ['pending', 'active'] } } });
  if (activeLoan) return res.status(409).json({ error: 'Ou gen yon prè an kou deja.' });

  const totalDue = Math.round(numericAmount * (1 + plan.rate));
  const installmentAmount = Math.round(totalDue / plan.months);

  const loan = await prisma.loan.create({
    data: {
      userId: req.user.id,
      amount: Math.round(numericAmount),
      months: plan.months,
      rate: plan.rate,
      totalDue,
      installmentAmount,
    },
  });

  res.status(201).json({ loan });
});

// Peye pwochen vèsman ki poko peye a — soti nan balans prensipal la.
loansRouter.post('/:id/pay-installment', async (req, res) => {
  const loan = await prisma.loan.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { installments: { orderBy: { n: 'asc' } } },
  });
  if (!loan) return res.status(404).json({ error: 'Prè a pa jwenn.' });
  if (loan.status !== 'active') return res.status(409).json({ error: 'Prè sa a pa aktif.' });

  const next = loan.installments.find((i) => i.status === 'pending');
  if (!next) return res.status(409).json({ error: 'Tout vèsman yo deja peye.' });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user.balance < next.amount) return res.status(400).json({ error: 'Ou pa gen ase lajan pou vèsman sa a.' });

  const isLast = loan.installments.every((i) => i.id === next.id || i.status === 'paid');

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: next.amount } } }),
    prisma.loanInstallment.update({ where: { id: next.id }, data: { status: 'paid', paidAt: new Date() } }),
    prisma.loan.update({ where: { id: loan.id }, data: { status: isLast ? 'paid' : 'active' } }),
  ]);

  res.json({ ok: true, finished: isLast });
});
