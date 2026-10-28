import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { parseDateRange, RANGE_LIMIT } from './wallet.js';
import { displayName } from '../utils/businessTypes.js';

export const transfersRouter = Router();

const PARTY_SELECT = { fullName: true, phone: true, accountType: true, business: { select: { status: true, tradeName: true, legalName: true } } };

// Masque non yon moun (konfidansyalite): "Victor Beaubrun" → "Victor B."
function maskPerson(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

transfersRouter.use(requireAuth);

// Voye lajan bay yon lòt kliyan BLICPay, idantifye pa nimewo telefòn li.
//
// Verifikasyon balans lan ak dekont lan fèt nan YON SÈL operasyon atomik
// (updateMany ak yon kondisyon `balance >= montan`) pou anpeche de transfè
// ki soti anba men (double-klik, koneksyon lan) pase tou de an menm tan
// epi mennen balans lan anba 0.
transfersRouter.post('/', requireVerified, async (req, res) => {
  const { clientId, amount } = req.body;
  const numericAmount = Math.round(Number(amount));
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!clientId?.trim()) {
    return res.status(400).json({ error: 'ID kliyan destinatè a obligatwa.' });
  }
  const recipient = await prisma.user.findUnique({ where: { clientId: clientId.trim() } });
  if (!recipient) return res.status(404).json({ error: 'Pa gen okenn kont BLICPay ak ID sa a.' });
  if (recipient.id === req.user.id) return res.status(400).json({ error: 'Ou pa ka voye lajan bay tèt ou.' });

  try {
    const transfer = await prisma.$transaction(async (tx) => {
      const senderUpdate = await tx.user.updateMany({
        where: { id: req.user.id, balance: { gte: numericAmount } },
        data: { balance: { decrement: numericAmount } },
      });
      if (senderUpdate.count === 0) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      await tx.user.update({
        where: { id: recipient.id },
        data: { balance: { increment: numericAmount } },
      });

      return tx.transfer.create({
        data: { fromUserId: req.user.id, toUserId: recipient.id, amount: numericAmount },
      });
    });

    res.status(201).json({ transfer });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'Ou pa gen ase lajan pou transfè sa a.' });
    }
    throw err;
  }
});

// Montre non destinatè a ANVAN kliyan an konfime yon transfè (oswa yon peman
// QR bay yon antrepriz). Non moun yo maske; non antrepriz yo montre an plen.
transfersRouter.get('/recipient/:clientId', async (req, res) => {
  const u = await prisma.user.findUnique({ where: { clientId: req.params.clientId.trim().toUpperCase() }, select: { ...PARTY_SELECT, id: true, deletedAt: true } });
  if (!u || u.deletedAt) return res.status(404).json({ error: 'Pa gen okenn kont BLICPay ak ID sa a.' });
  const isBusiness = u.accountType === 'business' && u.business?.status === 'approved';
  res.json({ recipient: { name: isBusiness ? displayName(u) : maskPerson(u.fullName), isBusiness, self: u.id === req.user.id } });
});

transfersRouter.get('/my', async (req, res) => {
  const range = parseDateRange(req.query);
  if (range === 'invalid') return res.status(400).json({ error: 'Dat yo pa valab.' });
  const transfers = await prisma.transfer.findMany({
    where: { OR: [{ fromUserId: req.user.id }, { toUserId: req.user.id }], ...(range ? { createdAt: range } : {}) },
    orderBy: { createdAt: 'desc' },
    take: range ? RANGE_LIMIT : 50,
    include: {
      fromUser: { select: PARTY_SELECT },
      toUser: { select: PARTY_SELECT },
    },
  });
  // Montre non komèsyal antrepriz apwouve yo olye non reprezantan an.
  const shape = (u) => ({ fullName: displayName(u), phone: u.phone, isBusiness: u.accountType === 'business' && u.business?.status === 'approved' });
  res.json({ transfers: transfers.map((t) => ({ ...t, fromUser: shape(t.fromUser), toUser: shape(t.toUser) })) });
});
