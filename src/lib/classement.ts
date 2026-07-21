import { seededRng, randInt, shuffle } from './rng';
import type { GameLine } from './storage';
import { supabase } from './supabase';

export interface Entry {
  pseudo: string;
  ms: number;
  badge?: string;
  flawless?: boolean;
  me?: boolean;
  /** Nombre de jours joués (classement hebdomadaire uniquement). */
  jours?: number;
  /** Splits par mini-jeu (runs réels uniquement — absent pour le peloton simulé). */
  lines?: GameLine[];
}

export interface Board {
  entries: Entry[];
  avgMs: number;
  runs: number;
  /** `true` si `entries` vient de vrais runs Supabase, `false` si c'est le peloton simulé de secours. */
  reel: boolean;
}

interface RunReel {
  pseudo: string;
  total_ms: number;
  flawless: boolean;
  lines: GameLine[];
}

async function fetchRunsReels(date: string, defi = false): Promise<RunReel[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('runs')
    .select('pseudo, total_ms, flawless, lines')
    .eq('date', date)
    .eq('en_direct', true)
    .eq('defi', defi)
    .order('total_ms', { ascending: true });
  if (error || !data) return null;
  return data as RunReel[];
}

/**
 * Classement réel du jour (Supabase) tronqué à `n` entrées, avec repli sur le
 * peloton simulé uniquement si le backend est absent ou injoignable. Un jour
 * sans aucun run renvoie un classement réel vide (`reel: true`, `runs: 0`) :
 * à l'UI d'afficher « personne n'a encore couru ».
 */
export async function classementJour(date: string, n = 15): Promise<Board> {
  const reel = await fetchRunsReels(date);
  if (reel) {
    return {
      entries: reel
        .slice(0, n)
        .map((r) => ({ pseudo: r.pseudo, ms: r.total_ms, flawless: r.flawless, lines: r.lines })),
      avgMs: reel.length > 0 ? reel.reduce((s, r) => s + r.total_ms, 0) / reel.length : 0,
      runs: reel.length,
      reel: true,
    };
  }
  return { ...classementSimule(date, n), reel: false };
}

/**
 * Classement du défi difficile de la semaine (identifiée par son lundi) :
 * runs `defi` joués en direct, classés au temps. Repli sur un peloton simulé
 * si le backend est absent ou injoignable.
 */
export async function classementDefi(lundi: string, n = 15): Promise<Board> {
  const reel = await fetchRunsReels(lundi, true);
  if (reel) {
    return {
      entries: reel
        .slice(0, n)
        .map((r) => ({ pseudo: r.pseudo, ms: r.total_ms, flawless: r.flawless, lines: r.lines })),
      avgMs: reel.length > 0 ? reel.reduce((s, r) => s + r.total_ms, 0) / reel.length : 0,
      runs: reel.length,
      reel: true,
    };
  }
  return { ...classementDefiSimule(lundi, n), reel: false };
}

/**
 * Peloton fictif du défi difficile (démo hors-ligne) : déterministe par
 * semaine, temps plus lents que le quotidien (épreuves corsées).
 */
export function classementDefiSimule(
  lundi: string,
  n = 5,
): { entries: Entry[]; avgMs: number; runs: number } {
  const rng = seededRng(`game7le:defi:${lundi}:classement`);
  const noms = shuffle(rng, PSEUDOS).slice(0, n);
  let ms = randInt(rng, 220000, 320000);
  const entries: Entry[] = noms.map((pseudo, i) => {
    const e: Entry = {
      pseudo,
      ms,
      badge: rng() < 0.3 ? '★' : undefined,
      flawless: ms < 300000 && rng() < 0.1,
    };
    ms += randInt(rng, 8000, i < 2 ? 45000 : 80000);
    return e;
  });
  return {
    entries,
    avgMs: randInt(rng, 15 * 60000, 25 * 60000),
    runs: randInt(rng, 150, 600),
  };
}

/**
 * Les 7 dates (AAAA-MM-JJ) de la semaine calendaire (lundi→dimanche) contenant
 * `date`. Arithmétique en UTC : indépendante du fuseau du navigateur.
 */
function datesSemaine(date: string): string[] {
  const [y, m, d] = date.split('-').map(Number);
  const depuisLundi = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lundi … 6 = dimanche
  const out: string[] = [];
  for (let i = 0; i < 7; i++)
    out.push(new Date(Date.UTC(y, m - 1, d - depuisLundi + i)).toISOString().slice(0, 10));
  return out;
}

interface RunSemaine {
  pseudo: string;
  total_ms: number;
  flawless: boolean;
}

/**
 * Classement de la semaine calendaire (lundi→dimanche) contenant `date` : on
 * moyenne le temps des runs joués en direct de chaque pseudo, classés d'abord
 * par nombre de jours joués (régularité), puis par temps moyen croissant.
 * Repli sur un peloton simulé si le backend est absent/injoignable.
 */
