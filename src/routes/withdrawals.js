import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { generateReference } from '../utils/reference.js';

export const withdrawalsRouter = Router();

const VALID_METHODS = ['moncash', 'natcash', 'usdt', 'zelle', 'biwo'];
const WITHDRAWAL_FEE_RATE = 0.0125; // 1.25% — kouvri kou operasyon (egzanp: frè MonCash pou soti kach)
const MIN_WITHDRAWAL_AMOUNT = 250; // montan minimòm pou yon retrè, an HTG

// Plafon retrè — sèlman aplike sou lajan ki PA soti nan yon pòch Sòl (wè
// `solPayoutBalance` pi ba a). Yon moun ki fèk resevwa yon gwo pòch Sòl ka
// toujou retire l antye menm jou a, san limit sa yo bloke l.
const DAILY_CAP = 80_000;
const WEEKLY_CAP = 300_000;
const MONTHLY_CAP = 500_000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Kliyan an rele sa a AVAN li konfime ak PIN, pou l wè frè EGZAK la (pa yon
// estimasyon) anvan li aksepte — kalkil la depann de `feeableBalance` li,
// yon bagay kliyan an pa ka kalkile pou kont li nan App.jsx.
withdrawalsRouter.get('/fee-preview', requireAuth, async (req, res) => {
  const numericAmount = Math.round(Number(req.query.amount));
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { feeableBalance: true } });
  const feeableAmount = Math.min(numericAmount, user?.feeableBalance || 0);
  const fee = Math.round(feeableAmount * WITHDRAWAL_FEE_RATE);

  res.json({ fee, total: numericAmount + fee });
});

// Kreye yon demand retrè. Kliyan an DWE bay kòd PIN 4 chif li a — sa a
// ranplase seyans selfi Didit la (pi rapid, gratis, san rale tan). Balans
// lan RETIRE IMEDYATMAN (nan yon transaksyon atomik) pou anpeche moun nan
// mande menm lajan an de fwa pandan l ap tann admin.
//
// FRÈ 1.25%: sèlman sou pòsyon lajan an ki tras a yon depo ELEKTWONIK
// (MonCash, elt.) — swiv ak `feeableBalance` sou kont lan. Lajan ki soti nan
// yon pòch Sòl, yon transfè, oswa yon Depo Ak Objektif pa janm ogmante
// `feeableBalance`, kidonk retire l pa janm koute anyen, kèlkeswa metòd la
// (menm MonCash oswa succursale). Sa evite yon moun peye de fwa (yon fwa nan
// frè entegrasyon Sòl, yon lòt fwa nan frè retrè) pou menm lajan an.
//
// PLAFON JOU/SEMÈN/MWA: sèlman aplike sou pòsyon ki PA soti nan yon pòch
// Sòl (swiv ak `solPayoutBalance`, menm mekanis ak `feeableBalance`).
withdrawalsRouter.post('/', requireAuth, requireVerified, async (req, res) => {
  const { amount, method, pin, branch } = req.body;
  const numericAmount = Math.round(Number(amount));

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (numericAmount < MIN_WITHDRAWAL_AMOUNT) {
    return res.status(400).json({ error: `Montan minimòm pou yon retrè se ${MIN_WITHDRAWAL_AMOUNT} HTG.` });
  }
  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Metòd retrè a pa rekonèt.' });
  }
  if (method === 'biwo' && !branch?.trim()) {
    return res.status(400).json({ error: 'Chwazi yon siikisal.' });
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'Kòd PIN 4 chif la obligatwa.' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { pinHash: true, feeableBalance: true, solPayoutBalance: true },
  });
  if (!user?.pinHash) {
    return res.status(409).json({ error: 'Ou dwe kreye yon kòd PIN anvan ou ka fè yon retrè.' });
  }
  const pinValid = await bcrypt.compare(pin, user.pinHash);
  if (!pinValid) {
    return res.status(401).json({ error: 'Kòd PIN la pa kòrèk.' });
  }

  // Pòsyon ki soti nan yon pòch Sòl pa konte nan plafon yo.
  const solExemptAmount = Math.min(numericAmount, user.solPayoutBalance);
  const cappedAmount = numericAmount - solExemptAmount;

  if (cappedAmount > 0) {
    const [dayAgg, weekAgg, monthAgg] = await Promise.all([
      prisma.withdrawal.aggregate({
        where: { userId: req.user.id, status: { not: 'rejected' }, createdAt: { gte: startOfToday() } },
        _sum: { cappedAmount: true },
      }),
      prisma.withdrawal.aggregate({
        where: { userId: req.user.id, status: { not: 'rejected' }, createdAt: { gte: daysAgo(7) } },
        _sum: { cappedAmount: true },
      }),
      prisma.withdrawal.aggregate({
        where: { userId: req.user.id, status: { not: 'rejected' }, createdAt: { gte: startOfMonth() } },
        _sum: { cappedAmount: true },
      }),
    ]);

    const usedToday = dayAgg._sum.cappedAmount || 0;
    const usedThisWeek = weekAgg._sum.cappedAmount || 0;
    const usedThisMonth = monthAgg._sum.cappedAmount || 0;

    if (usedToday + cappedAmount > DAILY_CAP) {
      return res.status(400).json({ error: `Ou depase plafon retrè pa jou a (${DAILY_CAP.toLocaleString('fr-FR')} HTG). Ou ka retire ${(DAILY_CAP - usedToday).toLocaleString('fr-FR')} HTG anplis jodi a.` });
    }
    if (usedThisWeek + cappedAmount > WEEKLY_CAP) {
      return res.status(400).json({ error: `Ou depase plafon retrè pa semèn nan (${WEEKLY_CAP.toLocaleString('fr-FR')} HTG).` });
    }
    if (usedThisMonth + cappedAmount > MONTHLY_CAP) {
      return res.status(400).json({ error: `Ou depase plafon retrè pa mwa a (${MONTHLY_CAP.toLocaleString('fr-FR')} HTG).` });
    }
  }

  const feeableAmount = Math.min(numericAmount, user.feeableBalance);
  const fee = Math.round(feeableAmount * WITHDRAWAL_FEE_RATE);
  const totalDeducted = numericAmount + fee;

  try {
    const withdrawal = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.user.updateMany({
        where: { id: req.user.id, balance: { gte: totalDeducted } },
        data: {
          balance: { decrement: totalDeducted },
          feeableBalance: { decrement: feeableAmount },
          solPayoutBalance: { decrement: solExemptAmount },
        },
      });

      if (updateResult.count === 0) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      return tx.withdrawal.create({
        data: {
          userId: req.user.id,
          amount: numericAmount,
          fee,
          cappedAmount,
          method,
          branch: method === 'biwo' ? branch.trim() : null,
          reference: generateReference('RET-'),
        },
      });
    });

    res.status(201).json({ withdrawal });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: `Ou pa gen ase lajan — retrè sa a mande ${totalDeducted.toLocaleString('fr-FR')} HTG (montan + ${fee.toLocaleString('fr-FR')} HTG frè).` });
    }
    throw err;
  }
});

withdrawalsRouter.get('/:id', requireAuth, async (req, res) => {
  const withdrawal = await prisma.withdrawal.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!withdrawal) return res.status(404).json({ error: 'Retrè a pa jwenn.' });
  res.json({ withdrawal });
});
