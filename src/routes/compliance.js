// KONFÒMITE — jounal odit, siveyans tranzaksyon (ak alèt), rekonsilyasyon fon.
// Tout wout yo se pou SIPÈ ADMIN sèlman.
import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { RULES, computeAlerts } from '../utils/monitoringRules.js';

export const complianceRouter = Router();
// Sèlman sou wout pa yo — routè a monte sou /admin ansanm ak lòt routè yo.
complianceRouter.use(['/audit', '/monitoring', '/reconciliation'], requireAuth, requireAdmin);

const DAY = 86400000;

function parseRange(q, defaultDays = 30) {
  const to = q.to ? new Date(String(q.to)) : new Date();
  const from = q.from ? new Date(String(q.from)) : new Date(to.getTime() - defaultDays * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

const USER_SEL = { id: true, fullName: true, phone: true, clientId: true, verified: true, accountType: true };

// ---------------------------------------------------------------------------
// JOUNAL ODIT
// ---------------------------------------------------------------------------
complianceRouter.get('/audit', async (req, res) => {
  const range = parseRange(req.query, 90);
  if (!range) return res.status(400).json({ error: 'Dat yo pa valab.' });
  const where = { createdAt: { gte: range.from, lte: range.to } };
  if (req.query.actorId) where.actorId = String(req.query.actorId);
  if (req.query.q) {
    const q = String(req.query.q);
    where.OR = [{ path: { contains: q, mode: 'insensitive' } }, { actorName: { contains: q, mode: 'insensitive' } }];
  }
  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(Number(req.query.limit) || 300, 1000) });
  res.json({ logs });
});

