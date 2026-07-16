import { seededRng, randInt, shuffle } from './rng';

export interface Entry {
  pseudo: string;
  ms: number;
  badge?: string;
  flawless?: boolean;
  me?: boolean;
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
export function classementSimule(date: string, n = 5): { entries: Entry[]; avgMs: number; runs: number } {
  const rng = seededRng(`game7le:${date}:classement`);
  const noms = shuffle(rng, PSEUDOS).slice(0, n);
  let ms = randInt(rng, 85000, 120000);
  const entries: Entry[] = noms.map((pseudo, i) => {
    const e: Entry = {
      pseudo,
      ms,
      badge: rng() < 0.3 ? '🌟' : undefined,
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
