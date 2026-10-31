import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const walletRouter = Router();

// Maksimòm tranzaksyon retounen lè yon peryòd dat chwazi.
export const RANGE_LIMIT = 500;

// Li ?from= ak ?to= (dat ISO). Retounen null (pa gen filtè), 'invalid', oswa
// yon kondisyon Prisma { gte, lte }.
export function parseDateRange(query) {
  const { from, to } = query || {};
  if (!from && !to) return null;
  const cond = {};
  if (from) {
    const d = new Date(String(from));
    if (Number.isNaN(d.getTime())) return 'invalid';
    cond.gte = d;
  }
  if (to) {
    const d = new Date(String(to));
    if (Number.isNaN(d.getTime())) return 'invalid';
    cond.lte = d;
  }
  if (cond.gte && cond.lte && cond.gte > cond.lte) return 'invalid';
  return cond;
}

walletRouter.get('/balance', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ balance: user.balance });
});

// Melanje depo AK retrè nan menm istorik la, klase pa dat, chak youn make
// ak yon `type` ('depo' oswa 'retrè') pou front-end lan ka afiche siy +/- la
// ak koulè ki kòrèk.
//
// Opsyonèl: ?from=ISO&to=ISO pou filtre pa dat (app mobil la — filtè Istorik).
// San dat → menm konpòtman ak anvan (50 dènye yo).
walletRouter.get('/transactions', requireAuth, async (req, res) => {
  const range = parseDateRange(req.query);
  if (range === 'invalid') return res.status(400).json({ error: 'Dat yo pa valab.' });
  const where = { userId: req.user.id, ...(range ? { createdAt: range } : {}) };
  const take = range ? RANGE_LIMIT : 50;
  const [deposits, withdrawals, fees] = await Promise.all([
    prisma.deposit.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
    prisma.withdrawal.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
    prisma.platformFee.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
  ]);

  const merged = [
    ...deposits.map((d) => ({
      id: d.id,
      type: 'depo',
      method: d.method,
      amount: d.amount,
      status: d.status,
      createdAt: d.createdAt,
    })),
    ...withdrawals.map((w) => ({
      id: w.id,
      type: 'retrè',
      method: w.method,
      amount: w.amount,
      status: w.status,
      createdAt: w.createdAt,
    })),
    // Frè BLICPay (egz. ouvèti kont antrepriz) — parèt kòm yon sòti lajan.
    ...fees.map((f) => ({
      id: f.id,
      type: 'retrè',
      method: 'frè',
      amount: f.amount,
      status: 'confirmed',
      createdAt: f.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, take);

  res.json({ transactions: merged });
});