export async function classementSemaine(date: string, n = 5): Promise<Board> {
  const dates = datesSemaine(date);
  if (supabase) {
    const { data, error } = await supabase
      .from('runs')
      .select('pseudo, total_ms, flawless')
      .eq('en_direct', true)
      .eq('defi', false)
      .in('date', dates);
    if (!error && data) {
      // en_direct est unique par (pseudo, date) : on peut cumuler sans dédoublonner.
      const agg = new Map<string, { total: number; jours: number; flawless: number }>();
      for (const r of data as RunSemaine[]) {
        const a = agg.get(r.pseudo) ?? { total: 0, jours: 0, flawless: 0 };
        a.total += r.total_ms;
        a.jours += 1;
        if (r.flawless) a.flawless += 1;
        agg.set(r.pseudo, a);
      }
      const entries: Entry[] = [...agg.entries()]
        .map(([pseudo, a]) => ({
          pseudo,
          ms: a.total / a.jours,
          jours: a.jours,
          flawless: a.jours > 0 && a.flawless === a.jours,
        }))
        .sort((x, y) => (y.jours! - x.jours!) || (x.ms - y.ms))
        .slice(0, n);
      return {
        entries,
        avgMs:
          agg.size > 0
            ? [...agg.values()].reduce((s, a) => s + a.total / a.jours, 0) / agg.size
            : 0,
        runs: data.length,
        reel: true,
      };
    }
  }
  return { ...classementSemaineSimule(date, n), reel: false };
}

/**
 * Peloton hebdomadaire fictif mais déterministe (démo hors-ligne, pas de serveur).
 * Seed sur le lundi de la semaine : le faux top reste stable du lundi au dimanche.
 */
export function classementSemaineSimule(
  date: string,
  n = 5,
): { entries: Entry[]; avgMs: number; runs: number } {
  const rng = seededRng(`game7le:semaine:${datesSemaine(date)[0]}`);
  const noms = shuffle(rng, PSEUDOS).slice(0, n);
  let ms = randInt(rng, 85000, 105000);
  const entries: Entry[] = noms.map((pseudo, i) => {
    const e: Entry = {
      pseudo,
      ms,
      jours: i < 3 ? 7 : 6,
      badge: rng() < 0.3 ? '★' : undefined,
      flawless: rng() < 0.12,
    };
    ms += randInt(rng, 3000, i < 2 ? 8000 : 15000);
    return e;
  });
  return {
    entries,
    avgMs: randInt(rng, 8 * 60000, 11 * 60000),
    runs: randInt(rng, 3000, 9000),
  };
}

/**
 * Rangs réels d'un pseudo pour un ensemble de dates : position de son temps
 * parmi les runs Supabase joués en direct ce jour-là (les archives rejouées
 * après coup sont exclues). `null` si le backend est absent/injoignable ;
 * les dates où le pseudo n'a pas de run synchronisé sont omises du résultat.
 */
export async function rangsReels(
  pseudo: string,
  dates: string[],
): Promise<Record<string, { rang: number; total: number }> | null> {
  if (!supabase || dates.length === 0) return null;
  const { data, error } = await supabase
    .from('runs')
    .select('pseudo, date, total_ms')
    .eq('en_direct', true)
    .eq('defi', false)
    .in('date', dates);
  if (error || !data) return null;
  const out: Record<string, { rang: number; total: number }> = {};
  for (const date of dates) {
    const jour = data.filter((r) => r.date === date);
    const moi = jour.find((r) => r.pseudo === pseudo);
    if (!moi) continue;
    out[date] = {
      rang: 1 + jour.filter((r) => r.total_ms < moi.total_ms).length,
      total: jour.length,
    };
  }
  return out;
}

const PSEUDOS = [
  'Zorglub', 'LaFouine77', 'PixelBreton', 'Mamie Turbo', 'K4ss0s', 'ChronoLapin', 'DrPuzzle',
  'Titi_du_93', 'GrillePain', 'LeVraiJean', 'Moustache', 'Croissant', 'NuitBlanche', 'TontonFlex',
  'Escargot2000', 'MlleVite', 'CafésSerrés', 'BaguetteMagique', 'RoiDuSkip', 'PtitBiscuit',
];

/**
 * Classement fictif mais déterministe par jour (démo hors-ligne, pas de serveur).
 * Tout le monde voit le même faux top du jour.
 */
/**
 * Rang estimé d'un temps dans le peloton simulé du jour : exact dans le top 5,
 * puis interpolation monotone entre le 5e temps et la moyenne du jour.
 */
export function rangEstime(date: string, ms: number): number {
  const { entries, avgMs, runs } = classementSimule(date, 5);
  const idx = entries.findIndex((e) => ms <= e.ms);
  if (idx !== -1) return idx + 1;
  const p = ms / (ms + avgMs); // 0 → 0, moyenne → 0,5, lent → 1
  return Math.max(6, Math.min(runs, Math.round(p * runs)));
}

export function classementSimule(date: string, n = 5): { entries: Entry[]; avgMs: number; runs: number } {
  const rng = seededRng(`game7le:${date}:classement`);
  const noms = shuffle(rng, PSEUDOS).slice(0, n);
  let ms = randInt(rng, 85000, 120000);
  const entries: Entry[] = noms.map((pseudo, i) => {
    const e: Entry = {
      pseudo,
      ms,
      badge: rng() < 0.3 ? '★' : undefined, // rendu en SVG (SymEtoile) côté UI
      flawless: ms < 150000 && rng() < 0.25,
    };
    ms += randInt(rng, 4000, i < 2 ? 25000 : 45000);
    return e;
  });
  return {
    entries,
    avgMs: randInt(rng, 8 * 60000, 13 * 60000),
    runs: randInt(rng, 700, 2100),
  };
}
