import { Router } from 'express';
import { hasAppAccess, PRIVATE_BETA_MESSAGE } from '../utils/access.js';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { notifyAdmins, notifyUser } from '../utils/notify.js';
import { DOCUMENTS, LEGAL_FORMS, TURNOVER_RANGES, WITHDRAWAL_CAPS } from '../utils/businessTypes.js';
import { generateUniqueClientId, publicUser, signToken } from './auth.js';
import { KYB_FEE, kybFeeQuote, createKybSession, kybEnabled, refreshKyb, summarizeKyb } from '../utils/diditKyb.js';
import { chargeKybFee } from '../utils/kybFee.js';
import { createMoncashPayment } from '../utils/moncash.js';
import { generateReference } from '../utils/reference.js';

// ---------------------------------------------------------------------------
// KONT ANTREPRIZ
//   Kliyan:  /business/...      (enskripsyon, dosye, dokiman, soumèt)
//   Admin:   /admin/businesses/... (egzamine, apwouve, refize, mande plis)
// ---------------------------------------------------------------------------
export const businessRouter = Router();
export const adminBusinessRouter = Router();

const EDITABLE = ['draft', 'needs_info', 'rejected'];
const DOC_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_DOC_BASE64 = 7_000_000; // ≈ 5 MB fichye
const PROFILE_FIELDS = ['legalName', 'tradeName', 'legalForm', 'nif', 'patenteNumber', 'sector', 'address', 'city', 'businessPhone', 'businessEmail', 'website', 'turnoverRange', 'repTitle'];

function cleanFields(body) {
  const data = {};
  for (const k of PROFILE_FIELDS) {
    if (body[k] === undefined) continue;
    const v = typeof body[k] === 'string' ? body[k].trim().slice(0, 200) : null;
    data[k] = v || null;
  }
  return data;
}

function requirementsFor(legalForm) {
  const f = LEGAL_FORMS[legalForm];
  return f ? { required: f.required, optional: f.optional } : { required: [], optional: [] };
}

// Ki sa ki manke anvan dosye a ka soumèt.
function missingFor(profile, docs) {
  const missing = [];
  for (const k of ['legalName', 'legalForm', 'nif', 'address', 'city']) if (!profile[k]) missing.push(`field:${k}`);
  const { required } = requirementsFor(profile.legalForm);
  for (const d of required) {
    if (!docs.some((x) => x.docType === d && x.status !== 'rejected')) missing.push(`doc:${d}`);
  }
  return missing;
}

const DOC_META = { id: true, docType: true, mimeType: true, fileName: true, status: true, note: true, uploadedAt: true };

// ---------- Piblik ----------
businessRouter.get('/types', (req, res) => {
  res.json({ legalForms: LEGAL_FORMS, documents: DOCUMENTS, turnoverRanges: TURNOVER_RANGES, caps: WITHDRAWAL_CAPS });
});

