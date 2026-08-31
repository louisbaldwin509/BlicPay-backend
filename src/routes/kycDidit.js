import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const kycDiditRouter = Router();

const DIDIT_API_BASE = 'https://verification.didit.me';

// Kliyan mande yon nouvo sesyon verifikasyon Didit. Nou kreye sesyon an nan
// Didit, sove yon dosye KycVerification "pending" ki gen sessionId a, epi
// voye bay kliyan an URL pou li ale konplete verifikasyon an (Didit jere
// tout kaptirasyon dokiman + selfi + liveness + AML sou pwòp platfòm li).
kycDiditRouter.post('/start', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${DIDIT_API_BASE}/v3/session/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.DIDIT_API_KEY,
      },
      body: JSON.stringify({
        workflow_id: process.env.DIDIT_WORKFLOW_ID,
        vendor_data: req.user.id,
        callback: `${process.env.CLIENT_APP_URL || 'https://blicpayht.com'}/kyc-retou`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Didit session creation failed:', data);
      return res.status(502).json({ error: 'Nou pa t kapab kòmanse verifikasyon an — eseye ankò pita.' });
    }

    await prisma.kycVerification.create({
      data: {
        userId: req.user.id,
        diditSessionId: data.session_id,
        diditStatus: data.status || 'Not Started',
      },
    });

    res.status(201).json({ url: data.url, sessionId: data.session_id });
  } catch (err) {
    console.error('Didit start error:', err);
    res.status(500).json({ error: 'Yon bagay pa mache — eseye ankò pita.' });
  }
});

// Kliyan tcheke estati dènye verifikasyon Didit li a (pou l wè si li annatant,
// apwouve, oswa refize pandan l nan app la).
kycDiditRouter.get('/status', requireAuth, async (req, res) => {
  try {
    const latest = await prisma.kycVerification.findFirst({
      where: { userId: req.user.id },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        diditStatus: true,
        status: true,
        rejectionReason: true,
        startedAt: true,
        decidedAt: true,
      },
    });

    res.json({ verification: latest || null });
  } catch (err) {
    console.error('Didit status error:', err);
    res.status(500).json({ error: 'Nou pa t ka jwenn estati verifikasyon an.' });
  }
});
