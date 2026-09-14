import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { notifyUser } from '../utils/notify.js';

// Mòte nan index.js sou '/admin' — chak wout anba a deja gen '/admin' kòm
// prefiks (egzanp: '/users/:id/verification-requests' → '/admin/users/:id/verification-requests').
export const adminVerificationRequestsRouter = Router();
adminVerificationRequestsRouter.use(requireAuth, requireAdmin);

const TYPE_LABELS = {
  address_proof: 'Prèv adrès',
  income_proof: 'Prèv revni',
  identity_reverify: 'Refè verifikasyon idantite',
  other: 'Lòt dokiman',
};

// Admin kreye yon demand pou YON kliyan espesifik — pa touche badge
// "verifye" li deja genyen an, se yon demand SIPLEMANTÈ apa.
adminVerificationRequestsRouter.post('/users/:id/verification-requests', async (req, res) => {
  try {
    const { type, note } = req.body;
    if (!type || !TYPE_LABELS[type]) {
      return res.status(400).json({ error: 'Tip demand lan envalid.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Itilizatè a pa jwenn.' });

    const request = await prisma.verificationRequest.create({
      data: {
        userId: user.id,
        type,
        note: note?.trim() || null,
        requestedBy: req.user.id,
      },
    });

    await notifyUser(user.id, {
      title: 'Nou bezwen yon dokiman siplemantè',
      body: note?.trim() || `Tanpri voye: ${TYPE_LABELS[type]}.`,
      type: 'kyc',
    });

    res.json({ request });
  } catch (err) {
    console.error('Create verification request error:', err);
    res.status(500).json({ error: 'Nou pa t ka kreye demand lan.' });
  }
});

// Tout demand pou YON kliyan (itilize nan modal detay itilizatè a).
adminVerificationRequestsRouter.get('/users/:id/verification-requests', async (req, res) => {
  try {
    const requests = await prisma.verificationRequest.findMany({
      where: { userId: req.params.id },
      orderBy: { requestedAt: 'desc' },
    });
    res.json({ requests });
  } catch (err) {
    console.error('List user verification requests error:', err);
    res.status(500).json({ error: 'Nou pa t ka jwenn demand yo.' });
  }
});

// Fil datant global — pa default, demand "submitted" (ap tann egzamen admin).
adminVerificationRequestsRouter.get('/verification-requests', async (req, res) => {
  try {
    const status = req.query.status || 'submitted';
    const requests = await prisma.verificationRequest.findMany({
      where: { status },
      orderBy: { submittedAt: 'desc' },
      include: { user: { select: { fullName: true, phone: true, clientId: true } } },
    });
    res.json({ requests });
  } catch (err) {
    console.error('List verification requests error:', err);
    res.status(500).json({ error: 'Nou pa t ka jwenn demand yo.' });
  }
});

adminVerificationRequestsRouter.post('/verification-requests/:id/approve', async (req, res) => {
  try {
    const request = await prisma.verificationRequest.update({
      where: { id: req.params.id },
      data: { status: 'approved', decidedAt: new Date(), decidedBy: req.user.id },
    });

    await notifyUser(request.userId, {
      title: 'Dokiman ou apwouve',
      body: `${TYPE_LABELS[request.type] || 'Demand'} ou a apwouve.`,
      type: 'kyc',
    });

    res.json({ ok: true, request });
  } catch (err) {
    console.error('Approve verification request error:', err);
    res.status(500).json({ error: 'Nou pa t ka apwouve demand lan.' });
  }
});

adminVerificationRequestsRouter.post('/verification-requests/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Yon rezon obligatwa pou refize.' });

    const request = await prisma.verificationRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'rejected',
        rejectionReason: reason.trim(),
        decidedAt: new Date(),
        decidedBy: req.user.id,
      },
    });

    await notifyUser(request.userId, {
      title: 'Dokiman ou refize',
      body: reason.trim(),
      type: 'kyc',
    });

    res.json({ ok: true, request });
  } catch (err) {
    console.error('Reject verification request error:', err);
    res.status(500).json({ error: 'Nou pa t ka refize demand lan.' });
  }
});
