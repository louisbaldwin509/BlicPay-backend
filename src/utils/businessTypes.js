// Fòm legal antrepriz yo ann Ayiti ak dokiman BLICPay mande pou chak.
// App mobil la ak panèl admin la li lis sa a nan GET /business/types — pou
// ajoute/chanje yon dokiman, chanje l ISIT LA sèlman.
//
// Idantite reprezantan legal la verifye apa, ak KYC Didit sou kont li.

export const DOCUMENTS = {
  nif: { ht: 'Kat NIF (matrikil fiskal DGI)', fr: 'Carte NIF (matricule fiscal DGI)', en: 'NIF card (DGI tax ID)' },
  patente: { ht: 'Patant ane fiskal an kou (DGI)', fr: 'Patente de l’exercice en cours (DGI)', en: 'Current-year patente (DGI business licence)' },
  cip: { ht: 'Kat Idantite Pwofesyonèl (CIP)', fr: 'Carte d’Identité Professionnelle (CIP)', en: 'Professional ID card (CIP)' },
  tradename_cert: { ht: 'Sètifika non komèsyal (MCI)', fr: 'Certificat de nom commercial (MCI)', en: 'Trade name certificate (MCI)' },
  address_proof: { ht: 'Prèv adrès biznis la (bòdwo EDH, kontra lwaye…)', fr: 'Justificatif d’adresse de l’entreprise (facture EDH, bail…)', en: 'Proof of business address (utility bill, lease…)' },
  statuts: { ht: 'Estati / akt konstititif', fr: 'Statuts / acte constitutif', en: 'Articles of incorporation / bylaws' },
  moniteur: { ht: 'Piblikasyon nan Le Moniteur', fr: 'Publication au journal Le Moniteur', en: 'Publication in Le Moniteur' },
  mci_cert: { ht: 'Sètifika anrejistreman MCI', fr: 'Certificat d’enregistrement MCI', en: 'MCI registration certificate' },
  shareholders: { ht: 'Lis aksyonè ak administratè yo', fr: 'Liste des actionnaires et administrateurs', en: 'List of shareholders and directors' },
  board_resolution: {
    ht: 'Rezolisyon / pwosè-vèbal ki otorize ouvèti kont lan e ki nonmen reprezantan an',
    fr: 'Résolution / procès-verbal autorisant l’ouverture du compte et désignant le représentant',
    en: 'Resolution / minutes authorizing the account and appointing the representative',
  },
  ngo_recognition: { ht: 'Sètifika rekonesans ONG (UCAONG / MPCE)', fr: 'Certificat de reconnaissance ONG (UCAONG / MPCE)', en: 'NGO recognition certificate (UCAONG / MPCE)' },
  assoc_recognition: { ht: 'Rekonesans ofisyèl asosyasyon / fondasyon', fr: 'Reconnaissance officielle de l’association / fondation', en: 'Official recognition of the association / foundation' },
  cnc_cert: { ht: 'Sètifika Konsèy Nasyonal Kooperativ (CNC)', fr: 'Certificat du Conseil National des Coopératives (CNC)', en: 'National Cooperatives Council (CNC) certificate' },
  foreign_authorization: { ht: 'Otorizasyon pou fonksyone ann Ayiti (MCI)', fr: 'Autorisation de fonctionner en Haïti (MCI)', en: 'Authorization to operate in Haiti (MCI)' },
  foreign_docs: { ht: 'Dokiman konstititif peyi orijin (omologe pa konsila)', fr: 'Documents constitutifs du pays d’origine (homologués par le consulat)', en: 'Home-country incorporation documents (consulate-certified)' },
  // ---- Kont PWO ----
  personal_address_proof: { ht: 'Prèv adrès (mwens pase 3 mwa): bòdwo EDH/Digicel/Natcom, kontra lwaye, atestasyon CASEC/meri', fr: 'Justificatif d’adresse (moins de 3 mois) : facture EDH/Digicel/Natcom, bail, attestation CASEC/mairie', en: 'Proof of address (under 3 months): EDH/Digicel/Natcom bill, lease, CASEC/town-hall certificate' },
  bank_statement: { ht: 'Relve bank (oswa istorik MonCash/NatCash) 3 dènye mwa yo', fr: 'Relevé bancaire (ou historique MonCash/NatCash) des 3 derniers mois', en: 'Bank statement (or MonCash/NatCash history) for the last 3 months' },
  storefront_photo: { ht: 'Foto pwen vant lan / magazen an (ak ensey la si posib)', fr: 'Photo du point de vente / local (avec l’enseigne si possible)', en: 'Photo of the shop / premises (with the sign if possible)' },
  online_page: { ht: 'Kapti paj pwofesyonèl la (ak kòd BLICPAY la nan bio a)', fr: 'Capture de la page professionnelle (avec le code BLICPAY dans la bio)', en: 'Screenshot of the business page (with the BLICPAY code in the bio)' },
  order_screens: { ht: 'Kapti kòmand oswa konvèsasyon ak kliyan', fr: 'Captures de commandes ou de conversations clients', en: 'Screenshots of orders or customer conversations' },
  supplier_invoices: { ht: 'Fakti founisè', fr: 'Factures fournisseurs', en: 'Supplier invoices' },
  client_invoices: { ht: 'Fakti oswa resi ou bay kliyan', fr: 'Factures ou reçus remis aux clients', en: 'Invoices or receipts issued to customers' },
  association_card: { ht: 'Kat asosyasyon / sendika', fr: 'Carte d’association / de syndicat', en: 'Association / union card' },
  work_photos: { ht: 'Foto travay ou fè', fr: 'Photos de réalisations', en: 'Photos of your work' },
  drivers_license: { ht: 'Lisans kondwi', fr: 'Permis de conduire', en: 'Driver’s licence' },
  vehicle_registration: { ht: 'Kat gri / plak machin nan', fr: 'Carte grise / immatriculation du véhicule', en: 'Vehicle registration' },
  diploma_license: { ht: 'Diplòm oswa kat lòd pwofesyonèl', fr: 'Diplôme ou carte de l’ordre professionnel', en: 'Diploma or professional body card' },
  contracts: { ht: 'Kontra ak kliyan', fr: 'Contrats clients', en: 'Client contracts' },
  coop_attestation: { ht: 'Atestasyon kooperativ / asosyasyon / CASEC', fr: 'Attestation de coopérative / association / CASEC', en: 'Cooperative / association / CASEC certificate' },
};

