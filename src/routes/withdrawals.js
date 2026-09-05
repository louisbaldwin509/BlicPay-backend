import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { generateReference } from '../utils/reference.js';

export const withdrawalsRouter = Router();

const VALID_METHODS = ['moncash', 'natcash', 'usdt', 'zelle', 'biwo'];
const WITHDRAWAL_FEE_RATE = 0.0125; // 1.25% — kouvri kou operasyon (egzanp: frè MonCash pou soti kach)

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

  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { pinHash: true, feeableBalance: true } });
  if (!user?.pinHash) {
    return res.status(409).json({ error: 'Ou dwe kreye yon kòd PIN anvan ou ka fè yon retrè.' });
  }
  const pinValid = await bcrypt.compare(pin, user.pinHash);
  if (!pinValid) {
    return res.status(401).json({ error: 'Kòd PIN la pa kòrèk.' });
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
          method,
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
