import { useEffect, useMemo, useRef, useState } from 'react';
import { shuffle, type RNG } from '../lib/rng';
import { SymCouronne } from '../components/GameIcon';
import type { GameProps } from './types';

const N = 6;

/** Compte les placements valides (1 reine par ligne, colonne, région ; jamais adjacentes). */
function countSolutions(regions: number[], limit: number): number {
  let count = 0;
  const perm: number[] = [];
  const usedCol = new Array(N).fill(false);
  const usedReg = new Array(N).fill(false);
  const rec = (r: number) => {
    if (count >= limit) return;
    if (r === N) {
      count++;
      return;
    }
    for (let c = 0; c < N; c++) {
      const reg = regions[r * N + c];
      if (usedCol[c] || usedReg[reg]) continue;
      if (r > 0 && Math.abs(perm[r - 1] - c) <= 1) continue;
      perm[r] = c;
      usedCol[c] = true;
      usedReg[reg] = true;
      rec(r + 1);
      usedCol[c] = false;
      usedReg[reg] = false;
    }
  };
  rec(0);
  return count;
}

/**
 * Tailles cibles très déséquilibrées : des régions équilibrées ne donnent
 * pratiquement jamais de solution unique (0 % mesuré) ; avec 2 petites régions
 * qui « épinglent » leurs reines, ~10 % des tirages sont uniques.
 */
function targetSizes(rng: RNG): number[] {
  const sizes = [
    1 + Math.floor(rng() * 2),
    1 + Math.floor(rng() * 2),
    3 + Math.floor(rng() * 4),
    3 + Math.floor(rng() * 4),
  ];
  const rest = N * N - sizes.reduce((a, b) => a + b, 0);
  const g1 = Math.max(1, Math.floor(rest / 2) + Math.floor(rng() * 3) - 1);
  sizes.push(g1, Math.max(1, rest - g1));
  return shuffle(rng, sizes);
}

export function generate(rng: RNG) {
  for (let attempt = 0; attempt < 300; attempt++) {
    // Placement des reines : permutation sans adjacence diagonale entre lignes voisines
    let perm: number[] | null = null;
    for (let t = 0; t < 500 && !perm; t++) {
      const p = shuffle(rng, [0, 1, 2, 3, 4, 5]);
      if (p.every((c, r) => r === 0 || Math.abs(c - p[r - 1]) >= 2)) perm = p;
    }
    if (!perm) continue;

    // Croissance de régions contiguës depuis chaque reine, bornées par leur taille
    // cible tant que possible, puis débordement libre pour remplir la grille
    const targets = targetSizes(rng);
    const regions = new Array(N * N).fill(-1);
    const frontier: number[][] = [];
    perm.forEach((c, r) => {
      regions[r * N + c] = r;
      frontier.push([r * N + c]);
    });
    let remaining = N * N - N;
    let overflow = false;
    let stuck = 0;
    while (remaining > 0 && stuck < 3) {
      const order = shuffle(rng, Array.from({ length: N }, (_, k) => k));
      let grew = false;
      for (const reg of order) {
        if (!overflow && frontier[reg].length >= targets[reg]) continue;
        const cands: number[] = [];
        for (const cell of frontier[reg]) {
          const r = Math.floor(cell / N);
          const c = cell % N;
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < N && nc >= 0 && nc < N && regions[nr * N + nc] === -1)
              cands.push(nr * N + nc);
          }
        }
        if (cands.length === 0) continue;
        const cell = cands[Math.floor(rng() * cands.length)];
        regions[cell] = reg;
        frontier[reg].push(cell);
        remaining--;
        grew = true;
        if (remaining === 0) break;
      }
      if (!grew) {
        if (!overflow) overflow = true;
        else stuck++;
      } else if (!overflow && frontier.every((f, i) => f.length >= targets[i])) {
        overflow = true;
      }
    }
    if (remaining > 0) continue;
    if (countSolutions(regions, 2) === 1) {
      const sol = new Set(perm.map((c, r) => r * N + c));
      return { regions, sol };
    }
  }
  // Secours improbable : grille fixe valide (régions = colonnes)
  const perm = [0, 2, 4, 1, 5, 3];
  const regions = Array.from({ length: N * N }, (_, i) => i % N);
  return { regions, sol: new Set(perm.map((c, r) => r * N + c)) };
}

export default function Reines({ rng, onAdjust, onDone }: GameProps) {
  const { regions, sol } = useMemo(() => generate(rng), [rng]);
  // 0 = vide, 1 = croix, 2 = reine
  const [grid, setGrid] = useState<number[]>(() => new Array(N * N).fill(0));
  const [revealed, setRevealed] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    const queens = grid.flatMap((v, i) => (v === 2 ? [i] : []));
    if (queens.length !== N) return;
    const okAll = queens.every((i) => sol.has(i));
    if (okAll) {
      doneRef.current = true;
      setTimeout(
        () =>
          onDone(
            revealed
              ? { adjustMs: 0, detail: 'résolu (avec révélation)', status: 'success' }
              : { adjustMs: -5000, detail: 'résolu', status: 'success' },
          ),
        400,
      );
    }
  }, [grid, sol, revealed, onDone]);

  return (
    <div className="game-area">
      <div className="cellgrid queens-grid" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
        {grid.map((v, i) => (
          <div
            key={i}
            className="cell"
            style={{
              background: `color-mix(in srgb, var(--queens-r${regions[i] + 1}) 55%, var(--bg))`,
            }}
            onClick={() =>
              setGrid((g) => {
                const n = g.slice();
                // cycle : vide → reine → croix → vide
                n[i] = n[i] === 0 ? 2 : n[i] === 2 ? 1 : 0;
                return n;
              })
            }
          >
            {v !== 0 && (
              <span className="cell-pop" key={v}>
                {v === 1 ? '×' : <SymCouronne />}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Une reine par ligne, colonne et région colorée · jamais deux reines qui se touchent (même
        en diagonale) · clic : vide → reine → croix → vide
      </p>
      <div className="game-actions">
        <button
          className="btn btn-sm"
          onClick={() => {
            onAdjust(30000, 'Solution révélée');
            setRevealed(true);
            setGrid(Array.from({ length: N * N }, (_, i) => (sol.has(i) ? 2 : 0)));
          }}
        >
          Révéler (+30 s)
        </button>
      </div>
    </div>
  );
}