// Kreye yon NOUVO kont antrepriz (reprezantan legal la + non biznis la).
businessRouter.post('/register', loginLimiter, async (req, res) => {
  const { fullName, phone, password, legalName, legalForm } = req.body || {};
  if (!fullName?.trim() || !phone?.trim() || !password || password.length < 6) {
    return res.status(400).json({ error: 'Non, nimewo telefòn, ak yon modpas (6+ karaktè) obligatwa.' });
  }
  if (!legalName?.trim() || !LEGAL_FORMS[legalForm]) {
    return res.status(400).json({ error: 'Non antrepriz la ak fòm legal la obligatwa.' });
  }
  const existing = await prisma.user.findUnique({ where: { phone: phone.trim() } });
  if (existing) return res.status(409).json({ error: 'Yon kont deja egziste ak nimewo sa a.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const clientId = await generateUniqueClientId();
  const user = await prisma.user.create({
    data: {
      clientId,
      fullName: fullName.trim(),
      phone: phone.trim(),
      passwordHash,
      accountType: 'business',
      business: { create: { legalName: legalName.trim().slice(0, 200), legalForm } },
    },
  });
  if (!hasAppAccess(user)) {
    return res.status(403).json({ error: PRIVATE_BETA_MESSAGE, code: 'PRIVATE_BETA' });
  }
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

// ---------- Kliyan konekte ----------
businessRouter.use(requireAuth);

// Yon kont pèsonèl egzistan vin yon kont antrepriz.
businessRouter.post('/start', async (req, res) => {
  const { legalName, legalForm } = req.body || {};
  if (!legalName?.trim() || !LEGAL_FORMS[legalForm]) {
    return res.status(400).json({ error: 'Non antrepriz la ak fòm legal la obligatwa.' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { business: true } });
  if (user.role !== 'member') return res.status(403).json({ error: 'Aksè refize.' });
  if (user.business) return res.status(409).json({ error: 'Ou deja gen yon dosye antrepriz.' });
  await prisma.user.update({
    where: { id: user.id },
    data: { accountType: 'business', business: { create: { legalName: legalName.trim().slice(0, 200), legalForm } } },
  });
  res.status(201).json({ ok: true });
});

businessRouter.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { verified: true, accountType: true, business: { include: { documents: { select: DOC_META, orderBy: { uploadedAt: 'desc' } } } } },
  });
  if (!user?.business) return res.json({ business: null });
  const { documents, ...profile } = user.business;
  res.json({
    business: profile,
    documents,
    requirements: requirementsFor(profile.legalForm),
    missing: missingFor(profile, documents),
    repVerified: user.verified,
    editable: EDITABLE.includes(profile.status),
    kyb: {
      enabled: kybEnabled(),
      ...(await (async () => { const q = await kybFeeQuote(); return { fee: q.htg, feeUsd: q.usd, feeRate: q.rate }; })()),
      feePaid: !!profile.kybFeePaidAt,
      status: profile.kybStatus,
      url: profile.kybStatus && !['Approved', 'Declined'].includes(profile.kybStatus) ? profile.kybUrl : null,
      startedAt: profile.kybStartedAt,
      pendingPayment: !!(await prisma.deposit.findFirst({ where: { userId: req.user.id, purpose: 'kyb_fee', status: 'pending' }, select: { id: true } })),
    },
  });
});

// Peye frè ouvèti a SÈLMAN (san lanse Didit touswit): ak balans lan, oswa MonCash.
// (NatCash: kliyan an fè yon depo NatCash ak purpose "kyb_fee" — frè a pran lè admin konfime l.)
businessRouter.post('/me/kyb/pay', async (req, res) => {
  const fee = await KYB_FEE();
  const business = await prisma.businessProfile.findUnique({ where: { userId: req.user.id } });
  if (!business) return res.status(404).json({ error: 'Dosye antrepriz la pa jwenn.' });
  if (business.kybFeePaidAt || fee <= 0) return res.json({ ok: true, paid: true });
  const method = req.body?.method;
  if (method === 'balance') {
    const r = await chargeKybFee(req.user.id);
    if (r === 'insufficient') return res.status(402).json({ error: `Balans ou pa ase pou frè ouvèti kont antrepriz la (${fee.toLocaleString('fr-FR')} HTG). Fè yon depo anvan.`, code: 'INSUFFICIENT_BALANCE', fee });
    return res.json({ ok: true, paid: true });
  }
  if (method === 'moncash') {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { verified: true } });
    if (!user?.verified) return res.status(403).json({ error: 'Ou dwe verifye kont ou (KYC) anvan ou ka fè sa a.' });
    const reference = generateReference('MCH-');
    try {
      const { paymentUrl } = await createMoncashPayment(fee, reference);
      await prisma.deposit.create({ data: { userId: req.user.id, amount: fee, method: 'moncash', reference, purpose: 'kyb_fee' } });
      return res.status(201).json({ paymentUrl });
    } catch (err) {
      console.error('KYB fee MonCash error:', err);
      return res.status(502).json({ error: 'Nou pa t kapab kòmanse peman MonCash la — eseye ankò pita.' });
    }
  }
  return res.status(400).json({ error: 'Metòd peman an pa valab.' });
});

// VERIFIKASYON OTOMATIK ANTREPRIZ (Didit KYB). Premye fwa: frè ouvèti a pran sou
// balans antrepriz la (KYB_FEE_USD, default 100 $ an HTG selon tal BRH) — l ap kouvri kou verifikasyon an.
// Si sesyon an bezwen refè, pa gen frè ankò.
businessRouter.post('/me/kyb/start', async (req, res) => {
  if (!kybEnabled()) return res.status(503).json({ error: 'Verifikasyon otomatik antrepriz la poko disponib.' });
  const business = await prisma.businessProfile.findUnique({ where: { userId: req.user.id } });
  if (!business) return res.status(404).json({ error: 'Dosye antrepriz la pa jwenn.' });
  if (business.status === 'draft') return res.status(400).json({ error: 'Soumèt dosye antrepriz la anvan verifikasyon otomatik la.' });
  if (business.kybStatus === 'Approved') return res.status(409).json({ error: 'Antrepriz la deja verifye.' });

  // Yon sesyon ki toujou ouvè: bay menm lyen an.
  if (business.kybSessionId && business.kybUrl && !['Declined', 'Approved', 'Expired', 'Abandoned'].includes(business.kybStatus || '')) {
    return res.json({ url: business.kybUrl, sessionId: business.kybSessionId });
  }

  // Frè ouvèti a DWE peye anvan nou kreye (epi peye) sesyon Didit la.
  const fee = await KYB_FEE();
  const paid = await prisma.businessProfile.findUnique({ where: { id: business.id }, select: { kybFeePaidAt: true } });
  if (fee > 0 && !paid?.kybFeePaidAt) {
    return res.status(402).json({ error: 'Peye frè ouvèti kont antrepriz la anvan verifikasyon an.', code: 'FEE_REQUIRED', fee });
  }

  try {
    const s = await createKybSession(business);
    await prisma.businessProfile.update({
      where: { id: business.id },
      data: { kybSessionId: s.session_id, kybUrl: s.url, kybStatus: s.status || 'Not Started', kybStartedAt: new Date(), kybReport: null },
    });
    res.status(201).json({ url: s.url, sessionId: s.session_id });
  } catch {
    res.status(502).json({ error: 'Nou pa t kapab kòmanse verifikasyon an — eseye ankò pita. (Frè a deja peye, ou p ap peye l ankò.)' });
  }
});

