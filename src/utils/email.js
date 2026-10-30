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
// Rezo sosyal BLICPay — sèlman sa ki gen yon lyen parèt nan imèl yo.
// Lyen yo ka chanje sou Railway (SOCIAL_INSTAGRAM, SOCIAL_FACEBOOK, ...).
const SOCIALS = [
  ['instagram', process.env.SOCIAL_INSTAGRAM, 'Instagram'],
  ['facebook', process.env.SOCIAL_FACEBOOK, 'Facebook'],
  ['x', process.env.SOCIAL_X, 'X'],
  ['tiktok', process.env.SOCIAL_TIKTOK, 'TikTok'],
  ['youtube', process.env.SOCIAL_YOUTUBE, 'YouTube'],
  ['linkedin', process.env.SOCIAL_LINKEDIN, 'LinkedIn'],
  ['whatsapp', process.env.SOCIAL_WHATSAPP || 'https://wa.me/13073460474', 'WhatsApp'],
];
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FOOT = {
  ht: { help: 'Ou bezwen èd? Ekip nou an reponn ou sou WhatsApp nan', sec: 'BLICPay p ap janm mande w modpas ou, kòd verifikasyon ou oswa enfòmasyon kat ou — ni pa imèl, ni pa telefòn, ni pa mesaj.', terms: 'Kondisyon itilizasyon', privacy: 'Konfidansyalite', auto: 'Mesaj sa a voye otomatikman, tanpri pa reponn li.', rights: 'Tout dwa rezève.' },
  fr: { help: 'Besoin d’aide ? Notre équipe vous répond sur WhatsApp au', sec: 'BLICPay ne vous demandera jamais votre mot de passe, vos codes de vérification ou les informations de votre carte, que ce soit par e-mail, par téléphone ou par message.', terms: 'Conditions d’utilisation', privacy: 'Confidentialité', auto: 'Ce message vous a été envoyé automatiquement, merci de ne pas y répondre.', rights: 'Tous droits réservés.' },
  en: { help: 'Need help? Our team is available on WhatsApp at', sec: 'BLICPay will never ask for your password, verification codes or card details — by email, by phone or by text message.', terms: 'Terms of Use', privacy: 'Privacy', auto: 'This message was sent automatically. Please do not reply.', rights: 'All rights reserved.' },
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
          <td align="right" style="${font};font-size:15px;font-weight:700;color:#0B1B33;white-space:nowrap;padding:${i ? '14px' : '0'} 0 0">${esc(v)}</td></tr>`).join('');
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
    <p style="margin:20px 0 34px;${font};font-size:14px;line-height:21px;color:#6B7684">${F.help}&nbsp;<a href="https://wa.me/${WHATSAPP.replace(/\D/g, '')}" style="color:#143A73;font-weight:700;text-decoration:underline;white-space:nowrap">${WHATSAPP}</a></p>
  </td></tr>
  <tr><td style="line-height:0;font-size:0;background:#FFFFFF"><img src="${ASSETS}/footer.png" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>
  <tr><td align="center" style="background:#102A5C;padding:6px 30px 30px">
    ${(() => { const list = SOCIALS.filter(([, url]) => url); return list.length ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px"><tr>${list.map(([k, url, label]) => `<td style="padding:0 6px"><a href="${esc(url)}"><img src="${ASSETS}/social-${k}.png" width="36" height="36" alt="${label}" style="display:block;border:0"></a></td>`).join('')}</tr></table>` : ''; })()}
    <p style="margin:0;${font};font-size:13px;line-height:20px;color:#DCE6F5">${F.sec}</p>
    <p style="margin:16px 0 0;${font};font-size:13px;color:#FFFFFF"><a href="https://blicpayht.com" style="color:#FFFFFF;text-decoration:none">${F.terms}</a> &nbsp;·&nbsp; <a href="https://blicpayht.com" style="color:#FFFFFF;text-decoration:none">${F.privacy}</a></p>
    <p style="margin:14px 0 0;${font};font-size:12px;line-height:18px;color:#8FA3C4">${F.auto}<br>© ${new Date().getFullYear()} BLICPay LLC. ${F.rights} · blicpayht.com</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

