// Voye imèl atravè Resend (https://resend.com) — san okenn depandans, ak fetch.
// Varyab Railway: RESEND_API_KEY, EMAIL_FROM (egz. "BLICPay <securite@blicpayht.com>").
export function emailEnabled() {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail({ to, subject, html, text }) {
  if (!emailEnabled()) {
    console.warn(`[email] RESEND_API_KEY manke — imèl pa voye bay ${to}: ${subject}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'BLICPay <securite@blicpayht.com>', to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[email] Resend error', res.status, body.slice(0, 300));
    throw new Error('EMAIL_SEND_FAILED');
  }
  return true;
}

// ---------------------------------------------------------------------------
// MODÈL IMÈL BLICPay — vag ble anlè, kat detay gri, bouton, pye paj ble.
// Imaj vag yo sou https://blicpayht.com/email/ (sit la).
// ---------------------------------------------------------------------------
const ASSETS = process.env.EMAIL_ASSETS_URL || 'https://blicpayht.com/email';
const WHATSAPP = '+1 307 346 0474';
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FOOT = {
  ht: { help: 'Ou gen yon kesyon? Ekri nou sou WhatsApp:', sec: 'Pou sekirite ou, BLICPay p ap janm mande w modpas ou, kòd ou oswa nimewo kat ou pa imèl oswa pa telefòn.', terms: 'Kondisyon', privacy: 'Konfidansyalite' },
  fr: { help: 'Une question ? Écrivez-nous sur WhatsApp :', sec: 'Pour votre sécurité, BLICPay ne vous demandera jamais par e-mail ou par téléphone votre mot de passe, vos codes ni le numéro de votre carte.', terms: 'Conditions d’utilisation', privacy: 'Confidentialité' },
  en: { help: 'Questions? Message us on WhatsApp:', sec: 'For your security, BLICPay will never ask by email or phone for your password, your codes or your card number.', terms: 'Terms', privacy: 'Privacy' },
};
const TONES = { green: ['#DDF5EA', '#178A65'], blue: ['#E3F1FC', '#14608F'], amber: ['#FDF0D9', '#9A6410'], red: ['#FDE4E4', '#A83232'] };

// { lang, badge, tone, title, hello, intro, code, rows: [[label, value]], button: { label, url }, note }
export function renderEmail({ lang = 'fr', badge, tone = 'green', title, hello, intro, code, rows = [], button, note }) {
  const L = FOOT[lang] ? lang : 'fr';
  const F = FOOT[L];
  const [bbg, bfg] = TONES[tone] || TONES.green;
  const font = "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif";
  const rowsHtml = rows.filter(([, v]) => v != null && v !== '').map(([k, v], i) => `
      <tr><td style="${font};font-size:15px;color:#6B7684;padding:${i ? '14px' : '0'} 0 0">${esc(k)}</td>
          <td align="right" style="${font};font-size:15px;font-weight:700;color:#0B1B33;padding:${i ? '14px' : '0'} 0 0">${esc(v)}</td></tr>`).join('');
  return `<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#EEF2F7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#FFFFFF;border-radius:28px;overflow:hidden">
  <tr><td style="line-height:0;font-size:0"><img src="${ASSETS}/header.png" width="560" alt="BLICPay" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>
  <tr><td style="padding:4px 36px 0">
    ${badge ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${bbg};border-radius:999px;padding:7px 16px;${font};font-size:12px;font-weight:700;letter-spacing:1.5px;color:${bfg};text-transform:uppercase">${esc(badge)}</td></tr></table>` : ''}
    <h1 style="margin:22px 0 0;${font};font-size:28px;line-height:34px;font-weight:800;color:#0B1B33;letter-spacing:-.4px">${esc(title)}</h1>
    ${hello ? `<p style="margin:16px 0 0;${font};font-size:16px;line-height:24px;color:#4A5668">${esc(hello)}</p>` : ''}
    ${intro ? `<p style="margin:${hello ? '6px' : '16px'} 0 0;${font};font-size:16px;line-height:24px;color:#4A5668">${esc(intro)}</p>` : ''}
    ${code ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td align="center" style="background:#F1F4F8;border-radius:20px;padding:22px 10px;font-family:'Courier New',Courier,monospace;font-size:38px;font-weight:700;letter-spacing:12px;color:#143A73">${esc(code)}</td></tr></table>` : ''}
    ${rowsHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:${code ? '14px' : '24px'};background:#F1F4F8;border-radius:20px"><tr><td style="padding:22px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table></td></tr></table>` : ''}
    ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:26px auto 0"><tr><td style="background:#143A73;border-radius:999px"><a href="${esc(button.url)}" style="display:inline-block;padding:16px 38px;${font};font-size:17px;font-weight:700;color:#FFFFFF;text-decoration:none">${esc(button.label)}</a></td></tr></table>` : ''}
    ${note ? `<p style="margin:22px 0 0;${font};font-size:14px;line-height:21px;color:#6B7684">${esc(note)}</p>` : ''}
    <p style="margin:20px 0 34px;${font};font-size:14px;line-height:21px;color:#6B7684">${F.help} <a href="https://wa.me/${WHATSAPP.replace(/\D/g, '')}" style="color:#143A73;font-weight:700;text-decoration:underline;white-space:nowrap">${WHATSAPP}</a></p>
  </td></tr>
  <tr><td style="line-height:0;font-size:0;background:#FFFFFF"><img src="${ASSETS}/footer.png" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>
  <tr><td align="center" style="background:#102A5C;padding:6px 30px 30px">
    <p style="margin:0;${font};font-size:13px;line-height:20px;color:#DCE6F5">${F.sec}</p>
    <p style="margin:16px 0 0;${font};font-size:13px;color:#FFFFFF"><a href="https://blicpayht.com" style="color:#FFFFFF;text-decoration:none">${F.terms}</a> &nbsp;·&nbsp; <a href="https://blicpayht.com" style="color:#FFFFFF;text-decoration:none">${F.privacy}</a></p>
    <p style="margin:14px 0 0;${font};font-size:12px;color:#8FA3C4">© ${new Date().getFullYear()} BLICPay LLC · blicpayht.com</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

const CODE_COPY = {
  login: {
    badge: { ht: 'Kòd sekirite', fr: 'Code de sécurité', en: 'Security code' },
    title: { ht: 'Konfime koneksyon ou', fr: 'Confirmez votre connexion', en: 'Confirm your sign-in' },
    intro: { ht: 'Yon moun ap konekte sou kont BLICPay ou depi yon nouvo aparèy. Men kòd pou konfime se ou:', fr: 'Une connexion à votre compte BLICPay est en cours depuis un nouvel appareil. Voici le code pour confirmer que c’est vous :', en: 'Someone is signing in to your BLICPay account from a new device. Here is the code to confirm it’s you:' },
    note: { ht: 'Si se pa ou, pa bay pèsonn kòd sa a epi chanje modpas ou touswit.', fr: 'Si ce n’est pas vous, ne communiquez ce code à personne et changez votre mot de passe immédiatement.', en: 'If this wasn’t you, don’t share this code and change your password immediately.' },
  },
  verify_email: {
    badge: { ht: 'Byenveni', fr: 'Bienvenue', en: 'Welcome' },
    title: { ht: 'Konfime imèl ou', fr: 'Confirmez votre e-mail', en: 'Confirm your email' },
    intro: { ht: 'Mèsi paske w chwazi BLICPay! Men kòd pou konfime adrès imèl ou:', fr: 'Merci d’avoir choisi BLICPay ! Voici le code pour confirmer votre adresse e-mail :', en: 'Thanks for choosing BLICPay! Here is the code to confirm your email address:' },
    note: { ht: 'Si se pa ou ki te kreye kont sa a, ou ka inyore imèl sa a.', fr: 'Si vous n’avez pas créé ce compte, vous pouvez ignorer cet e-mail.', en: 'If you didn’t create this account, you can ignore this email.' },
  },
  reset: {
    badge: { ht: 'Modpas', fr: 'Mot de passe', en: 'Password' },
    title: { ht: 'Chwazi yon nouvo modpas', fr: 'Choisissez un nouveau mot de passe', en: 'Choose a new password' },
    intro: { ht: 'Ou mande pou chanje modpas BLICPay ou. Men kòd la:', fr: 'Vous avez demandé à changer votre mot de passe BLICPay. Voici le code :', en: 'You asked to reset your BLICPay password. Here is the code:' },
    note: { ht: 'Si se pa ou ki te mande sa, pa bay pèsonn kòd sa a — modpas ou pa chanje.', fr: 'Si vous n’avez rien demandé, ne communiquez ce code à personne — votre mot de passe reste inchangé.', en: 'If you didn’t request this, don’t share this code — your password stays the same.' },
  },
};
const ROWL = {
  date: { ht: 'Dat', fr: 'Date', en: 'Date' },
  valid: { ht: 'Valab pou', fr: 'Valable', en: 'Valid for' },
  ten: { ht: '10 minit', fr: '10 minutes', en: '10 minutes' },
  hello: { ht: 'Bonjou', fr: 'Bonjour', en: 'Hello' },
};

export function codeEmail(purpose, code, name, lang = 'fr') {
  const L = ['ht', 'fr', 'en'].includes(lang) ? lang : 'fr';
  const c = CODE_COPY[purpose];
  const first = (name || '').trim().split(/\s+/)[0];
  const when = new Date().toLocaleString(L === 'en' ? 'en-US' : 'fr-FR', { timeZone: 'America/Port-au-Prince', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const html = renderEmail({
    lang: L, badge: c.badge[L], tone: purpose === 'verify_email' ? 'green' : 'blue',
    title: c.title[L], hello: `${ROWL.hello[L]}${first ? ' ' + first : ''},`, intro: c.intro[L], code,
    rows: [[ROWL.date[L], when], [ROWL.valid[L], ROWL.ten[L]]], note: c.note[L],
  });
  const text = `${ROWL.hello[L]}${first ? ' ' + first : ''},\n\n${c.intro[L]}\n\n${code}\n\n${ROWL.valid[L]}: ${ROWL.ten[L]}\n${c.note[L]}\n\nBLICPay — WhatsApp ${WHATSAPP}`;
  return { subject: `${c.title[L]} — ${code}`, html, text };
}
