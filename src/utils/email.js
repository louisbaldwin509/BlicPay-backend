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

const COPY = {
  login: {
    ht: ['Kòd koneksyon BLICPay ou', 'Men kòd pou konfime koneksyon ou sou yon nouvo aparèy:', 'Si se pa ou ki t ap eseye konekte, chanje modpas ou touswit epi kontakte sipò BLICPay.'],
    fr: ['Votre code de connexion BLICPay', 'Voici le code pour confirmer votre connexion sur un nouvel appareil :', "Si ce n'est pas vous qui essayez de vous connecter, changez votre mot de passe immédiatement et contactez le support BLICPay."],
    en: ['Your BLICPay sign-in code', 'Here is the code to confirm your sign-in on a new device:', "If this wasn't you, change your password immediately and contact BLICPay support."],
  },
  verify_email: {
    ht: ['Konfime imèl ou — BLICPay', 'Byenveni sou BLICPay! Men kòd pou konfime adrès imèl ou:', 'Si se pa ou ki te kreye kont sa a, ou ka inyore mesaj sa a.'],
    fr: ['Confirmez votre e-mail — BLICPay', 'Bienvenue sur BLICPay ! Voici le code pour confirmer votre adresse e-mail :', "Si vous n'avez pas créé ce compte, vous pouvez ignorer ce message."],
    en: ['Confirm your email — BLICPay', 'Welcome to BLICPay! Here is the code to confirm your email address:', "If you didn't create this account, you can ignore this message."],
  },
  reset: {
    ht: ['Reyinisyalize modpas BLICPay ou', 'Men kòd pou chwazi yon nouvo modpas:', 'Si se pa ou ki te mande sa, pa pataje kòd sa a ak pèsonn.'],
    fr: ['Réinitialisez votre mot de passe BLICPay', 'Voici le code pour choisir un nouveau mot de passe :', "Si vous n'avez rien demandé, ne partagez ce code avec personne."],
    en: ['Reset your BLICPay password', 'Here is the code to choose a new password:', "If you didn't request this, don't share this code with anyone."],
  },
};
const VALID = { ht: 'Kòd la valab pou 10 minit. BLICPay p ap janm mande w kòd sa a nan telefòn.', fr: "Ce code est valable 10 minutes. BLICPay ne vous demandera jamais ce code par téléphone.", en: 'This code is valid for 10 minutes. BLICPay will never ask you for this code by phone.' };

export function codeEmail(purpose, code, name, lang = 'fr') {
  const L = ['ht', 'fr', 'en'].includes(lang) ? lang : 'fr';
  const [subject, intro, outro] = COPY[purpose][L];
  const hello = { ht: 'Bonjou', fr: 'Bonjour', en: 'Hello' }[L];
  const first = (name || '').split(' ')[0];
  const html = `<!doctype html><html><body style="margin:0;background:#F4F6FA;font-family:Arial,Helvetica,sans-serif;color:#0B1B33">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:32px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E6E9F0">
<tr><td style="background:#143A73;padding:22px 28px"><img src="https://blicpayht.com/brand/logo-symbol.png" width="36" height="29" alt="" style="vertical-align:middle;background:#fff;border-radius:8px;padding:4px"> <span style="color:#fff;font-size:20px;font-weight:800;vertical-align:middle;margin-left:8px">BLIC<span style="color:#5CCBF2;font-style:italic">Pay</span></span></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 6px;font-size:15px">${hello}${first ? ' ' + first.replace(/[<>&]/g, '') : ''},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:22px;color:#3B4A5E">${intro}</p>
<div style="font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;background:#F2F7FD;border:1px solid #D9E7F7;border-radius:12px;padding:18px 0;color:#143A73">${code}</div>
<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6B7684">${VALID[L]}</p>
<p style="margin:12px 0 0;font-size:13px;line-height:19px;color:#6B7684">${outro}</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #E6E9F0;font-size:11px;color:#94A0B2">© ${new Date().getFullYear()} BLICPay LLC · blicpayht.com</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${hello}${first ? ' ' + first : ''},\n\n${intro}\n\n${code}\n\n${VALID[L]}\n${outro}\n\nBLICPay`;
  return { subject: `${subject}: ${code}`, html, text };
}
