import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { generateReference } from '../utils/reference.js';
import { notifyUser } from '../utils/notify.js';
import { createMoncashPayment, retrieveMoncashTransaction } from '../utils/moncash.js';

export const moncashRouter = Router();

const CLIENT_APP_URL = process.env.CLIENT_APP_URL || 'https://blicpayht.com';

// Etap 1: kliyan an mande yon depo MonCash. Nou kreye yon anrejistreman
// "pending" lokal, epi nou kreye sesyon peman an kot MonCash — kliyan an
// redirije vè paj MonCash pou l peye.
moncashRouter.post('/start', requireAuth, requireVerified, async (req, res) => {
  const { amount } = req.body;
  const numericAmount = Math.round(Number(amount));

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }

  const reference = generateReference('MCH-');

  try {
    const { paymentUrl } = await createMoncashPayment(numericAmount, reference);

    await prisma.deposit.create({
      data: { userId: req.user.id, amount: numericAmount, method: 'moncash', reference },
    });

    res.status(201).json({ paymentUrl });
  } catch (err) {
    console.error('MonCash start error:', err);
    res.status(502).json({ error: 'Nou pa t kapab kòmanse peman MonCash la — eseye ankò pita.' });
  }
});

// Etap 2: MonCash redirije NAVIGATÈ kliyan an isit la apre peman an, ak yon
// transactionId nan lyen an. Nou PA fè konfyans a paramèt sa a pou kont li —
// nou redemande DIRÈKTEMAN MonCash konfime tranzaksyon an anvan nou kredite
// okenn balans. Wout sa a piblik (MonCash pa ka voye yon Authorization
// Bearer BLICPay), kidonk pa gen requireAuth.
moncashRouter.get('/callback', async (req, res) => {
  const transactionId = req.query.transactionId;
  if (!transactionId) {
    return res.redirect(`${CLIENT_APP_URL}/depo-echwe`);
  }

  try {
    const transaction = await retrieveMoncashTransaction(transactionId);
    const deposit = await prisma.deposit.findUnique({ where: { reference: transaction.reference } });

    if (!deposit) {
      console.warn('MonCash callback: depo pa jwenn pou referans', transaction.reference);
      return res.redirect(`${CLIENT_APP_URL}/depo-echwe`);
    }
    if (deposit.status !== 'pending') {
      // Deja trete — evite doub-kredite si MonCash rele callback la de fwa.
      return res.redirect(`${CLIENT_APP_URL}/depo-konfime`);
    }

    const paidCorrectAmount = Number(transaction.cost) === deposit.amount;
    const succeeded = String(transaction.message || '').toLowerCase() === 'successful';

    if (!succeeded || !paidCorrectAmount) {
      await prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'rejected' } });
      return res.redirect(`${CLIENT_APP_URL}/depo-echwe`);
    }

    await prisma.$transaction([
      prisma.deposit.update({
        where: { id: deposit.id },
        data: { status: 'confirmed', confirmedAt: new Date(), confirmedBy: 'moncash-auto' },
      }),
      prisma.user.update({ where: { id: deposit.userId }, data: { balance: { increment: deposit.amount } } }),
    ]);

    await notifyUser(deposit.userId, {
      title: 'Depo konfime',
      body: `Depo MonCash ou (${deposit.amount.toLocaleString('fr-FR')} HTG) konfime — li ajoute nan balans ou.`,
      type: 'deposit',
    });

    res.redirect(`${CLIENT_APP_URL}/depo-konfime`);
  } catch (err) {
    console.error('MonCash callback error:', err);
    res.redirect(`${CLIENT_APP_URL}/depo-echwe`);
  }
});
