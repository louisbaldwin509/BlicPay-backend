// Ti kliyan pou pale ak API MonCash (Digicel). Tout apèl yo pase pa yon
// jeton OAuth2 nou kenbe an memwa (kachte) jiskaske li ekspire, pou nou pa
// mande yon nouvo jeton chak fwa.
//
// ATANSYON: chemen API MonCash yo (URL egzat pou chak apèl) soti nan
// dokimantasyon bibliyotèk tyès pati (pa yon aksè dirèk nou genyen a PDF
// ofisyèl Digicel la). Teste byen an sandbox anvan ou pase an pwodiksyon.

const MONCASH_MODE = process.env.MONCASH_MODE || 'sandbox'; // 'sandbox' | 'live'
const MONCASH_BASE = MONCASH_MODE === 'live'
  ? 'https://moncashbutton.digicelgroup.com'
  : 'https://sandbox.moncashbutton.digicelgroup.com';

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry - 30_000) {
    return cachedToken;
  }

  const basicAuth = Buffer.from(`${process.env.MONCASH_CLIENT_ID}:${process.env.MONCASH_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${MONCASH_BASE}/Api/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: 'scope=read,write&grant_type=client_credentials',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MonCash pa ba nou yon jeton: ${response.status} ${text}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + (Number(data.expires_in || 3600) * 1000);
  return cachedToken;
}

// Kreye yon sesyon peman. `orderId` dwe INIK — nou sèvi ak referans depo a.
// Retounen { paymentUrl, token }.
export async function createMoncashPayment(amount, orderId) {
  const token = await getAccessToken();

  const response = await fetch(`${MONCASH_BASE}/Api/v1/CreatePayment`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ amount: Math.round(amount), orderId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MonCash pa t ka kreye peman an: ${response.status} ${text}`);
  }

  const data = await response.json();
  const paymentToken = data.payment_token?.token;
  if (!paymentToken) throw new Error('MonCash pa voye yon token peman valab.');

  return {
    paymentUrl: `${MONCASH_BASE}/Moncash-middleware/Payment/Redirect?token=${paymentToken}`,
    token: paymentToken,
  };
}

// Verifye yon tranzaksyon DIRÈKTEMAN ak MonCash — jamè fè konfyans a yon
// paramèt ki soti nan yon redireksyon navigatè a pou kont li.
export async function retrieveMoncashTransaction(transactionId) {
  const token = await getAccessToken();

  const response = await fetch(`${MONCASH_BASE}/Api/v1/RetrieveTransactionPayment`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ transactionId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MonCash pa t ka konfime tranzaksyon an: ${response.status} ${text}`);
  }

  return response.json(); // { reference, transaction_id, cost, message, payer }
}