async function myEditableBusiness(req, res) {
  const business = await prisma.businessProfile.findUnique({ where: { userId: req.user.id } });
  if (!business) {
    res.status(404).json({ error: 'Dosye antrepriz la pa jwenn.' });
    return null;
  }
  if (!EDITABLE.includes(business.status)) {
    res.status(409).json({ error: 'Dosye a deja soumèt — ou pa ka modifye l pandan l ap egzamine.' });
    return null;
  }
  return business;
}

businessRouter.put('/me', async (req, res) => {
  const business = await myEditableBusiness(req, res);
  if (!business) return;
  const data = cleanFields(req.body || {});
  if (data.legalForm !== undefined && !LEGAL_FORMS[data.legalForm]) {
    return res.status(400).json({ error: 'Fòm legal la pa valab.' });
  }
  if (data.legalName === null) delete data.legalName; // pa ka vid
  if (data.turnoverRange && !TURNOVER_RANGES[data.turnoverRange]) delete data.turnoverRange;
  const updated = await prisma.businessProfile.update({ where: { id: business.id }, data });
  res.json({ business: updated });
});

businessRouter.post('/me/documents', async (req, res) => {
  const business = await myEditableBusiness(req, res);
  if (!business) return;
  const { docType, data, mimeType, fileName } = req.body || {};
  const { required, optional } = requirementsFor(business.legalForm);
  if (![...required, ...optional].includes(docType)) {
    return res.status(400).json({ error: 'Kalite dokiman sa a pa mande pou fòm legal ou a.' });
  }
  if (!data || typeof data !== 'string' || !DOC_MIME.includes(mimeType)) {
    return res.status(400).json({ error: 'Fichye a pa valab — voye yon foto (JPG/PNG) oswa yon PDF.' });
  }
  if (data.length > MAX_DOC_BASE64) return res.status(400).json({ error: 'Fichye a twò gwo (maksimòm 5 MB).' });

  // Yon sèl dokiman aktif pa kalite: ranplase ansyen an (sof si admin te deja aksepte l).
  await prisma.businessDocument.deleteMany({ where: { businessId: business.id, docType, status: { not: 'accepted' } } });
  const doc = await prisma.businessDocument.create({
    data: { businessId: business.id, docType, fileData: data, mimeType, fileName: typeof fileName === 'string' ? fileName.slice(0, 120) : null },
    select: DOC_META,
  });
  res.status(201).json({ document: doc });
});

businessRouter.delete('/me/documents/:id', async (req, res) => {
  const business = await myEditableBusiness(req, res);
  if (!business) return;
  const doc = await prisma.businessDocument.findFirst({ where: { id: req.params.id, businessId: business.id } });
  if (!doc) return res.status(404).json({ error: 'Dokiman an pa jwenn.' });
  await prisma.businessDocument.delete({ where: { id: doc.id } });
  res.json({ ok: true });
});

businessRouter.post('/me/submit', async (req, res) => {
  const business = await myEditableBusiness(req, res);
  if (!business) return;
  const docs = await prisma.businessDocument.findMany({ where: { businessId: business.id }, select: { docType: true, status: true } });
  const missing = missingFor(business, docs);
  if (missing.length > 0) {
    return res.status(400).json({ error: 'Dosye a pa konplè — ranpli tout enfòmasyon yo epi voye tout dokiman obligatwa yo.', missing });
  }
  await prisma.businessProfile.update({ where: { id: business.id }, data: { status: 'submitted', submittedAt: new Date(), adminNote: null } });
  res.json({ ok: true });
  notifyAdmins({ title: 'Nouvo dosye antrepriz', body: `${business.legalName} soumèt dosye antrepriz li pou egzamen.`, type: 'kyc' }).catch(() => {});
});

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------
// Sèlman wout /businesses yo — pa tout /admin (sinon ajan yo bloke nan tout panèl la).
adminBusinessRouter.use('/businesses', requireAuth, requireAdmin);

