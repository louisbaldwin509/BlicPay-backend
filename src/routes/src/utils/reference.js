const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

export function generateReference(prefix = 'SOL-') {
  let ref = prefix;
  for (let i = 0; i < 6; i++) {
    ref += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return ref;
}