// KONT PWO — kategori aktivite yo ak prèv aktivite yo aksepte (omwen YON).
// Baz obligatwa pou tout kont pwo: NIF, prèv adrès, relve 3 mwa.
export const PRO_BASE_DOCS = ['nif', 'personal_address_proof', 'bank_statement'];
export const PRO_CATEGORIES = {
  shop: { label: { ht: 'Komès ak pwen vant', fr: 'Commerce avec point de vente', en: 'Shop / point of sale' }, hint: { ht: 'Boutik, mache, restoran, famasi…', fr: 'Boutique, marché, restaurant, pharmacie…', en: 'Shop, market stall, restaurant, pharmacy…' }, proofs: ['storefront_photo', 'patente', 'supplier_invoices'] },
  online: { label: { ht: 'Vant an liy', fr: 'Vente en ligne', en: 'Online selling' }, hint: { ht: 'Instagram, Facebook, WhatsApp, sit entènèt…', fr: 'Instagram, Facebook, WhatsApp, site web…', en: 'Instagram, Facebook, WhatsApp, website…' }, proofs: ['online_page', 'order_screens', 'supplier_invoices'] },
  services: { label: { ht: 'Sèvis ak metye', fr: 'Services & métiers', en: 'Services & trades' }, hint: { ht: 'Kwafi, mekanik, kouti, konstriksyon, reparasyon…', fr: 'Coiffure, mécanique, couture, construction, réparation…', en: 'Hairdressing, mechanics, tailoring, construction, repair…' }, proofs: ['association_card', 'work_photos', 'client_invoices', 'cip'] },
  transport: { label: { ht: 'Transpò ak livrezon', fr: 'Transport & livraison', en: 'Transport & delivery' }, hint: { ht: 'Taksi-moto, taksi, livrè…', fr: 'Taxi-moto, taxi, livreur…', en: 'Moto-taxi, taxi, courier…' }, proofs: ['drivers_license', 'vehicle_registration'] },
  liberal: { label: { ht: 'Pwofesyon liberal ak freelance', fr: 'Professions libérales & freelances', en: 'Professionals & freelancers' }, hint: { ht: 'Doktè, avoka, kontab, devlopè, kreyatè kontni…', fr: 'Médecin, avocat, comptable, développeur, créateur de contenu…', en: 'Doctor, lawyer, accountant, developer, content creator…' }, proofs: ['diploma_license', 'contracts', 'client_invoices'] },
  agri: { label: { ht: 'Agrikilti ak elvaj', fr: 'Agriculture & élevage', en: 'Farming & livestock' }, hint: { ht: 'Plantè, elvè, transfòmasyon…', fr: 'Planteur, éleveur, transformation…', en: 'Grower, livestock, processing…' }, proofs: ['coop_attestation', 'work_photos'] },
};
// Aktivite BLICPay pa aksepte (risk konfòmite / emetè kat yo pa aksepte yo).
export const PRO_REFUSED = [
  { ht: 'Chanj lajan ak transfè lajan', fr: 'Change et transfert d’argent', en: 'Currency exchange & money transfer' },
  { ht: 'Jwèt aza ak bòlèt', fr: 'Jeux d’argent et borlette', en: 'Gambling & lottery (borlette)' },
  { ht: 'Kripto-monnen', fr: 'Crypto-monnaies', en: 'Cryptocurrencies' },
  { ht: 'Lò, bijou ak metal presye', fr: 'Or, bijoux et métaux précieux', en: 'Gold, jewellery & precious metals' },
  { ht: 'Vant machin ak imobilye', fr: 'Vente de véhicules et immobilier', en: 'Vehicle sales & real estate' },
  { ht: 'Kolèk don', fr: 'Collecte de dons', en: 'Fundraising / donations' },
  { ht: 'Zam, kontni pou granmoun, dwòg', fr: 'Armes, contenu adulte, drogues', en: 'Weapons, adult content, drugs' },
];

