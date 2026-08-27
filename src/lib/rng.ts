export type RNG = () => number;

/** Hash d'une chaîne vers un entier 32 bits (xmur3). */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** PRNG déterministe mulberry32. */
function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG seedé par une chaîne (ex. `2026-07-13:sudoku`). Tout le monde a la même grille. */
export function seededRng(seed: string): RNG {
  return mulberry32(xmur3(seed)());
}

export function randInt(rng: RNG, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: RNG, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle<T>(rng: RNG, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ouverture du jeu : premier jour jouable, borne basse des archives. */
export const LANCEMENT = '2026-07-01';

/** Date locale au format YYYY-MM-DD. */
const fmtParis = new Intl.DateTimeFormat('fr-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Jour du défi (AAAA-MM-JJ) pour un instant donné, évalué en Europe/Paris :
 * le nouveau défi apparaît à minuit heure de Paris pour tout le monde, quel
 * que soit le fuseau du navigateur (même règle que `submit_run()` côté
 * serveur pour le flag « en direct »).
 */
export function todayStr(d = new Date()): string {
  return fmtParis.format(d);
}

/**
 * Lundi (AAAA-MM-JJ) de la semaine calendaire contenant `date` — identifiant
 * du défi hebdomadaire difficile. Arithmétique en UTC sur la date déjà
 * exprimée en Europe/Paris : indépendante du fuseau du navigateur.
 */
export function lundiStr(date = todayStr()): string {
  const [y, m, d] = date.split('-').map(Number);
  const depuisLundi = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lundi
  return new Date(Date.UTC(y, m - 1, d - depuisLundi)).toISOString().slice(0, 10);
}

/** Date AAAA-MM-JJ décalée de `n` jours (arithmétique en UTC, indép. du fuseau). */
export function ajouteJours(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const fmtParisComplet = new Intl.DateTimeFormat('fr-CA', {
  timeZone: 'Europe/Paris',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Décalage Europe/Paris − UTC, en ms, à l'instant `t`. */
function decalageParis(t: number): number {
  const p: Record<string, string> = {};
  for (const { type, value } of fmtParisComplet.formatToParts(t)) p[type] = value;
  const mur = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return mur - Math.floor(t / 1000) * 1000;
}

/**
 * Instant (epoch ms) où commence le jour `AAAA-MM-JJ` : minuit heure de Paris,
 * la seconde où son tirage devient jouable pour tout le monde. Le décalage
 * horaire est résolu par point fixe (deux passes) — le décalage qui compte est
 * celui qui vaut *à* minuit, pas à l'instant nominal : les deux diffèrent la
 * nuit d'un changement d'heure, où la journée fait 23 ou 25 heures.
 */
export function minuitParis(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const nominal = Date.UTC(y, m - 1, d);
  return nominal - decalageParis(nominal - decalageParis(nominal));
}

/** Instant du prochain tirage quotidien (minuit à Paris) après `date`. */
export function prochainTirage(date = todayStr()): number {
  return minuitParis(ajouteJours(date, 1));
}
