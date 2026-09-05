import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db.js';
// Verifies the Authorization: Bearer <token> header and attaches
// { id, role } to req.user. Rejects the request with 401 if missing
// or invalid — every protected route depends on this running first.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Ou dwe konekte pou fè sa a.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Sesyon an ekspire — konekte ankò.' });
  }
}
// Chain after requireAuth on any admin-only route (SIPÈ admin sèlman —
// jesyon Sòl, KYC, itilizatè, finans, kreye ajan pou biwo yo, elatriye).
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Aksè refize — sa se pou admin sèlman.' });
  }
  next();
}
// Chain after requireAuth on routes ki ka itilize PA "admin" OSWA "agent"
// (yon ajan yon biwo espesifik) — sèlman aksyon operasyonèl debaz tankou
// konfime/rejte depo ak retrè. Tout lòt aksyon (jesyon Sòl, KYC, itilizatè,
// finans) rete requireAdmin sèlman.
export function requireAdminOrAgent(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'agent') {
    return res.status(403).json({ error: 'Aksè refize — sa se pou admin oswa ajan sèlman.' });
  }
  next();
}
// Chain after requireAuth on any client action that should only be
// available once KYC is approved (retrè, transfè, prè, demand Sòl).
// Depo rete louvri pou tout moun — se poutèt sa `verified` pa nan JWT la
// e nou al chèche l nan baz done a chak fwa (li ka chanje apre yon
// apwobasyon KYC san kliyan an pa rekonekte).
export async function requireVerified(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { verified: true } });
  if (!user?.verified) {
    return res.status(403).json({ error: 'Ou dwe verifye kont ou (KYC) anvan ou ka fè sa a.' });
  }
  next();
}
// For the merchant dashboard (Bearer JWT from POST /merchant/auth/login).
export function requireMerchantAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Ou dwe konekte pou fè sa a.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.kind !== 'merchant') throw new Error('wrong token kind');
    req.merchantId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesyon an ekspire — konekte ankò.' });
  }
}
// For server-to-server calls from the merchant's own backend
// (Authorization: Bearer sk_live_...). This is what a merchant uses to
// create a payment request — never expose the secret key in browser code.
export function requireMerchantSecretKey(req, res, next) {
  const header = req.headers.authorization || '';
  const secretKey = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!secretKey || !secretKey.startsWith('sk_')) {
    return res.status(401).json({ error: 'Kle sekrè a manke oswa li pa valab.' });
  }
  req.providedSecretKey = secretKey;
  next();
}
