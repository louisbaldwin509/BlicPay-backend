import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const goalsRouter = Router();

goalsRouter.use(requireAuth);

goalsRouter.get('/', async (req, res) => {
  const goals = await prisma.savingsGoal.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
  res.json({ goals });
});

goalsRouter.post('/', async (req, res) => {
  const { title, target } = req.body;
  const numericTarget = Number(target);

  if (!title?.trim()) return res.status(400).json({ error: 'Yon tit obligatwa.' });
  if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
    return res.status(400).json({ error: 'Sib la pa valab.' });
  }

  const goal = await prisma.savingsGoal.create({
    data: { userId: req.user.id, title: title.trim(), target: Math.round(numericTarget) },
  });
  res.status(201).json({ goal });
});

// Mete lajan nan yon objektif — soti nan balans prensipal la, antre nan objektif la.
goalsRouter.post('/:id/deposit', async (req, res) => {
  const { amount } = req.body;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }

  const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!goal) return res.status(404).json({ error: 'Objektif la pa jwenn.' });
  if (goal.status !== 'active') return res.status(409).json({ error: 'Objektif sa a pa aktif ankò.' });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user.balance < numericAmount) return res.status(400).json({ error: 'Ou pa gen ase lajan.' });

  const newSaved = goal.saved + Math.round(numericAmount);
  const [, updatedGoal] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: Math.round(numericAmount) } } }),
    prisma.savingsGoal.update({
      where: { id: goal.id },
      data: { saved: newSaved, status: newSaved >= goal.target ? 'completed' : 'active' },
    }),
  ]);

  res.json({ goal: updatedGoal });
});

// Retire tout lajan ki nan yon objektif, remèt li nan balans prensipal la.
// Si `emergency` true, aplike yon frè 4.5% (retrè anvan objektif la atenn).
const EMERGENCY_FEE_RATE = 0.045;

goalsRouter.post('/:id/withdraw', async (req, res) => {
  const { emergency } = req.body;
  const goal = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!goal) return res.status(404).json({ error: 'Objektif la pa jwenn.' });
  if (goal.status === 'withdrawn') return res.status(409).json({ error: 'Objektif sa a deja retire.' });
  if (!emergency && goal.status !== 'completed') {
    return res.status(409).json({ error: 'Objektif sa a poko atenn — sèvi ak retrè ijans si ou vle retire l kanmenm.' });
  }

  const fee = emergency ? Math.round(goal.saved * EMERGENCY_FEE_RATE) : 0;
  const net = goal.saved - fee;

  const [, updatedGoal] = await prisma.$transaction([
    prisma.user.update({ where: { id: req.user.id }, data: { balance: { increment: net } } }),
    prisma.savingsGoal.update({ where: { id: goal.id }, data: { status: 'withdrawn' } }),
  ]);

  res.json({ goal: updatedGoal, fee, net });
});
