// Journal odit: anrejistre otomatikman chak aksyon admin/ajan ki chanje yon
// bagay (tout demand ki pa GET sou /admin), plis koneksyon admin/ajan yo.
import { prisma } from './db.js';

// Kle ki pa janm dwe ale nan jounal la (sekrè oswa fichye lou).
const SENSITIVE = /pass|pin|token|secret|data|image|file|proof|photo|base64/i;

export function sanitize(value, depth = 0) {
  if (value == null || depth > 3) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE.test(k) ? '[retire]' : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 300) return value.slice(0, 300) + '…';
  return value;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
}

async function writeLog(entry) {
  try {
    let actorName = entry.actorName ?? null;
    if (!actorName && entry.actorId) {
      const u = await prisma.user.findUnique({ where: { id: entry.actorId }, select: { fullName: true } });
      actorName = u?.fullName ?? null;
    }
    await prisma.auditLog.create({ data: { ...entry, actorName } });
  } catch (err) {
    // Jounal la pa dwe janm kase operasyon an li menm.
    console.error('Audit log error:', err.message);
  }
}

// Mete l sou app.use('/admin', auditMiddleware) AVAN routè admin yo.
export function auditMiddleware(req, res, next) {
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') return next();
  // "Make notifikasyon li" pa yon aksyon konfòmite — pa ankonbre jounal la.
  if (req.path.startsWith('/notifications')) return next();
  const body = sanitize(req.body);
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    const path = req.originalUrl.split('?')[0];
    const ids = path.split('/').filter((s) => /^[a-z0-9]{20,}$/i.test(s));
    writeLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      method: req.method,
      path,
      route: req.route?.path ?? null,
      targetId: ids[0] ?? null,
      details: body && Object.keys(body).length ? body : undefined,
      ip: clientIp(req),
      status: res.statusCode,
    });
  });
  next();
}

// Mete l sou app.use('/auth/login', loginAuditMiddleware): anrejistre koneksyon admin/ajan yo.
export function loginAuditMiddleware(req, res, next) {
  const json = res.json.bind(res);
  res.json = (payload) => {
    const u = payload?.user;
    if (res.statusCode < 400 && u && (u.role === 'admin' || u.role === 'agent')) {
      writeLog({ actorId: u.id, actorName: u.fullName, actorRole: u.role, method: 'LOGIN', path: '/auth/login', ip: clientIp(req), status: 200 });
    }
    return json(payload);
  };
  next();
}
