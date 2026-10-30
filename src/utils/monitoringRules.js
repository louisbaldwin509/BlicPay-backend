// Règ siveyans tranzaksyon yo (pi) — kalkile alèt sou yon lis operasyon.
// Pa gen aksè baz done isit la: fasil pou teste.
const DAY = 86400000;

// Règ siveyans yo (HTG). Chanje yo isit la si politik konfòmite a chanje.
export const RULES = {
  LARGE_TX: 100_000, // yon sèl operasyon ≥ montan sa a
  VELOCITY_COUNT: 5, // ≥ 5 operasyon k ap soti (retrè + transfè) nan 24è
  RAPID_CASHOUT_RATIO: 0.8, // retrè ≥ 80% yon depo nan 24è apre l
  STRUCTURING_MIN_RATIO: 0.9, // plizyè operasyon jis anba LARGE_TX (90%–100%)
  STRUCTURING_COUNT: 3, // … ≥ 3 fwa nan 7 jou
  UNVERIFIED_INFLOW: 50_000, // kont ki pa verifye ki resevwa ≥ montan sa a an transfè nan 7 jou
};

// Kalkile alèt yo sou 30 dènye jou yo epi anrejistre nouvo yo (kle inik = pa gen doub).
export function computeAlerts(rows, now = Date.now()) {
  const alerts = [];
  const live = rows.filter((r) => r.status !== 'rejected');
  // 1) Gwo montan
  for (const r of live) {
    if (r.amount >= RULES.LARGE_TX) {
      alerts.push({ key: `large:${r.kind}:${r.id}`, rule: 'large_tx', severity: 'medium', userId: r.user?.id, amount: r.amount, details: { kind: r.kind, reference: r.reference, method: r.method } });
    }
  }
  const byUser = new Map();
  for (const r of live) {
    if (!r.user) continue;
    if (!byUser.has(r.user.id)) byUser.set(r.user.id, []);
    byUser.get(r.user.id).push(r);
  }
  for (const [userId, list] of byUser) {
    const asc = [...list].sort((a, b) => a.createdAt - b.createdAt);
    // 2) Vitès: ≥ N operasyon k ap soti nan 24è
    const out = asc.filter((r) => r.kind === 'withdrawal' || r.kind === 'transfer');
    for (let i = 0; i + RULES.VELOCITY_COUNT - 1 < out.length; i++) {
      const j = i + RULES.VELOCITY_COUNT - 1;
      if (out[j].createdAt - out[i].createdAt <= DAY) {
        const day = new Date(out[j].createdAt).toISOString().slice(0, 10);
        const win = out.slice(i, j + 1);
        alerts.push({ key: `velocity:${userId}:${day}`, rule: 'velocity', severity: 'medium', userId, amount: win.reduce((s, r) => s + r.amount, 0), details: { count: win.length, references: win.map((r) => r.reference) } });
        break;
      }
    }
    // 3) Depo epi retrè rapid (≥ 80% nan 24è)
    const deps = asc.filter((r) => r.kind === 'deposit' && r.status === 'confirmed');
    const wds = asc.filter((r) => r.kind === 'withdrawal');
    for (const w of wds) {
      const d = deps.find((x) => x.createdAt <= w.createdAt && w.createdAt - x.createdAt <= DAY && w.amount >= x.amount * RULES.RAPID_CASHOUT_RATIO);
      if (d) alerts.push({ key: `rapid:${w.id}`, rule: 'rapid_cashout', severity: 'high', userId, amount: w.amount, details: { deposit: d.reference, withdrawal: w.reference, hours: Math.round((w.createdAt - d.createdAt) / 3600000) } });
    }
    // 4) Estriktirasyon: plizyè operasyon jis anba papòt la nan 7 jou
    const near = asc.filter((r) => r.amount >= RULES.LARGE_TX * RULES.STRUCTURING_MIN_RATIO && r.amount < RULES.LARGE_TX);
    for (let i = 0; i + RULES.STRUCTURING_COUNT - 1 < near.length; i++) {
      const j = i + RULES.STRUCTURING_COUNT - 1;
      if (near[j].createdAt - near[i].createdAt <= 7 * DAY) {
        const win = near.slice(i, j + 1);
        alerts.push({ key: `struct:${userId}:${new Date(near[i].createdAt).toISOString().slice(0, 10)}`, rule: 'structuring', severity: 'high', userId, amount: win.reduce((s, r) => s + r.amount, 0), details: { count: win.length, references: win.map((r) => r.reference) } });
        break;
      }
    }
  }
  // 5) Kont pa verifye ki resevwa anpil transfè
  const inflow = new Map();
  for (const r of live) {
    if (r.kind !== 'transfer' || !r.counterparty?.id || r.counterparty.verified) continue;
    if (now - new Date(r.createdAt).getTime() > 7 * DAY) continue;
    inflow.set(r.counterparty.id, (inflow.get(r.counterparty.id) || 0) + r.amount);
  }
  for (const [userId, total] of inflow) {
    if (total >= RULES.UNVERIFIED_INFLOW) {
      const week = new Date(now - (now % (7 * DAY))).toISOString().slice(0, 10);
      alerts.push({ key: `unverified:${userId}:${week}`, rule: 'unverified_inflow', severity: 'low', userId, amount: total, details: { days: 7 } });
    }
  }
  return alerts;
}

