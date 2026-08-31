import rateLimit from 'express-rate-limit';

// Kont tantativ konneksyon: pa plis pase 8 eseye pou menm IP la nan 15 minit.
// Sa anpeche yon atakan eseye divinye modpas yon kont ak fòs brit.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Twòp tantativ konneksyon — tann kèk minit epi eseye ankò.' },
});

// Kont konbyen fwa yon moun ka kòmanse yon sesyon Didit: pa plis pase 5 pou
// menm IP la nan yon èdtan. Chak sesyon Didit koute lajan (AML Screening),
// kidonk sa a pwoteje kont abi/atak ki ta fè nou peye pou anyen.
export const diditStartLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Twòp demand verifikasyon — tann yon ti moman epi eseye ankò.' },
});
