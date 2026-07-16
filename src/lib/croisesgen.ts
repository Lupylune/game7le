import { pick, shuffle, type RNG } from './rng';
import { CROISES5 } from '../data/lexique';
import { DEFS5 } from '../data/definitions';
import type { Croise } from '../data/croises';

/**
 * Génère une mini-grille 5×5 à motif variable. Le lexique indicé ne contenant
 * que des mots de 5 lettres, chaque mot occupe une ligne ou une colonne
 * entière ; le motif est le choix des lignes et colonnes porteuses. Pour
 * qu'aucune suite parasite de 2+ cases n'apparaisse, les lignes choisies ne
 * doivent pas être adjacentes entre elles (idem pour les colonnes) — ce qui
 * laisse 7 × 7 combinaisons, de 4 à 6 mots par grille.
 * Pool : lemmes fréquents de Lexique 3.83 ayant une définition Wiktionnaire.
 */

const POOL = CROISES5.map((p) => p.split(':')[0]).filter((w) => DEFS5.has(w));

/** Sous-ensembles de {0..4} sans éléments adjacents (taille 2 ou 3). */
const SOUS_ENSEMBLES = [
  [0, 2, 4],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 3],
  [1, 4],
  [2, 4],
];

interface Slot {
  dir: 'h' | 'v';
  i: number; // index de ligne (h) ou de colonne (v)
}

function tryFill(rng: RNG, R: number[], C: number[]): Croise | null {
  // Lignes et colonnes entrelacées : chaque pose contraint la suivante au plus tôt
  const slots: Slot[] = [];
  const hs: Slot[] = R.map((r) => ({ dir: 'h' as const, i: r }));
  const vs: Slot[] = C.map((c) => ({ dir: 'v' as const, i: c }));
  for (let k = 0; k < Math.max(hs.length, vs.length); k++) {
    if (hs[k]) slots.push(hs[k]);
    if (vs[k]) slots.push(vs[k]);
  }

  const lettres: string[][] = Array.from({ length: 5 }, () => new Array(5).fill(''));
  const mots = new Map<Slot, string>();
  const used = new Set<string>();
  let noeuds = 0;

  const cellsOf = (s: Slot): [number, number][] =>
    Array.from({ length: 5 }, (_, k) => (s.dir === 'h' ? [s.i, k] : [k, s.i]));

  const backtrack = (k: number): boolean => {
    if (k === slots.length) return true;
    if (++noeuds > 4000) return false;
    const slot = slots[k];
    const cells = cellsOf(slot);
    const motif = cells.map(([r, c]) => lettres[r][c]);
    const cands = shuffle(
      rng,
      POOL.filter((w) => !used.has(w) && motif.every((ch, j) => !ch || w[j] === ch)),
    ).slice(0, 30);
    for (const w of cands) {
      const prev = cells.map(([r, c]) => lettres[r][c]);
      cells.forEach(([r, c], j) => (lettres[r][c] = w[j]));
      used.add(w);
      mots.set(slot, w);
      if (backtrack(k + 1)) return true;
      used.delete(w);
      mots.delete(slot);
      cells.forEach(([r, c], j) => (lettres[r][c] = prev[j]));
    }
    return false;
  };

  if (!backtrack(0)) return null;

  const grille = Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) =>
      R.includes(r) || C.includes(c) ? lettres[r][c] : '#',
    ).join(''),
  );
  return {
    grille,
    horizontaux: R.map((r) => {
      const mot = mots.get(hs.find((s) => s.i === r)!)!;
      return { ligne: r, mot, indice: DEFS5.get(mot)! };
    }),
    verticaux: C.map((c) => {
      const mot = mots.get(vs.find((s) => s.i === c)!)!;
      return { col: c, mot, indice: DEFS5.get(mot)! };
    }),
  };
}

export function genCroise(rng: RNG): Croise | null {
  for (let attempt = 0; attempt < 25; attempt++) {
    const R = pick(rng, SOUS_ENSEMBLES);
    const C = pick(rng, SOUS_ENSEMBLES);
    const grille = tryFill(rng, R, C);
    if (grille) return grille;
  }
  return null;
}
