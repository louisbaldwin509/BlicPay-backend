import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { hasAppAccess, PRIVATE_BETA_MESSAGE } from '../utils/access.js';
import { parseClientProfile } from '../utils/clientProfile.js';
import { consumeCode, isTrustedDevice, issueCode, maskEmail, otpApplies, resendCode, trustDevice } from '../utils/emailCodes.js';
import rateLimit from 'express-rate-limit';

// Kòd imèl: pi lajè pase koneksyon an (moun ka fè erè lè l ap tape), men limite.
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Twòp tantativ — tann kèk minit epi eseye ankò.' } });
const reqLang = (req) => String(req.headers['x-blic-lang'] || 'fr').slice(0, 2);

// Jwenn kont lan ak imèl OSWA nimewo telefòn.
async function findByIdentifier(raw) {
  const id = String(raw || '').trim();
  if (!id) return null;
  if (id.includes('@')) return prisma.user.findUnique({ where: { email: id.toLowerCase() } });
  return prisma.user.findUnique({ where: { phone: id } });
}

async function finishLogin(user, res) {
  if (!user.clientId) {
    const clientId = await generateUniqueClientId();
    user = await prisma.user.update({ where: { id: user.id }, data: { clientId } });
  }
  return res.json({ token: signToken(user), user: publicUser(user) });
}

export const authRouter = Router();

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

export function publicUser(user) {
  return {
    id: user.id,
    clientId: user.clientId,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    branch: user.branch,
    balance: user.balance,
    verified: user.verified,
    accountType: user.accountType ?? 'personal',
  };
}

