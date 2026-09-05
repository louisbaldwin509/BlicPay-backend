import { createWorker } from 'tesseract.js';

// Fè OCR la yon sèl fwa epi retounen tèks brit la — itil pou re-itilize nan
// plizyè fonksyon (scan otomatik + verifikasyon final) san nou pa mande
// kliyan an telechaje foto a de fwa.
async function recognizeText(imageBase64, mimeType) {
  const worker = await createWorker('eng');
  try {
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;
    const { data } = await worker.recognize(dataUrl);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

// Eseye jwenn ID tranzaksyon an nan tèks la — chèche apre yon etikèt tankou
// "TID" oswa "ID tranzaksyon", swiv pa yon seri chif.
function extractLikelyTransactionId(text) {
  const match = text.match(/(?:TID|ID\s*tranzaksyon)[^0-9]{0,10}(\d{8,20})/i);
  return match ? match[1] : null;
}

// Eseye jwenn montan NÈT la (anvan frè) — chèche "Montant"/"Kantite lajan"
// men EVITE liy ki gen "total" ladan l (sa a se apre frè, pa sa nou vle).
function extractLikelyAmount(text) {
  const lines = text.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    const looksLikeNetLabel = (lower.includes('montant') || lower.includes('kantite lajan')) && !lower.includes('total');
    if (!looksLikeNetLabel) continue;
    const numMatch = line.match(/([\d][\d,]*\.?\d*)\s*(?:htg)?/i);
    if (numMatch) {
      const cleaned = numMatch[1].replace(/,/g, '');
      const value = Math.round(Number(cleaned));
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return null;
}

// Eskane yon resi pou pwopoze yon ID ak yon montan otomatikman — kliyan an
// ka toujou korije yo anvan li soumèt. Sa a se yon konfò, PA yon ranplasman
// pou verifikasyon final la (ki toujou fèt separeman lè kliyan an soumèt).
export async function scanReceipt(imageBase64, mimeType) {
  const text = await recognizeText(imageBase64, mimeType);
  return {
    suggestedTransactionId: extractLikelyTransactionId(text),
    suggestedAmount: extractLikelyAmount(text),
  };
}

// Li tèks nan yon imaj resi (base64) epi tcheke DE bagay: (1) ID tranzaksyon
// kliyan an tape a parèt yon kote nan tèks la, ak (2) montan kliyan an tape
// a tou parèt nan resi a — sa anpeche yon moun voye yon ti kantite lajan
// men tape yon pi gwo montan pou pran plis kredi pase sa l voye reyèlman.
//
// Nou nòmalize toude bò a (majiskil, retire espas/tirè/vigil) pou OCR la pa
// echwe sou ti diferans fòma ant diferan resi (egzanp "TID:" kont "ID
// tranzaksyon", oswa "70,000.00" kont "70000").
export async function verifyTransactionIdInReceipt(imageBase64, mimeType, typedTransactionId, typedAmount) {
  const extractedText = await recognizeText(imageBase64, mimeType);

  const normalize = (s) => s.toUpperCase().replace(/[\s\-–_,]/g, '');
  const normalizedExtracted = normalize(extractedText);

  const normalizedTyped = normalize(typedTransactionId);
  const idMatched = normalizedTyped.length >= 4 && normalizedExtracted.includes(normalizedTyped);

  // Chèche montan an ekri plizyè fason (san santim, ak santim ".00").
  const amountNum = Math.round(Number(typedAmount));
  const amountVariants = [`${amountNum}`, `${amountNum}.00`, `${amountNum},00`];
  const amountMatched = amountVariants.some((v) => normalizedExtracted.includes(normalize(v)));

  return { matched: idMatched && amountMatched, idMatched, amountMatched, extractedText };
}
