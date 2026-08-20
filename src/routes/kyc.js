import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const kycRouter = Router();

// Kliyan voye dokiman idantite + selfi pou verifikasyon
kycRouter.post('/submit', requireAuth, async (req, res) => {
  try {
    const { docType, docImage, docMimeType, selfieImage, selfieMimeType } = req.body;

    if (!docType || !docImage || !docMimeType || !selfieImage || !selfieMimeType) {
      return res.status(400).json({ error: 'Tout chan yo obligatwa: docType, docImage, docMimeType, selfieImage, selfieMimeType' });
    }

    const validDocTypes = ['paspò', 'CIN', 'lisans'];
    if (!validDocTypes.includes(docType)) {
      return res.status(400).json({ error: 'docType envalid. Itilize: paspò, CIN, oswa lisans' });
    }

    const submission = await prisma.kycSubmission.create({
      data: {
        userId: req.user.id,
        docType,
        docImage,
        docMimeType,
        selfieImage,
        selfieMimeType,
        status: 'pending',
      },
    });

    res.status(201).json({
      ok: true,
      submission: {
        id: submission.id,
        status: submission.status,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (err) {
    console.error('KYC submit error:', err);
    res.status(500).json({ error: 'Pa kapab soumèt dokiman yo. Eseye ankò pita.' });
  }
});

// Kliyan tcheke estati dènye soumisyon li
kycRouter.get('/status', requireAuth, async (req, res) => {
  try {
    const latest = await prisma.kycSubmission.findFirst({
      where: { userId: req.user.id },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        status: true,
        rejectionReason: true,
        submittedAt: true,
        decidedAt: true,
      },
    });

    res.json({ submission: latest || null });
  } catch (err) {
    console.error('KYC status error:', err);
    res.status(500).json({ error: 'Pa kapab jwenn estati verifikasyon an.' });
  }
});