// Kreye yon ID kliyan tankou "BP-482913", epi eseye ankò si li deja pran
// (ra, men posib ak jenerasyon aleatwa).
export async function generateUniqueClientId() {
  for (let i = 0; i < 5; i++) {
    const candidate = 'BP-' + Math.floor(100000 + Math.random() * 900000);
    const existing = await prisma.user.findUnique({ where: { clientId: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Nou pa t ka jenere yon ID kliyan inik.');
}

authRouter.post('/register', loginLimiter, async (req, res) => {
  const { phone, password } = req.body;

  if (!phone?.trim() || !password || password.length < 6) {
    return res.status(400).json({
      error: 'Non, nimewo telefòn, ak yon modpas (6+ karaktè) obligatwa.',
    });
  }

  // Enfòmasyon idantifikasyon kliyan (CIP) — obligatwa pou louvri yon kont.
  const profile = parseClientProfile(req.body);
  if (profile.error) return res.status(400).json({ error: profile.error });

  const existing = await prisma.user.findUnique({ where: { phone: phone.trim() } });
  if (existing) {
    return res.status(409).json({ error: 'Yon kont deja egziste ak nimewo sa a.' });
  }
  const emailTaken = await prisma.user.findUnique({ where: { email: profile.data.email } });
  if (emailTaken) {
    return res.status(409).json({ error: 'Yon kont deja itilize imèl sa a.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const clientId = await generateUniqueClientId();
  const user = await prisma.user.create({
    data: { clientId, phone: phone.trim(), passwordHash, ...profile.data },
  });

  // Mod tès prive: kont lan kreye, men li pa ka antre jiskaske admin bay aksè.
  if (!hasAppAccess(user)) {
    return res.status(403).json({ error: PRIVATE_BETA_MESSAGE, code: 'PRIVATE_BETA' });
  }
  // Konfime imèl la ak yon kòd anvan premye koneksyon an.
  if (otpApplies(user)) {
    try {
      const ch = await issueCode(user, 'verify_email', reqLang(req));
      return res.status(201).json({ otpRequired: true, challengeId: ch.id, email: maskEmail(user.email) });
    } catch {
      return res.status(502).json({ error: 'Nou pa t ka voye imèl la — eseye ankò nan kèk minit.' });
    }
  }
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

// Rate-limite: pa plis pase 8 tantativ konneksyon pou menm IP la nan 15 min,
// pou anpeche yon atak fòs brit sou modpas kliyan yo.
authRouter.post('/login', loginLimiter, async (req, res) => {
  const { password, deviceId } = req.body;
  const identifier = req.body.identifier ?? req.body.phone;

  const user = await findByIdentifier(identifier);
  const valid = user && (await bcrypt.compare(String(password || ''), user.passwordHash));

  if (!valid) {
    return res.status(401).json({ error: 'Idantifyan oswa modpas la pa kòrèk.' });
  }
  if (user.blocked || user.deletedAt) {
    return res.status(403).json({ error: 'Kont sa a bloke. Kontakte sipò BLICPay.' });
  }
  if (!hasAppAccess(user)) {
    return res.status(403).json({ error: PRIVATE_BETA_MESSAGE, code: 'PRIVATE_BETA' });
  }

  // Nouvo aparèy → kòd pa imèl anvan nou bay aksè.
  if (otpApplies(user) && !(await isTrustedDevice(user.id, deviceId))) {
    try {
      const ch = await issueCode(user, user.emailVerifiedAt ? 'login' : 'verify_email', reqLang(req));
      return res.json({ otpRequired: true, challengeId: ch.id, email: maskEmail(user.email) });
    } catch {
      return res.status(502).json({ error: 'Nou pa t ka voye imèl la — eseye ankò nan kèk minit.' });
    }
  }
  return finishLogin(user, res);
});

// Kliyan an tape kòd li resevwa pa imèl → aparèy la vin "konfyans" epi li konekte.
authRouter.post('/login/verify', codeLimiter, async (req, res) => {
  const { challengeId, code, deviceId, deviceLabel } = req.body || {};
  const row = await prisma.emailCode.findUnique({ where: { id: String(challengeId || '') }, select: { purpose: true } });
  if (!row || !['login', 'verify_email'].includes(row.purpose)) return res.status(400).json({ error: 'Kòd sa a pa valab ankò — mande yon lòt.' });
  const r = await consumeCode(challengeId, code, row.purpose);
  if (r.error) return res.status(400).json({ error: r.error });
  const user = r.user;
  if (user.blocked || user.deletedAt) return res.status(403).json({ error: 'Kont sa a bloke. Kontakte sipò BLICPay.' });
  if (!hasAppAccess(user)) return res.status(403).json({ error: PRIVATE_BETA_MESSAGE, code: 'PRIVATE_BETA' });
  await trustDevice(user.id, deviceId, deviceLabel);
  return finishLogin(user, res);
});

authRouter.post('/code/resend', codeLimiter, async (req, res) => {
  const r = await resendCode(req.body?.challengeId, reqLang(req));
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true, challengeId: r.challengeId });
});

// MODPAS BLIYE — kòd pa imèl, answit nouvo modpas.
authRouter.post('/password/forgot', codeLimiter, async (req, res) => {
  const user = await findByIdentifier(req.body?.identifier);
  // Toujou menm repons — pa revele si yon kont egziste.
  const generic = { ok: true, challengeId: null, email: null };
  if (!user || !user.email || user.blocked || user.deletedAt) return res.json(generic);
  try {
    const ch = await issueCode(user, 'reset', reqLang(req));
    return res.json({ ok: true, challengeId: ch.id, email: maskEmail(user.email) });
  } catch {
    return res.status(502).json({ error: 'Nou pa t ka voye imèl la — eseye ankò nan kèk minit.' });
  }
});

authRouter.post('/password/reset', codeLimiter, async (req, res) => {
  const { challengeId, code, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: 'Nouvo modpas la dwe gen omwen 6 karaktè.' });
  const r = await consumeCode(challengeId, code, 'reset');
  if (r.error) return res.status(400).json({ error: r.error });
  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  // Nouvo modpas → tout aparèy dwe konfime ankò.
  await prisma.$transaction([
    prisma.user.update({ where: { id: r.user.id }, data: { passwordHash } }),
    prisma.trustedDevice.deleteMany({ where: { userId: r.user.id } }),
  ]);
  res.json({ ok: true });
});

// Nenpòt itilizatè ki konekte (kliyan, ajan, admin) chanje pwòp modpas li.
// Li dwe bay modpas AKTYÈL la kòm prèv — menm si yon moun ta jwenn yon
// telefòn ki toujou konekte, li pa ka chanje modpas la san l pa konnen l.
// Rate-limite menm jan ak koneksyon an pou anpeche divinasyon modpas aktyèl la.
authRouter.post('/change-password', loginLimiter, requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Modpas aktyèl la ak nouvo modpas la obligatwa.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Nouvo modpas la dwe gen omwen 6 karaktè.' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'Nouvo modpas la dwe diferan de ansyen an.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'Kont lan pa jwenn.' });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    // 400 (pa 401) pou front-end lan pa konprann sa kòm yon sesyon ki ekspire.
    return res.status(400).json({ error: 'Modpas aktyèl la pa kòrèk.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});