// required: obligatwa pou soumèt dosye a. optional: kliyan an ka ajoute yo.
// "pro" = kont PWO (yon moun ki travay pou kont li) — pa yon sosyete.
export const LEGAL_FORMS = {
  pro: {
    label: { ht: 'Kont Pwo (endepandan / ti komès)', fr: 'Compte Pro (indépendant / petit commerce)', en: 'Pro account (self-employed / small business)' },
    required: PRO_BASE_DOCS,
    optional: [],
    pro: true,
  },
  individual: {
    label: { ht: 'Antrepriz endividyèl (komèsan)', fr: 'Entreprise individuelle (commerçant)', en: 'Sole proprietorship' },
    required: ['nif', 'patente', 'cip', 'address_proof'],
    optional: ['tradename_cert'],
  },
  sa: {
    label: { ht: 'Sosyete Anonim (S.A.)', fr: 'Société Anonyme (S.A.)', en: 'Public limited company (S.A.)' },
    required: ['statuts', 'moniteur', 'mci_cert', 'nif', 'patente', 'shareholders', 'board_resolution', 'address_proof'],
    optional: [],
  },
  snc: {
    label: { ht: 'Sosyete an non kolektif / an kòmandit', fr: 'Société en nom collectif / en commandite', en: 'General / limited partnership' },
    required: ['statuts', 'mci_cert', 'moniteur', 'nif', 'patente', 'address_proof'],
    optional: ['board_resolution'],
  },
  ngo: {
    label: { ht: 'ONG', fr: 'ONG', en: 'NGO' },
    required: ['ngo_recognition', 'statuts', 'moniteur', 'nif', 'board_resolution', 'address_proof'],
    optional: [],
  },
  association: {
    label: { ht: 'Asosyasyon / Fondasyon', fr: 'Association / Fondation', en: 'Association / Foundation' },
    required: ['assoc_recognition', 'statuts', 'nif', 'board_resolution', 'address_proof'],
    optional: ['moniteur'],
  },
  coop: {
    label: { ht: 'Kooperativ', fr: 'Coopérative', en: 'Cooperative' },
    required: ['cnc_cert', 'statuts', 'nif', 'board_resolution', 'address_proof'],
    optional: [],
  },
  foreign: {
    label: { ht: 'Sosyete etranje (branch ann Ayiti)', fr: 'Société étrangère (succursale en Haïti)', en: 'Foreign company (Haiti branch)' },
    required: ['foreign_authorization', 'foreign_docs', 'moniteur', 'nif', 'patente', 'board_resolution', 'address_proof'],
    optional: [],
  },
};

