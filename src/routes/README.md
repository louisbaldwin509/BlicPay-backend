# BLICPay API

Backend minimal pour BLICPay : kont itilizatè, sòld, depo, ak konfimasyon admin.

## Sa ki ladan

- `POST /auth/register`, `POST /auth/login` — kreye kont / konekte, retounen yon JWT
- `GET /wallet/balance` — sòld itilizatè a konekte a
- `GET /wallet/transactions` — istwa depo li yo
- `POST /deposits` — kreye yon demand depo (`{ amount, method }`), retounen yon referans
- `GET /deposits/:id` — verifye estati yon depo (itilize pou bouton "rafrechi" a)
- `GET /admin/deposits/pending` — (admin) lis depo k'ap tann
- `POST /admin/deposits/:id/confirm` — (admin) konfime yon depo, ajoute l nan sòld la
- `POST /admin/deposits/:id/reject` — (admin) rejte yon depo

### API Marchan (pou resevwa peman sou yon lòt sit entènèt)

- `POST /merchant/auth/register` — kreye yon kont biznis (`{ businessName, email, password, website }`),
  retounen yon `publicKey` (`pk_live_...`) ak yon `secretKey` (`sk_live_...`)
- `POST /merchant/auth/login` — konekte nan tablo bò marchan an
- `GET /merchant/me` — enfo kont marchan an (Bearer JWT)
- `GET /merchant/payments` — istwa tout peman yo resevwa (Bearer JWT)
- `PATCH /merchant/webhook` — konfigire `{ webhookUrl }` pou resevwa nòtifikasyon otomatik
- `POST /merchant/rotate-keys` — jenere nouvo kle si sekrè a fwit

**Kreye yon demand peman** (rele sa a soti nan SÈVÈ marchan an, ak `sk_live_...`):
```bash
curl -X POST https://api.blicpay.com/payments \
  -H "Authorization: Bearer sk_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 4500, "reference": "KOMAND-1029", "description": "Chemiz Ayiti Cheri" }'
# → { "paymentId": "...", "checkoutUrl": "https://checkout.blicpay.com/...", "status": "pending" }
```

Marchan an redirije kliyan an (oswa louvri yon popup) sou `checkoutUrl` la — sa a se
`blicpay-checkout.jsx`, kote kliyan an konekte epi konfime peman an soti nan sòld
BLICPay li. Lè sa fèt, `POST /payments/:id/pay` (rele soti nan app kliyan an) dedwi sòld
kliyan an, kredite sòld marchan an, epi (si yon `webhookUrl` konfigire) voye yon POST bay
sèvè marchan an pou l konfime kòmand lan otomatikman.

Tout depo kòmanse `pending`. Sòld la pa chanje jistan yon admin konfime l (pou depo "biwo")
oswa jistan yon webhook founisè peman verifye konfime l (pa poko konstwi — gade pi ba).

## Enstalasyon lokal

```bash
cd blicpay-backend
npm install
cp .env.example .env
# louvri .env, chanje JWT_SECRET pou yon vre valè aleyatwa

npx prisma migrate dev --name init
npm run dev
```

Sèvè a ap kouri sou `http://localhost:4000`. Teste avèk:

```bash
curl http://localhost:4000/health
```

## Kreye yon admin

Pa gen woutin pou sa toujou (pou rezon sekirite — pa vle nenpòt moun ka kreye yon admin
nan yon fòm piblik). Fè l dirèkteman nan baz done a apre ou fin enskri yon kont nòmal:

```bash
npx prisma studio
```

Louvri tab `User`, chanje `role` moun nan pou `admin`, sove.

## Deplwaman (mete l sou entènèt)

Pa gen anyen isit la ki mache san yon vrè sèvè — pa gen okenn "deplwaye otomatikman" isit
la, men men pi senp opsyon yo:

1. **Railway** oswa **Render** — konekte repo GitHub ou, yo detekte Node.js otomatikman,
   ajoute varyab anviwònman yo (menm sa ki nan `.env`), epi yo bay yon URL piblik.
2. **VPS** (DigitalOcean, Linode, elatriye) — plis kontwòl, men ou dwe jere sèvè a ou menm
   (sekirite, sètifika HTTPS, elatriye).

Pou pwodiksyon, chanje `DATABASE_URL` pou yon baz PostgreSQL (Railway ak Render ofri sa
gratis pou konmanse) olye SQLite — chanje `provider = "sqlite"` pou `"postgresql"` nan
`prisma/schema.prisma`.

## Sa ki MANKE anvan ou ka lanse sa piblikman

Sa a se yon eskeleton solid, men li poko yon sistèm peman reyèl:

1. **Entegrasyon MonCash / NatCash / Zelle / USDT reyèl** — kounye a, depo mobil yo rete
   `pending` jistan yon admin konfime yo manyèlman, menm jan ak depo biwo. Pou otomatize sa,
   ou bezwen:
   - Yon **kont machann** ak chak founisè (Digicel pou MonCash, Natcom pou NatCash, elatriye)
   - Kle API yo, ki dwe rete **sèlman sou sèvè a** — pa janm nan kòd front-end lan
   - Yon **webhook** (yon woutin tankou `POST /webhooks/moncash`) ki resevwa konfimasyon
     otomatik founisè a voye lè yon depo reyisi, verifye siyati li, epi konfime depo a
2. **Validasyon ak sekirite siplemantè** — limit sou kantite tantativ konjesyon (rate
   limiting), validasyon fòma nimewo telefòn, log odit pou chak aksyon admin
3. **Konfòmite regilatwa** — jan nou te mansyone deja, kolekte lajan piblik ka mande
   siveyans BRH an Ayiti; verifye ak yon avoka anvan lansman piblik
4. **Backups otomatik** pou baz done a, ak yon anviwònman tès separe de pwodiksyon
5. **Deplwaye `blicpay-checkout.jsx`** kòmsi se yon sit apa (menm jan ak `blicpay-app.jsx`),
   epi mete vrè URL li nan `CHECKOUT_BASE_URL` — san sa, `checkoutUrl` yo pa mennen okenn kote
6. **Verifikasyon webhook** — jan sa ye kounye a, `POST /payments/:id/pay` fè konfyans nenpòt
   moun ki gen yon JWT valab; anvan pwodiksyon, ta bon pou siyen chak webhook ak yon sekrè
   (menm jan ak Stripe) pou marchan an ka verifye li vrèman soti nan BLICPay

## Konekte l ak front-end React la

Front-end lan (`blicpay-app.jsx`) itilize kounye a done ki simile lokalman nan memwa React.
Pwochèn etap la se ranplase sa yo pa vrè apèl `fetch(...)` bay API sa a — mwen ka fè sa nan
yon pwochèn pase si ou vle.
