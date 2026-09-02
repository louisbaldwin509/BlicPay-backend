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

// ---------------------------------------------------------------------------
// Nouvo fonksyon pou wotasyon REYÈL (admin kòmanse gwoup la + trete chak
// peryòd). Sa yo bay dat egzak (limit kotizasyon + dat vèsman) dapre dat
// gwoup la KÒMANSE (`startedAt`), pa jis "kounye a" — pou wotasyon an rete
// presi menm si admin trete yon peryòd an reta.
// ---------------------------------------------------------------------------

// Premye Vandredi menm jou a oswa apre yon dat done.
function nextOrSameFriday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=dimanch, 5=vandredi
  const diff = (5 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

// Dat limit pou peye kotizasyon peryòd `period` la (0-endekse), ak dat
// prevwa pou vèsman pòch la (jou apre limit la).
//
// - semenn:  limit = Vandredi, vèsman = Lendi ki swiv
// - kenzenn: menm jan an, men chak 15 jou (kenbe menm konvansyon ak
//            addPeriod ki egziste deja — ka glise sou lòt jou lasemenn si
//            plizyè peryòd pase, men rete konsistan ak rès sistèm nan)
// - mwa:     limit = 28 mwa a, vèsman = 1ye mwa apre a
export function getPeriodDates(group, period) {
  if (!group.startedAt) return null;

  const start = new Date(group.startedAt);

  if (group.frequencyId === 'mwa') {
    const deadline = new Date(start.getFullYear(), start.getMonth() + period, 28);
    const payoutDate = new Date(deadline.getFullYear(), deadline.getMonth() + 1, 1);
    return { deadline, payoutDate };
  }

  const firstFriday = nextOrSameFriday(start);
  const stepDays = group.frequencyId === 'kenzenn' ? 15 : 7;
  const deadline = new Date(firstFriday);
  deadline.setDate(deadline.getDate() + stepDays * period);
  const payoutDate = new Date(deadline);
  payoutDate.setDate(payoutDate.getDate() + 3); // Vandredi + 3 jou = Lendi

  return { deadline, payoutDate };
}

// Deside si peryòd `period` la gen tan rive (dat limit li deja pase),
// itil pou konnen si li lè pou admin ka "trete" peryòd sa a.
export function isPeriodDue(group, period) {
  const dates = getPeriodDates(group, period);
  if (!dates) return false;
  return new Date() >= dates.deadline;
}

// Foma yon dat senp an kreyòl pou afichaj (egzanp: "Vandredi 12 Sektanm").
export function formatHtDate(date) {
  const DAYS_HT = ['Dimanch', 'Lendi', 'Madi', 'Mèkredi', 'Jedi', 'Vandredi', 'Samdi'];
  return `${DAYS_HT[date.getDay()]} ${date.getDate()} ${MONTHS_HT[date.getMonth()]}`;
}
