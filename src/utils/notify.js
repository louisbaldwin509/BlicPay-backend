import { prisma } from './db.js';

// Kreye yon notifikasyon pou yon kliyan. Sèvi ak sa a nan wout admin yo
// chak fwa yon aksyon chanje estati yon bagay ki apatyen a yon kliyan
// (KYC, depo, retrè, prè, elatriye).
export async function notifyUser(userId, { title, body, type = 'general' }) {
  return prisma.notification.create({
    data: { userId, title, body, type },
  });
}
