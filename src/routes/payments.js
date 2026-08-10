import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireMerchantSecretKey } from '../middleware/auth.js';

export const paymentsRouter = Router();

// --- Called from the MERCHANT's own server, using their secret key ---
// This is step 1 of a checkout: the merchant's backend asks BLICPay to
// create a payment request for the amount the customer needs to pay, and
// gets back a checkoutUrl to redirect/open for the customer.
paymentsRouter.post('/', requireMerchantSecretKey, async (req, res) => {
  const merchant = await prisma.merchant.findUnique({ where: { secretKey: req.providedSecretKey } });
  if (!merchant) {
    return res.status(401).json({ error: 'Kle sekrè a pa valab.' });
  }

  const { amount, reference, description } = req.body;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!reference?.trim()) {
    return res.status(400).json({ error: 'Yon referans obligatwa.' });
  }

  const payment = await prisma.paymentRequest.create({
    data: {
      merchantId: merchant.id,
      amount: Math.round(numericAmount),
      reference: reference.trim(),
      description: description?.trim(),
    },
  });

  // CHECKOUT_BASE_URL should point at wherever blicpay-checkout is hosted
  // once deployed (see README) — falls back to a placeholder for local dev.
  const checkoutBase = process.env.CHECKOUT_BASE_URL || 'https://checkout.blicpay.example.com';

  res.status(201).json({
    paymentId: payment.id,
    checkoutUrl: `${checkoutBase}/${payment.id}`,
    status: payment.status,
  });
});

// --- Called by the CHECKOUT PAGE (public — no secret key) to display
// what the customer is paying for. Only exposes non-sensitive fields. ---
paymentsRouter.get('/:id', async (req, res) => {
  const payment = await prisma.paymentRequest.findUnique({
    where: { id: req.params.id },
    include: { merchant: { select: { businessName: true } } },
  });
  if (!payment) return res.status(404).json({ error: 'Peman sa a pa jwenn.' });

  res.json({
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    description: payment.description,
    status: payment.status,
    businessName: payment.merchant.businessName,
  });
});

// --- Called from the BLICPay CLIENT APP once a logged-in user confirms
// the payment on the checkout page. Deducts their balance, credits the
// merchant, and (best-effort) pings the merchant's webhook. ---
paymentsRouter.post('/:id/pay', requireAuth, async (req, res) => {
  const payment = await prisma.paymentRequest.findUnique({
    where: { id: req.params.id },
    include: { merchant: true },
  });
  if (!payment) return res.status(404).json({ error: 'Peman sa a pa jwenn.' });
  if (payment.status !== 'pending') {
    return res.status(409).json({ error: 'Peman sa a deja trete.' });
  }

  const payer = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (payer.balance < payment.amount) {
    return res.status(400).json({ error: 'Ou pa gen ase lajan pou peman sa a.' });
  }

  const [, , updatedPayment] = await prisma.$transaction([
    prisma.user.update({ where: { id: payer.id }, data: { balance: { decrement: payment.amount } } }),
    prisma.merchant.update({ where: { id: payment.merchantId }, data: { balance: { increment: payment.amount } } }),
    prisma.paymentRequest.update({
      where: { id: payment.id },
      data: { status: 'paid', paidAt: new Date(), payerUserId: payer.id },
    }),
  ]);

  // Best-effort webhook — a slow or dead merchant endpoint should never
  // block the payment itself, so this never throws back to the client.
  if (payment.merchant.webhookUrl) {
    fetch(payment.merchant.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'payment.paid',
        paymentId: payment.id,
        reference: payment.reference,
        amount: payment.amount,
        currency: payment.currency,
      }),
    }).catch(() => {});
  }

  res.json({ ok: true, status: updatedPayment.status });
});
