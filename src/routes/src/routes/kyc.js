import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const kycRouter = Router();

kycRouter.use(requireAuth);

const VALID_DOC_TYPES = ['paspò', 'CIN', 'lisans'];
const MAX_IMAGE_CHARS = 6_000_000; // ~4.5MB apre baz64 — ase pou yon foto telefòn konprese

// Estati aktyèl KYC kliyan an — kliyan an verifye si l gen yon soumisyon
// apwouve, sinon dènye estati soumisyon li (pending/rejected), sinon "none".
kycRouter.get('/status', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { verified: true } });
  const latest = await prisma.kycSubmission.findFirst({
    where: { userId: req.user.id },
    orderBy: { submittedAt: 'desc' },
    select: { status: true, rejectionReason: true, submittedAt: true },
  });

  res.json({
    verified: user.verified,
    status: user.verified ? 'approved' : (latest?.status || 'none'),
    rejectionReason: latest?.status === 'rejected' ? latest.rejectionReason : null,
  });
});

// Voye yon dokiman + yon selfi pou verifikasyon. Sa KREYE yon demand
// "pending" — sa PA verifye kont lan otomatikman. Yon admin dwe egzamine
// imaj yo reyèlman epi apwouve oswa refize.
kycRouter.post('/submit', async (req, res) => {
  const { docType, docImage, docMimeType, selfieImage, selfieMimeType } = req.body;

  if (!VALID_DOC_TYPES.includes(docType)) {
    return res.status(400).json({ error: 'Kalite dokiman an pa valab.' });
  }
  if (!docImage || !selfieImage) {
    return res.status(400).json({ error: 'Ni dokiman an ni selfi a obligatwa.' });
  }
  if (docImage.length > MAX_IMAGE_CHARS || selfieImage.length > MAX_IMAGE_CHARS) {
    return res.status(400).json({ error: 'Yon foto twò gwo. Eseye yon foto ki pi piti.' });
  }

  const pending = await prisma.kycSubmission.findFirst({ where: { userId: req.user.id, status: 'pending' } });
  if (pending) {
    return res.status(409).json({ error: 'Ou gen yon demand verifikasyon ki ap tann deja.' });
  }

  const submission = await prisma.kycSubmission.create({
    data: {
      userId: req.user.id,
      docType,
      docImage,
      docMimeType: docMimeType || 'image/jpeg',
      selfieImage,
      selfieMimeType: selfieMimeType || 'image/jpeg',
    },
  });

  res.status(201).json({ ok: true, submissionId: submission.id });
});