// ---------------------------------------------------------------------------
// SIVEYANS TRANZAKSYON
// ---------------------------------------------------------------------------
async function loadTransactions(range) {
  const where = { createdAt: { gte: range.from, lte: range.to } };
  const [deposits, withdrawals, transfers] = await Promise.all([
    prisma.deposit.findMany({ where, include: { user: { select: USER_SEL } }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.withdrawal.findMany({ where, include: { user: { select: USER_SEL } }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.transfer.findMany({ where, include: { fromUser: { select: USER_SEL }, toUser: { select: USER_SEL } }, orderBy: { createdAt: 'desc' }, take: 2000 }),
  ]);
  const rows = [
    ...deposits.map((d) => ({ id: d.id, kind: 'deposit', reference: d.reference, amount: d.amount, fee: 0, method: d.method, status: d.status, createdAt: d.createdAt, user: d.user, counterparty: null, branch: d.branch })),
    ...withdrawals.map((w) => ({ id: w.id, kind: 'withdrawal', reference: w.reference, amount: w.amount, fee: w.fee, method: w.method, status: w.status, createdAt: w.createdAt, user: w.user, counterparty: w.destinationName ? { fullName: w.destinationName, phone: w.destinationNumber } : null, branch: w.branch })),
    ...transfers.map((t) => ({ id: t.id, kind: 'transfer', reference: `TRF-${t.id.slice(-8).toUpperCase()}`, amount: t.amount, fee: 0, method: 'blicpay', status: 'confirmed', createdAt: t.createdAt, user: t.fromUser, counterparty: t.toUser, branch: null })),
  ];
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

complianceRouter.get('/monitoring/transactions', async (req, res) => {
  const range = parseRange(req.query, 30);
  if (!range) return res.status(400).json({ error: 'Dat yo pa valab.' });
  let rows = await loadTransactions(range);
  const { kind, status, q } = req.query;
  const min = Number(req.query.min) || 0;
  if (kind && kind !== 'all') rows = rows.filter((r) => r.kind === kind);
  if (status && status !== 'all') rows = rows.filter((r) => r.status === status);
  if (min > 0) rows = rows.filter((r) => r.amount >= min);
  if (q) {
    const s = String(q).toLowerCase();
    rows = rows.filter((r) => [r.reference, r.user?.fullName, r.user?.phone, r.user?.clientId, r.counterparty?.fullName, r.counterparty?.phone].some((v) => v && String(v).toLowerCase().includes(s)));
  }
  const totals = {
    count: rows.length,
    volume: rows.filter((r) => r.status !== 'rejected').reduce((s, r) => s + r.amount, 0),
    deposits: rows.filter((r) => r.kind === 'deposit' && r.status === 'confirmed').reduce((s, r) => s + r.amount, 0),
    withdrawals: rows.filter((r) => r.kind === 'withdrawal' && r.status === 'confirmed').reduce((s, r) => s + r.amount, 0),
    transfers: rows.filter((r) => r.kind === 'transfer').reduce((s, r) => s + r.amount, 0),
  };
  res.json({ transactions: rows.slice(0, 1000), totals, range });
});

complianceRouter.get('/monitoring/alerts', async (req, res) => {
  const rows = await loadTransactions({ from: new Date(Date.now() - 30 * DAY), to: new Date() });
  const computed = computeAlerts(rows);
  if (computed.length) {
    await prisma.monitoringAlert.createMany({ data: computed, skipDuplicates: true });
  }
  const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : undefined;
  const alerts = await prisma.monitoringAlert.findMany({ where: status ? { status } : {}, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 500 });
  const ids = [...new Set(alerts.map((a) => a.userId).filter(Boolean))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: USER_SEL });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const counts = await prisma.monitoringAlert.groupBy({ by: ['status'], _count: { _all: true } });
  res.json({
    alerts: alerts.map((a) => ({ ...a, user: a.userId ? byId[a.userId] ?? null : null })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    rules: RULES,
  });
});

complianceRouter.patch('/monitoring/alerts/:id', async (req, res) => {
  const { status, note } = req.body || {};
  if (!['open', 'reviewed', 'escalated'].includes(status)) return res.status(400).json({ error: 'Estati a pa valab.' });
  if (status !== 'open' && !String(note || '').trim()) return res.status(400).json({ error: 'Yon nòt obligatwa pou fèmen oswa eskalade yon alèt.' });
  const alert = await prisma.monitoringAlert.update({
    where: { id: req.params.id },
    data: { status, note: note ? String(note).slice(0, 1000) : null, reviewedBy: req.user.id, reviewedAt: status === 'open' ? null : new Date() },
  }).catch(() => null);
  if (!alert) return res.status(404).json({ error: 'Alèt la pa jwenn.' });
  res.json({ alert });
});

// ---------------------------------------------------------------------------
// REKONSILYASYON — lajan kliyan yo (pasif) kont lajan BLICPay kenbe (aktif)
// ---------------------------------------------------------------------------
complianceRouter.get('/reconciliation', async (req, res) => {
  const clientWhere = { role: 'member', deletedAt: null };
  const [bal, pockets, goals, pendingW, pendingD, reserves, clients] = await Promise.all([
    prisma.user.aggregate({ where: clientWhere, _sum: { balance: true } }),
    prisma.pocket.aggregate({ _sum: { balance: true } }),
    prisma.savingsGoal.aggregate({ where: { status: { in: ['active', 'completed'] } }, _sum: { saved: true } }),
    prisma.withdrawal.aggregate({ where: { status: 'pending' }, _sum: { amount: true, fee: true }, _count: { _all: true } }),
    prisma.deposit.aggregate({ where: { status: 'pending' }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.platformReserve.findMany({ orderBy: { method: 'asc' } }),
    prisma.user.count({ where: clientWhere }),
  ]);
  const liabilities = {
    clientBalances: bal._sum.balance || 0,
    pockets: pockets._sum.balance || 0,
    savingsGoals: goals._sum.saved || 0,
    pendingWithdrawals: pendingW._sum.amount || 0, // deja retire nan balans, poko voye
  };
  const totalLiabilities = Object.values(liabilities).reduce((s, v) => s + v, 0);
  const assets = Object.fromEntries(['moncash', 'natcash', 'bank', 'cash'].map((m) => [m, reserves.find((r) => r.method === m)?.balance ?? 0]));
  const totalAssets = Object.values(assets).reduce((s, v) => s + v, 0);
  res.json({
    asOf: new Date(),
    clients,
    liabilities,
    totalLiabilities,
    assets,
    totalAssets,
    difference: totalAssets - totalLiabilities, // > 0 = sifizan, < 0 = mank
    coverage: totalLiabilities > 0 ? totalAssets / totalLiabilities : null,
    pending: { withdrawalsCount: pendingW._count._all, withdrawalFees: pendingW._sum.fee || 0, depositsCount: pendingD._count._all, depositsAmount: pendingD._sum.amount || 0 },
    reserves,
  });
});
