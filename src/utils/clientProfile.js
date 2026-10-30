// Enfòmasyon idantifikasyon kliyan (CIP / KYC debaz) yon enstitisyon finansye
// dwe kolekte lè yon kont louvri. Pyès idantite a ak selfi a verifye apre pa
// Didit (KYC) — isit la se deklarasyon kliyan an.
export const ID_TYPES = ['cin', 'nif', 'passport', 'license'];
export const GENDERS = ['F', 'M'];
export const OCCUPATIONS = ['employed', 'self_employed', 'business_owner', 'student', 'unemployed', 'retired', 'other'];
export const FUND_SOURCES = ['salary', 'business', 'remittances', 'savings', 'pension', 'other'];
export const MONTHLY_VOLUMES = ['lt25k', '25k_100k', '100k_500k', 'gt500k'];
export const COUNTRIES = ['HT', 'US', 'CA', 'FR', 'DO', 'CL', 'BR', 'OTHER'];
export const DEPARTMENTS = ['Ouest', 'Nord', 'Nord-Est', 'Nord-Ouest', 'Artibonite', 'Centre', 'Sud', 'Sud-Est', "Grand'Anse", 'Nippes', 'abroad'];
export const TERMS_VERSION = '2026-10';

const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Retounen { data } (chan pou User) oswa { error } (mesaj kreyòl).
export function parseClientProfile(body = {}) {
  const firstName = str(body.firstName, 60);
  const lastName = str(body.lastName, 60);
  if (!firstName || !lastName) return { error: 'Non ak siyati obligatwa.' };

  const dob = body.dateOfBirth ? new Date(String(body.dateOfBirth)) : null;
  if (!dob || Number.isNaN(dob.getTime())) return { error: 'Dat nesans lan obligatwa.' };
  const age = (Date.now() - dob.getTime()) / (365.25 * 86400000);
  if (age < 18) return { error: 'Ou dwe gen omwen 18 an pou louvri yon kont.' };
  if (age > 110) return { error: 'Dat nesans lan pa valab.' };

  const gender = str(body.gender, 2);
  if (!GENDERS.includes(gender)) return { error: 'Chwazi sèks ou.' };
  const nationality = str(body.nationality, 10);
  if (!COUNTRIES.includes(nationality)) return { error: 'Chwazi nasyonalite ou.' };
  const birthPlace = str(body.birthPlace, 80);
  if (!birthPlace) return { error: 'Kote ou fèt obligatwa.' };

  const email = str(body.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Imèl la pa valab.' };

  const addressLine = str(body.addressLine ?? body.address, 160);
  const city = str(body.city, 80);
  const department = str(body.department, 20);
  const country = str(body.country, 10);
  if (!addressLine || !city) return { error: 'Adrès ak vil obligatwa.' };
  if (!COUNTRIES.includes(country)) return { error: 'Chwazi peyi kote ou rete a.' };
  if (country === 'HT' && !DEPARTMENTS.includes(department)) return { error: 'Chwazi depatman ou.' };

  const idType = str(body.idType, 12);
  const idNumber = str(body.idNumber, 40).toUpperCase();
  if (!ID_TYPES.includes(idType) || idNumber.length < 5) return { error: 'Tip ak nimewo pyès idantite a obligatwa.' };
  let idExpiry = null;
  if (body.idExpiry) {
    idExpiry = new Date(String(body.idExpiry));
    if (Number.isNaN(idExpiry.getTime())) return { error: 'Dat ekspirasyon pyès la pa valab.' };
    if (idExpiry.getTime() < Date.now()) return { error: 'Pyès idantite a ekspire.' };
  }

  const occupation = str(body.occupation, 20);
  if (!OCCUPATIONS.includes(occupation)) return { error: 'Chwazi okipasyon ou.' };
  const employer = str(body.employer, 120) || null;
  const sourceOfFunds = str(body.sourceOfFunds, 20);
  if (!FUND_SOURCES.includes(sourceOfFunds)) return { error: 'Chwazi sous lajan ou.' };
  const expectedMonthlyVolume = str(body.expectedMonthlyVolume, 20);
  if (!MONTHLY_VOLUMES.includes(expectedMonthlyVolume)) return { error: 'Chwazi konbyen lajan ou panse fè pa mwa.' };
  if (typeof body.isPep !== 'boolean') return { error: 'Reponn kesyon sou moun ki ekspoze politikman an.' };

  if (body.acceptedTerms !== true || body.certifiedAccurate !== true) {
    return { error: 'Ou dwe aksepte kondisyon yo epi sètifye enfòmasyon yo egzak.' };
  }

  return {
    data: {
      firstName, lastName, fullName: `${firstName} ${lastName}`,
      dateOfBirth: dob, gender, nationality, birthPlace,
      email, addressLine, city, department: country === 'HT' ? department : (department || null), country,
      idType, idNumber, idExpiry,
      occupation, employer, sourceOfFunds, expectedMonthlyVolume, isPep: body.isPep,
      termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION,
    },
  };
}

export const PROFILE_SELECT = {
  firstName: true, lastName: true, dateOfBirth: true, gender: true, nationality: true, birthPlace: true,
  email: true, addressLine: true, city: true, department: true, country: true,
  idType: true, idNumber: true, idExpiry: true,
  occupation: true, employer: true, sourceOfFunds: true, expectedMonthlyVolume: true, isPep: true,
  termsAcceptedAt: true, termsVersion: true,
};
