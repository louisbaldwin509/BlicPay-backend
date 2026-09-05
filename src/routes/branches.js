import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const branchesRouter = Router();

// Kliyan an rele sa a pou l wè lis siikisal ki disponib, lè l chwazi "Nan
// biwo" pou yon depo oswa yon retrè.
branchesRouter.get('/', requireAuth, async (req, res) => {
  const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' }, select: { name: true } });
  res.json({ branches: branches.map((b) => b.name) });
});
