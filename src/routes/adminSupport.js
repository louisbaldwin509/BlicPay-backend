import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

// Mòte nan index.js sou '/admin' — '/support' anba a vin '/admin/support'.
export const adminSupportRouter = Router();
adminSupportRouter.use(requireAuth, requireAdmin);

adminSupportRouter.get('/support', async (req, res) => {
  try {
    const status = req.query.status || 'open';
    const messages = await prisma.supportMessage.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { fullName: true, phone: true, clientId: true } } },
    });
    res.json({ messages });
  } catch (err) {
    console.error('Admin list support messages error:', err);
    res.status(500).json({ error: 'Nou pa t ka jwenn mesaj yo.' });
  }
});

adminSupportRouter.post('/support/:id/close', async (req, res) => {
  try {
    const message = await prisma.supportMessage.update({
      where: { id: req.params.id },
      data: { status: 'closed', closedAt: new Date(), closedBy: req.user.id },
    });
    res.json({ ok: true, message });
  } catch (err) {
    console.error('Close support message error:', err);
    res.status(500).json({ error: 'Nou pa t ka fèmen mesaj sa a.' });
  }
});