adminBusinessRouter.get('/businesses', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const businesses = await prisma.businessProfile.findMany({
    where: status ? { status } : {},
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      user: { select: { id: true, clientId: true, fullName: true, phone: true, verified: true } },
      _count: { select: { documents: true } },
    },
  });
  res.json({ businesses });
});

adminBusinessRouter.get('/businesses/:id', async (req, res) => {
  const business = await prisma.businessProfile.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, clientId: true, fullName: true, phone: true, verified: true, createdAt: true, balance: true } },
      documents: { select: DOC_META, orderBy: { uploadedAt: 'desc' } },
    },
  });
  if (!business) return res.status(404).json({ error: 'Dosye antrepriz la pa jwenn.' });
  res.json({ business, requirements: requirementsFor(business.legalForm), missing: missingFor(business, business.documents) });
});

adminBusinessRouter.get('/businesses/:id/documents/:docId', async (req, res) => {
  const doc = await prisma.businessDocument.findFirst({ where: { id: req.params.docId, businessId: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Dokiman an pa jwenn.' });
  res.json({ document: doc });
});

adminBusinessRouter.patch('/businesses/:id/documents/:docId', async (req, res) => {
  const { status, note } = req.body || {};
  if (!['pending', 'accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Estati a pa valab.' });
  const doc = await prisma.businessDocument.findFirst({ where: { id: req.params.docId, businessId: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Dokiman an pa jwenn.' });
  const updated = await prisma.businessDocument.update({ where: { id: doc.id }, data: { status, note: note?.trim() || null }, select: DOC_META });
  res.json({ document: updated });
});

async function decide(req, res, status, title, body) {
  const business = await prisma.businessProfile.findUnique({ where: { id: req.params.id } });
  if (!business) return res.status(404).json({ error: 'Dosye antrepriz la pa jwenn.' });
  const updated = await prisma.businessProfile.update({
    where: { id: business.id },
    data: { status, decidedAt: new Date(), decidedBy: req.user.id, adminNote: req.body?.reason?.trim() || req.body?.note?.trim() || null },
  });
  await notifyUser(business.userId, { title, body: body(business), type: 'kyc' });
  res.json({ business: updated });
}

adminBusinessRouter.post('/businesses/:id/approve', (req, res) =>
  decide(req, res, 'approved', 'Kont antrepriz apwouve', (b) => `Kont antrepriz ${b.tradeName || b.legalName} apwouve. Plafon antrepriz yo ak resepsyon peman aktive.`),
);

adminBusinessRouter.post('/businesses/:id/reject', (req, res) => {
  if (!req.body?.reason?.trim()) return res.status(400).json({ error: 'Yon rezon obligatwa pou refize.' });
  return decide(req, res, 'rejected', 'Dosye antrepriz refize', () => req.body.reason.trim());
});

adminBusinessRouter.post('/businesses/:id/request-info', (req, res) => {
  if (!req.body?.note?.trim()) return res.status(400).json({ error: 'Ekri sa ou bezwen kliyan an voye.' });
  return decide(req, res, 'needs_info', 'Dosye antrepriz: nou bezwen plis enfòmasyon', () => req.body.note.trim());
});

// Admin: rezime Didit KYB + rafrechi l dirèkteman nan Didit.
adminBusinessRouter.get('/businesses/:id/kyb', async (req, res) => {
  const b = await prisma.businessProfile.findUnique({ where: { id: req.params.id } });
  if (!b) return res.status(404).json({ error: 'Dosye antrepriz la pa jwenn.' });
  res.json({ status: b.kybStatus, startedAt: b.kybStartedAt, feePaidAt: b.kybFeePaidAt, summary: summarizeKyb(b.kybReport) });
});
adminBusinessRouter.post('/businesses/:id/kyb/refresh', async (req, res) => {
  const b = await prisma.businessProfile.findUnique({ where: { id: req.params.id } });
  if (!b?.kybSessionId) return res.status(404).json({ error: 'Pa gen verifikasyon Didit pou antrepriz sa a.' });
  try {
    const u = await refreshKyb(b);
    res.json({ status: u.kybStatus, startedAt: u.kybStartedAt, feePaidAt: u.kybFeePaidAt, summary: summarizeKyb(u.kybReport) });
  } catch {
    res.status(502).json({ error: 'Nou pa t ka jwenn rezilta a nan Didit — eseye ankò.' });
  }
});
