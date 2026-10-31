// Frè ouvèti kont antrepriz (kouvri verifikasyon Didit KYB). Kliyan an ka peye
// ak balans BLICPay li, oswa ak yon depo MonCash / NatCash ki make "kyb_fee":
// depo a kredite balans lan, epi frè a pran otomatikman lè depo a konfime.
import { prisma } from './db.js';
import { KYB_FEE } from './diditKyb.js';
import { notifyUser } from './notify.js';

// Retounen 'charged' | 'already' | 'insufficient' | 'nobusiness'
export async function chargeKybFee(userId) {
  const fee = KYB_FEE();
  const business = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!business) return 'nobusiness';
  if (business.kybFeePaidAt || fee <= 0) return 'already';
  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.businessProfile.findUnique({ where: { id: business.id }, select: { kybFeePaidAt: true } });
    if (fresh.kybFeePaidAt) return 'already';
    const u = await tx.user.findUnique({ where: { id: userId }, select: { balance: true, feeableBalance: true } });
    if ((u?.balance ?? 0) < fee) return 'insufficient';
    const nb = u.balance - fee;
    await tx.user.update({ where: { id: userId }, data: { balance: nb, feeableBalance: Math.min(u.feeableBalance, nb) } });
    await tx.platformFee.create({ data: { userId, kind: 'business_opening', amount: fee, note: business.legalName } });
    await tx.businessProfile.update({ where: { id: business.id }, data: { kybFeePaidAt: new Date() } });
    return 'charged';
  });
  if (result === 'charged') {
    notifyUser(userId, { title: 'Frè ouvèti kont antrepriz', body: `${fee.toLocaleString('fr-FR')} HTG retire sou balans ou pou verifikasyon antrepriz la.`, type: 'wallet' }).catch(() => {});
  }
  return result;
}

// Apèle apre yon depo konfime.
export async function afterDepositConfirmed(deposit) {
  if (deposit?.purpose !== 'kyb_fee') return;
  const r = await chargeKybFee(deposit.userId).catch((e) => { console.error('kyb fee', e); return null; });
  if (r === 'charged') {
    notifyUser(deposit.userId, { title: 'Frè peye — lanse verifikasyon an', body: 'Frè ouvèti kont antrepriz ou peye. Ale nan Kont antrepriz pou kòmanse verifikasyon an.', type: 'kyc' }).catch(() => {});
  }
}
