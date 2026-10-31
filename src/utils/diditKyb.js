// Verifikasyon otomatik antrepriz (Didit KYB): rejis ofisyèl, aksyonè, UBO, AML.
// Varyab Railway: DIDIT_API_KEY (menm ak KYC a), DIDIT_KYB_WORKFLOW_ID, KYB_FEE_USD (default 100).
import { prisma } from './db.js';
import { getUsdHtgRate } from './fxRate.js';

const DIDIT = 'https://verification.didit.me';
// Frè ouvèti kont antrepriz: fikse an USD (default 100 $), peye an HTG selon tal BRH jounen an
// (awondi anwo a 10 HTG pre). KYB_FEE_HTG, si li mete, ranplase kalkil la ak yon montan fiks.
// kind: "pro" (FEE_PRO_USD, default 100 $) oswa "company" (FEE_COMPANY_USD, default 200 $).
export async function kybFeeQuote(kind = 'company') {
  const usd = Math.max(0, Number(kind === 'pro' ? (process.env.FEE_PRO_USD ?? 100) : (process.env.FEE_COMPANY_USD ?? 200)) || 0);
  const { rate } = await getUsdHtgRate();
  return { htg: Math.ceil((usd * rate) / 10) * 10, usd, rate };
}
export const feeKind = (business) => (business?.legalForm === 'pro' ? 'pro' : 'company');
export const KYB_FEE = async (kind) => (await kybFeeQuote(kind)).htg;
export const kybEnabled = () => !!(process.env.DIDIT_API_KEY && process.env.DIDIT_KYB_WORKFLOW_ID);

export async function createKybSession(business) {
  const body = {
    workflow_id: process.env.DIDIT_KYB_WORKFLOW_ID,
    vendor_data: `biz-${business.id}`,
    callback: `${process.env.CLIENT_APP_URL || 'https://blicpayht.com'}/kyb-retou`,
    metadata: { businessId: business.id, userId: business.userId },
    expected_details: {
      company_name: business.legalName,
      registry_country: 'HT',
      ...(business.patenteNumber || business.nif ? { registration_number: business.patenteNumber || business.nif } : {}),
    },
  };
  const res = await fetch(`${DIDIT}/v3/session/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.DIDIT_API_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Didit KYB session failed:', res.status, JSON.stringify(data).slice(0, 400));
    throw new Error('DIDIT_KYB_FAILED');
  }
  return data; // { session_id, url, status, ... }
}

export async function fetchKybDecision(sessionId) {
  const res = await fetch(`${DIDIT}/v3/session/${sessionId}/decision/`, { headers: { 'x-api-key': process.env.DIDIT_API_KEY } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('DIDIT_KYB_DECISION_FAILED');
  return data;
}

// Rezime rapò Didit la pou admin an (rejis, moun kle, AML).
export function summarizeKyb(report) {
  if (!report) return null;
  let r = report;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { return null; } }
  const reg = r.kyb_registry || r.registry || r.company || {};
  const people = Array.isArray(r.key_people_checks) ? r.key_people_checks : [];
  const aml = Array.isArray(r.aml_screenings) ? r.aml_screenings : [];
  return {
    status: r.status || null,
    reason: r.decision_reason_code || null,
    company: {
      name: reg.company_name || reg.name || null,
      number: reg.registration_number || reg.company_number || null,
      status: reg.company_status || reg.status || null,
      incorporatedOn: reg.incorporation_date || reg.date_of_incorporation || null,
      address: reg.registered_address?.full_address || reg.address || null,
    },
    people: people.slice(0, 20).map((p) => ({
      name: p.full_name || p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
      role: p.role || p.roles?.join?.(', ') || p.type || null,
      ownership: p.ownership_percentage ?? p.ownership ?? null,
      status: p.status || p.kyc_status || null,
    })),
    amlHits: aml.reduce((n, a) => n + (Number(a.total_hits ?? a.hits?.length ?? 0) || 0), 0),
  };
}

// Mete dosye a ajou ak dènye desizyon Didit la.
export async function refreshKyb(business) {
  if (!business?.kybSessionId) return business;
  const decision = await fetchKybDecision(business.kybSessionId);
  return prisma.businessProfile.update({
    where: { id: business.id },
    data: { kybStatus: decision.status || business.kybStatus, kybReport: JSON.stringify(decision) },
  });
}
