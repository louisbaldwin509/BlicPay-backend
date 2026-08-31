import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';

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
// PA touche jiskaske apwobasyon an fèt. Kont lan dwe verifye (KYC) anvan.
//
// DEZAKTIVE TANPORÈMAN: fonksyonalite Prè a poko lanse bay kliyan yo
// (montre kòm "Talè" nan app la). Lojik orijinal la kite an kòmantè pi ba
// pou fasil remete l lè n pare pou louvri fonksyonalite a.
loansRouter.post('/request', requireVerified, async (req, res) => {
  return res.status(403).json({ error: 'Fonksyonalite Prè a poko disponib — l ap vini talè.' });
});

/*
loansRouter.post('/request', requireVerified, async (req, res) => {
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
*/

// Peye pwochen vèsman ki poko peye a — soti nan balans prensipal la.
//
// Balans lan ak estati vèsman an chanje nan operasyon atomik (updateMany
// ak kondisyon) pou anpeche double-peman si moun nan klike de fwa vit vit.
loansRouter.post('/:id/pay-installment', async (req, res) => {
  const loan = await prisma.loan.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { installments: { orderBy: { n: 'asc' } } },
  });
  if (!loan) return res.status(404).json({ error: 'Prè a pa jwenn.' });
  if (loan.status !== 'active') return res.status(409).json({ error: 'Prè sa a pa aktif.' });
  const next = loan.installments.find((i) => i.status === 'pending');
  if (!next) return res.status(409).json({ error: 'Tout vèsman yo deja peye.' });
  const isLast = loan.installments.every((i) => i.id === next.id || i.status === 'paid');

  try {
    await prisma.$transaction(async (tx) => {
      const balanceUpdate = await tx.user.updateMany({
        where: { id: req.user.id, balance: { gte: next.amount } },
        data: { balance: { decrement: next.amount } },
      });
      if (balanceUpdate.count === 0) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const installmentUpdate = await tx.loanInstallment.updateMany({
        where: { id: next.id, status: 'pending' },
        data: { status: 'paid', paidAt: new Date() },
      });
      if (installmentUpdate.count === 0) {
        throw new Error('ALREADY_PAID');
      }

      await tx.loan.update({ where: { id: loan.id }, data: { status: isLast ? 'paid' : 'active' } });
    });

    res.json({ ok: true, finished: isLast });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'Ou pa gen ase lajan pou vèsman sa a.' });
    }
    if (err.message === 'ALREADY_PAID') {
      return res.status(409).json({ error: 'Vèsman sa a deja peye.' });
    }
    throw err;
  }
});
