import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { walletRouter } from './routes/wallet.js';
import { depositsRouter } from './routes/deposits.js';
import { adminRouter } from './routes/admin.js';
import { merchantAuthRouter } from './routes/merchantAuth.js';
import { merchantRouter } from './routes/merchant.js';
import { paymentsRouter } from './routes/payments.js';
import { kycRouter } from './routes/kyc.js';
const app = express();

const corsOrigin = process.env.CORS_ORIGIN || '';
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',') }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/wallet', walletRouter);
app.use('/deposits', depositsRouter);
app.use('/admin', adminRouter);
app.use('/merchant/auth', merchantAuthRouter);
app.use('/merchant', merchantRouter);
app.use('/payments', paymentsRouter);
app.use('/kyc', kycRouter);
// Catch-all error handler — keeps unexpected errors from leaking stack
// traces to clients while still logging them for you to debug.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Yon bagay pa mache — eseye ankò pita.' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`BLICPay API ap kouri sou pò ${port}`));
