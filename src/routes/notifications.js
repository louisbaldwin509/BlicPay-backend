import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';

export const notificationsRouter = Router();

// Lis notifikasyon kliyan ki konekte a, plis resan an premye.
notificationsRouter.get('/', requireAuth, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const unreadCount = notifications.filter((n) => !n.read).length;
  res.json({ notifications, unreadCount });
});

// Make yon sèl notifikasyon kòm li.
notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notif || notif.userId !== req.user.id) {
    return res.status(404).json({ error: 'Notifikasyon an pa jwenn.' });
  }
  await prisma.notification.update({ where: { id: notif.id }, data: { read: true } });
  res.json({ ok: true });
});

// Make tout notifikasyon kliyan an kòm li — sèvi lè li louvri panèl la.
notificationsRouter.patch('/read-all', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});
