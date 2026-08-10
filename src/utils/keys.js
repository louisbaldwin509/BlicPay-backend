import crypto from 'crypto';

// Kle piblik la ale nan kòd front-end sit marchan an (san danje pou moun wè l).
// Kle sekrè a rete SÈLMAN sou sèvè marchan an, itilize pou kreye demand peman yo.
export function generateKeyPair() {
  const publicKey = 'pk_live_' + crypto.randomBytes(16).toString('hex');
  const secretKey = 'sk_live_' + crypto.randomBytes(24).toString('hex');
  return { publicKey, secretKey };
}
