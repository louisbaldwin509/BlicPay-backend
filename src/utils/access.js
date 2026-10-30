// MOD TÈS PRIVE — tank BLICPay poko louvri pou piblik la, sèlman admin,
// ajan ak kont ki gen `betaAccess` (tèstè Google Play / Apple, ekip la)
// ka konekte. Pou louvri pou tout moun: mete PRIVATE_BETA=false sou Railway.
export const PRIVATE_BETA_MESSAGE = 'BLICPay an faz tès prive pou kounye a. Kont ou anrejistre — n ap fè w konnen lè aksè a louvri.';

export function isPrivateBeta() {
  return String(process.env.PRIVATE_BETA ?? 'true').toLowerCase() !== 'false';
}

export function hasAppAccess(user) {
  if (!isPrivateBeta()) return true;
  return user?.role === 'admin' || user?.role === 'agent' || !!user?.betaAccess;
}
