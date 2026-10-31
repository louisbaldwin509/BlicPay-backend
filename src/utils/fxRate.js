// Tal chanj USD → HTG (BRH), an kachèt pou jounen an. Si API a pa disponib:
// dènye tal nou te genyen, oswa FALLBACK_USD_HTG (Railway), oswa 132.
let cache = null; // { rate, rateDate, fetchedAt }

export async function getUsdHtgRate() {
  const today = new Date().toISOString().slice(0, 10);
  if (cache && cache.fetchedAt === today) return { ...cache, cached: true };
  try {
    const r = await fetch('https://allratestoday.com/api/v1/central-bank/brh/latest?source=USD&target=HTG', {
      headers: { Authorization: `Bearer ${process.env.BRH_RATE_API_KEY}` },
    });
    if (!r.ok) throw new Error(`BRH rate API ${r.status}`);
    const data = await r.json();
    const rate = Number(data.rate || data.data?.rate || data.value);
    const rateDate = data.rate_date || data.date || today;
    if (!rate) throw new Error('Pa jwenn tal la nan repons lan.');
    cache = { rate, rateDate, fetchedAt: today };
    return { ...cache, cached: false };
  } catch (err) {
    console.error('BRH exchange rate fetch error:', err.message);
    if (cache) return { ...cache, cached: true, stale: true };
    const fallback = Number(process.env.FALLBACK_USD_HTG) || 132;
    return { rate: fallback, rateDate: null, cached: false, stale: true, fallback: true };
  }
}
