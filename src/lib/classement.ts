import { seededRng, randInt, shuffle } from './rng';
import type { GameLine } from './storage';
import { supabase } from './supabase';

export interface Entry {
  pseudo: string;
  ms: number;
  badge?: string;
  flawless?: boolean;
  me?: boolean;
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

async function fetchRunsReels(date: string): Promise<RunReel[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('runs')
    .select('pseudo, total_ms, flawless, lines')
    .eq('date', date)
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
