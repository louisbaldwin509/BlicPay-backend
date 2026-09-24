import { prisma } from './db.js';

// Kreye yon notifikasyon pou yon kliyan. Sèvi ak sa a nan wout admin yo
// chak fwa yon aksyon chanje estati yon bagay ki apatyen a yon kliyan
// (KYC, depo, retrè, prè, elatriye).
export async function notifyUser(userId, { title, body, type = 'general' }) {
  return prisma.notification.create({
    data: { userId, title, body, type },
  });
}

// Kreye yon notifikasyon pou TOUT sipè admin yo — sèvi ak sa a chak fwa yon
// kliyan kreye yon bagay ki mande yon desizyon admin (demand Sòl, KYC,
// mesaj sipò, dokiman siplemantè). Retrè yo toujou mande apwobasyon, kidonk
// yo tou notifye admin yo isit la.
export async function notifyAdmins({ title, body, type = 'general' }) {
  const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, title, body, type })),
  });
}
