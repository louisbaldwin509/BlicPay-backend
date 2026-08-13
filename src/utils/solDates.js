// Menm lojik ak App.jsx (kliyan an) pou kalkile dat peman yo — kenbe yo
// sinkwonize si youn chanje.
const MONTHS_HT = ['Janvye', 'Fevriye', 'Mas', 'Avril', 'Me', 'Jen', 'Jiyè', 'Out', 'Septanm', 'Oktòb', 'Novanm', 'Desanm'];

export function addPeriod(date, frequencyId, offset) {
  const d = new Date(date);
  if (frequencyId === 'semenn') d.setDate(d.getDate() + 7 * offset);
  else if (frequencyId === 'kenzenn') d.setDate(d.getDate() + 15 * offset);
  else d.setMonth(d.getMonth() + offset);
  return d;
}

export function periodLabel(date, frequencyId) {
  if (frequencyId === 'mwa') return `${MONTHS_HT[date.getMonth()]} ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS_HT[date.getMonth()]}`;
}

export function currentPeriodKey(frequencyId) {
  const now = new Date();
  if (frequencyId === 'mwa') return `${now.getFullYear()}-${now.getMonth()}`;
  if (frequencyId === 'kenzenn') return `${now.getFullYear()}-${now.getMonth()}-${now.getDate() <= 15 ? 'A' : 'B'}`;
  const d = new Date(now);
  const day = d.getDay();
  const diffToFriday = day >= 5 ? day - 5 : day + 2;
  d.setDate(d.getDate() - diffToFriday);
  return d.toISOString().slice(0, 10);
}

// Dat yon manm espesifik ap resevwa pòch li, dapre pozisyon li (turnIndex)
// konpare ak wotasyon aktyèl gwoup la (currentTurn).
export function memberPayoutDate(group, turnIndex) {
  const offset = turnIndex - group.currentTurn;
  if (group.frequencyId === 'semenn') {
    const friday = new Date(currentPeriodKey('semenn'));
    friday.setDate(friday.getDate() + 7 * offset + 3);
    return `Lendi ${friday.getDate()} ${MONTHS_HT[friday.getMonth()]}`;
  }
  return periodLabel(addPeriod(new Date(), group.frequencyId, offset), group.frequencyId);
}
