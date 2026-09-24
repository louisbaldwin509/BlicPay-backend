import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyAdmins } from '../utils/notify.js';

export const supportRouter = Router();
supportRouter.use(requireAuth);

const VALID_SUBJECTS = ['kont', 'depo', 'sol', 'pre', 'lot'];

// Kliyan an voye yon mesaj bay ekip sipò a (soti nan "Kontakte sipò" nan
// Paramèt). Anvan sa, mesaj la disparèt san li pa janm rive okenn kote —
// kounye a li anrejistre nan baz done a pou yon admin ka wè l epi reponn.
supportRouter.post('/', async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !VALID_SUBJECTS.includes(subject)) {
      return res.status(400).json({ error: 'Chwazi yon sijè.' });
    }
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Ekri mesaj ou anvan ou voye l.' });
    }

    const support = await prisma.supportMessage.create({
      data: { userId: req.user.id, subject, message: message.trim() },
    });

    res.status(201).json({ support });

    const sender = await prisma.user.findUnique({ where: { id: req.user.id }, select: { fullName: true } });
    await notifyAdmins({
      title: 'Nouvo mesaj sipò',
      body: `${sender.fullName}: ${message.trim().slice(0, 80)}`,
      type: 'general',
    });
  } catch (err) {
    console.error('Support message error:', err);
    res.status(500).json({ error: 'Nou pa t ka voye mesaj ou a. Eseye ankò.' });
  }
});

// Istorik mesaj kliyan an te voye deja — itil si li vle konfime li te voye l.
supportRouter.get('/', async (req, res) => {
  try {
    const messages = await prisma.supportMessage.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ messages });
  } catch (err) {
    console.error('List support messages error:', err);
    res.status(500).json({ error: 'Nou pa t ka jwenn mesaj yo.' });
  }
});
