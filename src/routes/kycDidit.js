import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyUser } from '../utils/notify.js';
import { diditStartLimiter } from '../middleware/rateLimit.js';

export const kycDiditRouter = Router();

const DIDIT_API_BASE = 'https://verification.didit.me';

// Kliyan mande yon nouvo sesyon verifikasyon Didit. Nou kreye sesyon an nan
// Didit, sove yon dosye KycVerification "pending" ki gen sessionId a, epi
// voye bay kliyan an URL pou li ale konplete verifikasyon an (Didit jere
// tout kaptirasyon dokiman + selfi + liveness + AML sou pwòp platfòm li).
kycDiditRouter.post('/start', requireAuth, diditStartLimiter, async (req, res) => {
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

    await prisma.kycVerification.upsert({
      where: { diditSessionId: data.session_id },
      update: { diditStatus: data.status || 'Not Started' },
      create: {
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

// Didit rele URL sa a lè yon sesyon fini (oswa chanje estati). Nou PA fè
// konfyans a kò webhook la pou detay yo — nou re-chèche desizyon final la
// dirèkteman nan API Didit (ak kle sekrè nou an) pou evite yon moun ki ta
// eseye fo yon apèl webhook. Sa a se yon wout PIBLIK — Didit pa ka voye yon
// Authorization: Bearer <token> BLICPay, kidonk pa gen requireAuth isit la.
kycDiditRouter.post('/webhook', async (req, res) => {
  try {
    const sessionId = req.body.session_id || req.body.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id manke.' });
    }

    const verification = await prisma.kycVerification.findUnique({ where: { diditSessionId: sessionId } });
    if (!verification) {
      // Sesyon nou pa rekonèt — aksepte l san erè pou Didit pa reeseye plizyè fwa,
      // men n ap log li pou nou ka egzamine l pita.
      console.warn('Didit webhook: unknown session_id', sessionId);
      return res.status(200).json({ ok: true });
    }

    const decisionRes = await fetch(`${DIDIT_API_BASE}/v3/session/${sessionId}/decision/`, {
      headers: { 'x-api-key': process.env.DIDIT_API_KEY },
    });
    const decision = await decisionRes.json();

    if (!decisionRes.ok) {
      console.error('Didit decision fetch failed:', decision);
      return res.status(200).json({ ok: true }); // Aksepte webhook la kanmenm, n ap reeseye pita si nesesè.
    }

    await prisma.kycVerification.update({
      where: { id: verification.id },
      data: {
        diditStatus: decision.status,
        diditReport: JSON.stringify(decision),
      },
    });

    // Enfòme kliyan an rezilta a rive — men se admin ki ba desizyon final la.
    await notifyUser(verification.userId, {
      title: 'Verifikasyon w resevwa',
      body: 'Nou resevwa rezilta verifikasyon idantite w — n ap egzamine l anvan konfimasyon final.',
      type: 'kyc',
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Didit webhook error:', err);
    res.status(200).json({ ok: true }); // Toujou 200 pou Didit pa boumbade reeseye sou yon erè nou menm.
  }
});
