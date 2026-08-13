import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const pocketsRouter = Router();

pocketsRouter.use(requireAuth);

pocketsRouter.get('/', async (req, res) => {
  const pockets = await prisma.pocket.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'asc' } });
  res.json({ pockets });
});

pocketsRouter.post('/', async (req, res) => {
  const { name, target } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Bay pòch la yon non.' });

  const pocket = await prisma.pocket.create({
    data: { userId: req.user.id, name: name.trim(), target: target ? Math.round(Number(target)) : null },
  });
  res.status(201).json({ pocket });
});

// Mete lajan nan yon pòch — soti nan balans prensipal la.
pocketsRouter.post('/:id/deposit', async (req, res) => {
  const { amount } = req.body;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }

  const pocket = await prisma.pocket.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!pocket) return res.status(404).json({ error: 'Pòch la pa jwenn.' });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user.balance < numericAmount) return res.status(400).json({ error: 'Ou pa gen ase nan kont prensipal la.' });

  const [, updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: Math.round(numericAmount) } } }),
    prisma.pocket.update({ where: { id: pocket.id }, data: { balance: { increment: Math.round(numericAmount) } } }),
  ]);

  res.json({ pocket: updated });
});

// Depanse (retire) lajan nan yon pòch — lajan an SOTI nèt (pa retounen nan balans prensipal la).
pocketsRouter.post('/:id/spend', async (req, res) => {
  const { amount } = req.body;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }

  const pocket = await prisma.pocket.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!pocket) return res.status(404).json({ error: 'Pòch la pa jwenn.' });
  if (pocket.balance < numericAmount) return res.status(400).json({ error: 'Pa gen ase lajan nan pòch sa a.' });

  const updated = await prisma.pocket.update({
    where: { id: pocket.id },
    data: { balance: { decrement: Math.round(numericAmount) } },
  });

  res.json({ pocket: updated });
});

// Transfè ant de pòch, oswa soti nan yon pòch tounen nan kont prensipal la
// (lè "to" se "main").
pocketsRouter.post('/:id/transfer', async (req, res) => {
  const { amount, to } = req.body;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }

  const pocket = await prisma.pocket.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!pocket) return res.status(404).json({ error: 'Pòch la pa jwenn.' });
  if (pocket.balance < numericAmount) return res.status(400).json({ error: 'Pa gen ase lajan nan pòch sa a.' });

  if (to === 'main') {
    const [, updated] = await prisma.$transaction([
      prisma.user.update({ where: { id: req.user.id }, data: { balance: { increment: Math.round(numericAmount) } } }),
      prisma.pocket.update({ where: { id: pocket.id }, data: { balance: { decrement: Math.round(numericAmount) } } }),
    ]);
    return res.json({ pocket: updated });
  }

  const destPocket = await prisma.pocket.findFirst({ where: { id: to, userId: req.user.id } });
  if (!destPocket) return res.status(404).json({ error: 'Pòch destinasyon an pa jwenn.' });

  const [updatedSource] = await prisma.$transaction([
    prisma.pocket.update({ where: { id: pocket.id }, data: { balance: { decrement: Math.round(numericAmount) } } }),
    prisma.pocket.update({ where: { id: destPocket.id }, data: { balance: { increment: Math.round(numericAmount) } } }),
  ]);

  res.json({ pocket: updatedSource });
});