const CODE_COPY = {
  login: {
    badge: { ht: 'Kòd sekirite', fr: 'Code de sécurité', en: 'Security code' },
    title: { ht: 'Konfime koneksyon ou', fr: 'Confirmez votre connexion', en: 'Confirm your sign-in' },
    intro: { ht: 'Nou resevwa yon demann koneksyon sou kont BLICPay ou depi yon nouvo aparèy. Pou valide l, antre kòd verifikasyon ki anba a.', fr: 'Nous avons reçu une demande de connexion à votre compte BLICPay depuis un nouvel appareil. Pour la valider, saisissez le code de vérification ci-dessous.', en: 'We received a sign-in request for your BLICPay account from a new device. To approve it, enter the verification code below.' },
    note: { ht: 'Se pa ou ki fè demann sa a? Pa bay pèsonn kòd la epi chanje modpas ou touswit. Kont ou rete pwoteje toutotan kòd la pa antre.', fr: 'Vous n’êtes pas à l’origine de cette demande ? Ne communiquez ce code à personne et modifiez votre mot de passe sans attendre. Votre compte reste protégé tant que le code n’est pas saisi.', en: 'Didn’t request this? Don’t share this code with anyone and change your password right away. Your account stays protected as long as the code isn’t entered.' },
  },
  verify_email: {
    badge: { ht: 'Byenveni', fr: 'Bienvenue', en: 'Welcome' },
    title: { ht: 'Konfime adrès imèl ou', fr: 'Confirmez votre adresse e-mail', en: 'Confirm your email address' },
    intro: { ht: 'Mèsi paske w louvri kont BLICPay ou. Pou fini enskripsyon an, konfime adrès imèl ou ak kòd ki anba a.', fr: 'Merci d’avoir ouvert votre compte BLICPay. Pour finaliser votre inscription, confirmez votre adresse e-mail en saisissant le code ci-dessous.', en: 'Thank you for opening your BLICPay account. To complete your registration, confirm your email address by entering the code below.' },
    note: { ht: 'Si se pa ou ki fè enskripsyon sa a, ou ka inyore mesaj sa a san okenn pwoblèm.', fr: 'Si vous n’êtes pas à l’origine de cette inscription, vous pouvez ignorer ce message en toute sécurité.', en: 'If you did not sign up for BLICPay, you can safely ignore this message.' },
  },
  reset: {
    badge: { ht: 'Modpas', fr: 'Mot de passe', en: 'Password' },
    title: { ht: 'Reyinisyalize modpas ou', fr: 'Réinitialisez votre mot de passe', en: 'Reset your password' },
    intro: { ht: 'Nou resevwa yon demann pou reyinisyalize modpas kont BLICPay ou. Sèvi ak kòd ki anba a pou chwazi yon nouvo modpas.', fr: 'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte BLICPay. Utilisez le code ci-dessous pour définir un nouveau mot de passe.', en: 'We received a request to reset the password for your BLICPay account. Use the code below to set a new password.' },
    note: { ht: 'Si se pa ou ki fè demann sa a, inyore mesaj la: modpas ou pa chanje. Pa janm bay pèsonn kòd sa a.', fr: 'Si vous n’avez pas fait cette demande, ignorez ce message : votre mot de passe actuel reste inchangé. Ne communiquez jamais ce code.', en: 'If you didn’t make this request, ignore this message — your current password stays unchanged. Never share this code.' },
  },
};
const ROWL = {
  date: { ht: 'Dat', fr: 'Date', en: 'Date' },
  valid: { ht: 'Validite', fr: 'Validité', en: 'Valid for' },
  ten: { ht: '10 minit', fr: '10 minutes', en: '10 minutes' },
  hello: { ht: 'Bonjou', fr: 'Bonjour', en: 'Hello' },
};

export function codeEmail(purpose, code, name, lang = 'fr') {
  const L = ['ht', 'fr', 'en'].includes(lang) ? lang : 'fr';
  const c = CODE_COPY[purpose];
  const first = (name || '').trim().split(/\s+/)[0];
  const when = new Date().toLocaleString(L === 'en' ? 'en-US' : 'fr-FR', { timeZone: 'America/Port-au-Prince', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const html = renderEmail({
    lang: L, badge: c.badge[L], tone: purpose === 'verify_email' ? 'green' : 'blue',
    title: c.title[L], hello: `${ROWL.hello[L]}${first ? ' ' + first : ''},`, intro: c.intro[L], code,
    rows: [[ROWL.date[L], when], [ROWL.valid[L], ROWL.ten[L]]], note: c.note[L],
  });
  const text = `${ROWL.hello[L]}${first ? ' ' + first : ''},\n\n${c.intro[L]}\n\n${code}\n\n${ROWL.valid[L]}: ${ROWL.ten[L]}\n${c.note[L]}\n\nBLICPay — WhatsApp ${WHATSAPP}`;
  return { subject: `${c.title[L]} — ${code}`, html, text };
}
