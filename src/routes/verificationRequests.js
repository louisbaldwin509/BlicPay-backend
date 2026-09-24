import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyAdmins } from '../utils/notify.js';

export const verificationRequestsRouter = Router();
verificationRequestsRouter.use(requireAuth);

// Lis tout demand yon kliyan genyen (tout estati) — pi resan an anlè.
// Endepandan de /kyc/didit/status: sa a se demand SIPLEMANTÈ yon admin
// kreye pou LI PRESIZEMAN, pa premye verifikasyon idantite a.
verificationRequestsRouter.get('/', async (req, res) => {
  try {
    const requests = await prisma.verificationRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { requestedAt: 'desc' },
      select: {
        id: true,
        type: true,
        note: true,
        status: true,
        rejectionReason: true,
        requestedAt: true,
        submittedAt: true,
        decidedAt: true,
      },
    });
    res.json({ requests });
  } catch (err) {
    console.error('List verification requests error:', err);
    res.status(500).json({ error: 'Nou pa t ka jwenn demand verifikasyon yo.' });
  }
});

// Kliyan an reponn a yon demand: swa li telechaje yon dokiman (prèv adrès,
// elatriye), swa — pou "identity_reverify" — li senpleman konfime li pral
// refè sesyon Didit la (pa gen fichye pou tip sa a).
verificationRequestsRouter.post('/:id/submit', async (req, res) => {
  try {
    const { fileData, fileMimeType } = req.body;

    const request = await prisma.verificationRequest.findUnique({ where: { id: req.params.id } });
    if (!request || request.userId !== req.user.id) {
      return res.status(404).json({ error: 'Demand sa a pa jwenn.' });
    }
    if (!['requested', 'rejected'].includes(request.status)) {
      return res.status(400).json({ error: 'Demand sa a deja trete.' });
    }
    if (request.type !== 'identity_reverify' && (!fileData || !fileMimeType)) {
      return res.status(400).json({ error: 'Ou dwe telechaje yon dokiman.' });
    }

    const updated = await prisma.verificationRequest.update({
      where: { id: request.id },
      data: {
        status: 'submitted',
        fileData: fileData || null,
        fileMimeType: fileMimeType || null,
        rejectionReason: null,
        submittedAt: new Date(),
      },
    });

    res.json({ request: updated });

    const sender = await prisma.user.findUnique({ where: { id: req.user.id }, select: { fullName: true } });
    await notifyAdmins({
      title: 'Dokiman siplemantè soumèt',
      body: `${sender.fullName} soumèt dokiman li mande a.`,
      type: 'kyc',
    });
  } catch (err) {
    console.error('Submit verification request error:', err);
    res.status(500).json({ error: 'Nou pa t ka voye dokiman an.' });
  }
});