export const EMPLOYEE_RANGES = {
  '1': { ht: '1 moun (mwen sèl)', fr: '1 personne (moi seul)', en: '1 person (just me)' },
  '2_10': { ht: '2 – 10', fr: '2 – 10', en: '2 – 10' },
  '11_50': { ht: '11 – 50', fr: '11 – 50', en: '11 – 50' },
  '51_200': { ht: '51 – 200', fr: '51 – 200', en: '51 – 200' },
  gt200: { ht: 'Plis pase 200', fr: 'Plus de 200', en: 'More than 200' },
};
export const BIZ_FUND_SOURCES = {
  sales: { ht: 'Lavant pwodwi', fr: 'Ventes de produits', en: 'Product sales' },
  services: { ht: 'Sèvis', fr: 'Prestations de services', en: 'Services' },
  investment: { ht: 'Envestisman / kapital asosye yo', fr: 'Apports / capital des associés', en: 'Investment / partners’ capital' },
  loans: { ht: 'Prè', fr: 'Prêts / financement', en: 'Loans / financing' },
  other: { ht: 'Lòt', fr: 'Autre', en: 'Other' },
};
export const ACCOUNT_PURPOSES = {
  receive: { ht: 'Resevwa peman kliyan', fr: 'Recevoir les paiements des clients', en: 'Receive customer payments' },
  suppliers: { ht: 'Peye founisè', fr: 'Payer des fournisseurs', en: 'Pay suppliers' },
  payroll: { ht: 'Peye anplwaye', fr: 'Payer des employés', en: 'Pay employees' },
  cards: { ht: 'Kat pou depans antrepriz', fr: 'Cartes pour les dépenses de l’entreprise', en: 'Cards for business expenses' },
  mixed: { ht: 'Tout sa yo', fr: 'Plusieurs de ces usages', en: 'Several of these' },
};
export const BIZ_MONTHLY_VOLUMES = {
  lt100k: { ht: 'Mwens pase 100 000 HTG', fr: 'Moins de 100 000 HTG', en: 'Less than 100,000 HTG' },
  '100k_500k': { ht: '100 000 – 500 000 HTG', fr: '100 000 – 500 000 HTG', en: '100,000 – 500,000 HTG' },
  '500k_2m': { ht: '500 000 – 2 milyon HTG', fr: '500 000 – 2 millions HTG', en: '500,000 – 2 million HTG' },
  gt2m: { ht: 'Plis pase 2 milyon HTG', fr: 'Plus de 2 millions HTG', en: 'More than 2 million HTG' },
};

export const TURNOVER_RANGES = {
  lt1m: { ht: 'Mwens pase 1 milyon HTG', fr: 'Moins de 1 million HTG', en: 'Under 1 million HTG' },
  '1m_5m': { ht: '1 – 5 milyon HTG', fr: '1 – 5 millions HTG', en: '1 – 5 million HTG' },
  '5m_25m': { ht: '5 – 25 milyon HTG', fr: '5 – 25 millions HTG', en: '5 – 25 million HTG' },
  gt25m: { ht: 'Plis pase 25 milyon HTG', fr: 'Plus de 25 millions HTG', en: 'Over 25 million HTG' },
};

// Plafon retrè (HTG). Kont antrepriz APWOUVE yo jwenn plafon ki pi wo.
export const WITHDRAWAL_CAPS = {
  personal: { daily: 80_000, weekly: 300_000, monthly: 500_000 },
  pro: { daily: 200_000, weekly: 800_000, monthly: 1_500_000 },
  business: { daily: 500_000, weekly: 2_000_000, monthly: 5_000_000 },
};

export function capsFor(user) {
  if (user?.accountType === 'business' && user?.business?.status === 'approved') {
    return user.business.legalForm === 'pro' ? WITHDRAWAL_CAPS.pro : WITHDRAWAL_CAPS.business;
  }
  return WITHDRAWAL_CAPS.personal;
}

// Non pou montre lòt moun (transfè, istorik): non komèsyal la si kont
// antrepriz la apwouve, sinon non moun nan.
export function displayName(user) {
  if (user?.accountType === 'business' && user?.business?.status === 'approved') {
    return user.business.tradeName || user.business.legalName || user.fullName;
  }
  return user?.fullName;
}
