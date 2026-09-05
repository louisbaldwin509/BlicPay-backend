import { Router } from 'express';
import { prisma } from '../utils/db.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { generateReference } from '../utils/reference.js';
import { verifyTransactionIdInReceipt, scanReceipt } from '../utils/receiptOcr.js';

export const natcashManualRouter = Router();

// Kliyan an telechaje foto a — nou eskane l tousuit epi nou pwopoze yon ID
// ak yon montan otomatikman. Sa a se yon konfò sèlman: kliyan an ka toujou
// korije chan yo anvan li soumèt, epi verifikasyon final la (pi ba) toujou
// fèt separeman, kèlkeswa sa kliyan an te korije oswa non.
natcashManualRouter.post('/scan', requireAuth, requireVerified, async (req, res) => {
  const { proofImage, proofMimeType } = req.body;
  if (!proofImage || !proofMimeType) {
    return res.status(400).json({ error: 'Foto resi a obligatwa.' });
  }

  try {
    const { suggestedTransactionId, suggestedAmount } = await scanReceipt(proofImage, proofMimeType);
    res.json({ suggestedTransactionId, suggestedAmount });
  } catch (err) {
    console.error('NatCash receipt scan error:', err);
    res.status(500).json({ error: 'Nou pa t ka li resi a — ou ka toujou ranpli l manyèlman.' });
  }
});

// Kliyan an soumèt yon depo NatCash MANYÈL: montan, ID tranzaksyon li tape a
// la men, ak yon foto/kapti resi a. Nou li tèks nan foto a (OCR) epi nou
// BLOKE demand lan si ID li tape a pa parèt okenn kote nan resi a — sa
// anpeche yon moun kapti yon vre resi men tape yon fo ID, oswa vis vèsa.
natcashManualRouter.post('/', requireAuth, requireVerified, async (req, res) => {
  const { amount, transactionId, proofImage, proofMimeType } = req.body;
  const numericAmount = Math.round(Number(amount));

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Montan an pa valab.' });
  }
  if (!transactionId || !transactionId.trim()) {
    return res.status(400).json({ error: 'ID tranzaksyon an obligatwa.' });
  }
  if (!proofImage || !proofMimeType) {
    return res.status(400).json({ error: 'Foto resi a obligatwa.' });
  }

  // Anpeche menm resi a (menm ID tranzaksyon) itilize de fwa pou pran plis
  // kredi pase sa yon sèl vre tranzaksyon vo — verifye AVAN nou fè OCR la
  // (pi rapid, epi evite gaspiye tan OCR sou yon demand k ap rejte de tout fason).
  const alreadyUsed = await prisma.deposit.findUnique({ where: { transactionId: transactionId.trim() } });
  if (alreadyUsed) {
    return res.status(409).json({ error: 'Resi sa a deja itilize pou yon lòt depo — ou pa ka sèvi avè l ankò.' });
  }

  try {
    const { matched, idMatched, amountMatched } = await verifyTransactionIdInReceipt(
      proofImage, proofMimeType, transactionId.trim(), numericAmount,
    );

    if (!matched) {
      if (!idMatched) {
        return res.status(400).json({
          error: 'ID tranzaksyon ou tape a pa koresponn ak sa nou jwenn nan resi a. Verifye epi eseye ankò.',
        });
      }
      return res.status(400).json({
        error: `Montan ou tape a (${numericAmount.toLocaleString('fr-FR')} HTG) pa parèt nan resi a. Verifye ou mete montan REYÈL ou voye a.`,
      });
    }

    const deposit = await prisma.deposit.create({
      data: {
        userId: req.user.id,
        amount: numericAmount,
        method: 'natcash',
        reference: generateReference('NAT-'),
        transactionId: transactionId.trim(),
        proofImage,
        proofMimeType,
      },
    });

    res.status(201).json({ deposit });
  } catch (err) {
    // Si de moun soumèt EGZAKTEMAN menm ID tranzaksyon an anmenmtan, tcheke
    // rapid pi wo a (findUnique) ka pa sifi pou kont li — baz done a bloke
    // doub la kanmenm gras a kontrent @unique la (kòd erè Prisma P2002).
    if (err.code === 'P2002' && err.meta?.target?.includes('transactionId')) {
      return res.status(409).json({ error: 'Resi sa a deja itilize pou yon lòt depo — ou pa ka sèvi avè l ankò.' });
    }
    console.error('NatCash OCR verification error:', err);
    res.status(500).json({ error: 'Nou pa t ka verifye resi a — eseye ankò pita.' });
  }
});
