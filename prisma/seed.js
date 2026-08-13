import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TIERS = [
  { id: 'basic', name: 'Basic' },
  { id: 'standard', name: 'Standard' },
  { id: 'premium', name: 'Premium' },
];

const FREQUENCIES = [
  { id: 'semenn', label: 'Chak semenn', amounts: { basic: 1000, standard: 2500, premium: 5000 } },
  { id: 'kenzenn', label: 'Chak 15 jou', amounts: { basic: 4000, standard: 8000, premium: 10000 } },
  { id: 'mwa', label: 'Chak mwa', amounts: { basic: 10000, standard: 15000, premium: 20000 } },
];

async function main() {
  const existing = await prisma.solGroup.count();
  if (existing > 0) {
    console.log(`Gen deja ${existing} gwoup Sòl nan baz done a — pa kreye ankò.`);
    return;
  }

  const rows = [];
  for (const freq of FREQUENCIES) {
    for (const tier of TIERS) {
      for (let i = 1; i <= 10; i++) {
        rows.push({
          tierId: tier.id,
          tier: tier.name,
          frequencyId: freq.id,
          frequency: freq.label,
          name: `Sòl ${tier.name} #${i}`,
          order: i,
          amount: freq.amounts[tier.id],
          maxMembers: 10,
        });
      }
    }
  }

  await prisma.solGroup.createMany({ data: rows });
  console.log(`Kreye ${rows.length} gwoup Sòl.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
