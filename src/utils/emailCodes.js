// Kòd konfimasyon 6 chif voye pa imèl (koneksyon sou nouvo aparèy, konfime
// imèl, reyinisyalize modpas) + aparèy kliyan an fè konfyans.
import crypto from 'crypto';
import { prisma } from './db.js';
import { codeEmail, emailEnabled, sendEmail } from './email.js';

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

const secret = () => process.env.JWT_SECRET || 'blicpay';
export const hashCode = (code) => crypto.createHmac('sha256', secret()).update(String(code)).digest('hex');
export const hashDevice = (id) => crypto.createHmac('sha256', secret()).update('dev:' + String(id)).digest('hex');

export function maskEmail(email) {
  if (!email) return '';
  const [u, d] = email.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(2, Math.min(6, u.length - 2)))}@${d}`;
}

// Kòd la obligatwa sèlman si imèl ka voye (RESEND_API_KEY) e kont lan gen yon imèl.
// Kliyan: kòd sou nouvo aparèy. Ekip la (admin/ajan): kòd nan CHAK koneksyon.
export function otpApplies(user) {
  if (!emailEnabled() || !user?.email) return false;
  if (user.role === 'member') return true;
  // Sekou: STAFF_OTP=false sou Railway retire kòd la pou ekip la (si imèl yo ta bloke).
  return (user.role === 'admin' || user.role === 'agent') && process.env.STAFF_OTP !== 'false';
}
export const isStaff = (user) => user?.role === 'admin' || user?.role === 'agent';

export async function isTrustedDevice(userId, deviceId) {
  if (!deviceId) return false;
  const d = await prisma.trustedDevice.findUnique({ where: { userId_deviceHash: { userId, deviceHash: hashDevice(deviceId) } } });
  if (!d) return false;
  await prisma.trustedDevice.update({ where: { id: d.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return true;
}

export async function trustDevice(userId, deviceId, label) {
  if (!deviceId) return;
  const deviceHash = hashDevice(deviceId);
  await prisma.trustedDevice.upsert({
    where: { userId_deviceHash: { userId, deviceHash } },
    create: { userId, deviceHash, label: label ? String(label).slice(0, 80) : null },
    update: { lastUsedAt: new Date(), label: label ? String(label).slice(0, 80) : undefined },
  });
}

// Kreye epi voye yon kòd. Retounen challenge la (id) — kòd la li menm pa janm soti.
export async function issueCode(user, purpose, lang, toEmail) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  // Yon sèl kòd aktif pou chak bi — ansyen yo pa valab ankò.
  await prisma.emailCode.updateMany({ where: { userId: user.id, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
  const row = await prisma.emailCode.create({
    data: { userId: user.id, purpose, codeHash: hashCode(code), expiresAt: new Date(Date.now() + TTL_MS) },
  });
  const mail = codeEmail(purpose, code, user.fullName, lang);
  await sendEmail({ to: toEmail || user.email, ...mail });
  return row;
}

export async function resendCode(challengeId, lang) {
  const row = await prisma.emailCode.findUnique({ where: { id: String(challengeId) }, include: { user: true } });
  if (!row || row.consumedAt || row.expiresAt < new Date()) return { error: 'Kòd sa a ekspire — rekòmanse.' };
  if (Date.now() - row.createdAt.getTime() < RESEND_COOLDOWN_MS) return { error: 'Tann yon minit anvan ou mande yon lòt kòd.' };
  const fresh = await issueCode(row.user, row.purpose, lang, row.purpose === 'change_email' ? row.user.pendingEmail : undefined);
  return { challengeId: fresh.id };
}

// Verifye kòd la. Retounen { row, user } oswa { error }.
export async function consumeCode(challengeId, code, purpose) {
  const row = await prisma.emailCode.findUnique({ where: { id: String(challengeId || '') }, include: { user: true } });
  if (!row || row.purpose !== purpose || row.consumedAt) return { error: 'Kòd sa a pa valab ankò — mande yon lòt.' };
  if (row.expiresAt < new Date()) return { error: 'Kòd la ekspire — mande yon lòt.' };
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'Twòp move kòd — mande yon lòt.' };
  const ok = crypto.timingSafeEqual(Buffer.from(hashCode(String(code || '').trim())), Buffer.from(row.codeHash));
  if (!ok) {
    await prisma.emailCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { error: 'Kòd la pa kòrèk.' };
  }
  await prisma.emailCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  if (!row.user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
  }
  return { row, user: row.user };
}
