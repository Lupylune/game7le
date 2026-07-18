import { useEffect, useMemo, useRef, useState } from 'react';
import { shuffle, type RNG } from '../lib/rng';
import type { GameProps } from './types';

/** Géométrie : 6×6 en blocs 2×3 (quotidien) ou 9×9 en blocs 3×3 (défi difficile). */
interface Geo {
  N: number;
  br: number; // lignes par bloc
  bc: number; // colonnes par bloc
  indices: number; // nombre d'indices visé au creusage
}
const GEO_NORMAL: Geo = { N: 6, br: 2, bc: 3, indices: 14 };
const GEO_DIFFICILE: Geo = { N: 9, br: 3, bc: 3, indices: 28 };

const blockOf = (geo: Geo, r: number, c: number) =>
  Math.floor(r / geo.br) * geo.br + Math.floor(c / geo.bc);

function ok(geo: Geo, g: number[], i: number, v: number): boolean {
  const { N } = geo;
  const r = Math.floor(i / N);
  const c = i % N;
  for (let k = 0; k < N; k++) {
    if (g[r * N + k] === v || g[k * N + c] === v) return false;
  }
  for (let rr = 0; rr < N; rr++)
    for (let cc = 0; cc < N; cc++)
      if (blockOf(geo, rr, cc) === blockOf(geo, r, c) && g[rr * N + cc] === v) return false;
  return true;
}

function countSolutions(geo: Geo, g: number[], limit: number): number {
  const i = g.indexOf(0);
  if (i === -1) return 1;
  let n = 0;
  for (let v = 1; v <= geo.N; v++) {
    if (ok(geo, g, i, v)) {
      g[i] = v;
      n += countSolutions(geo, g, limit - n);
      g[i] = 0;
      if (n >= limit) return n;
    }
  }
  return n;
}

export function generate(rng: RNG, difficile = false) {
  const geo = difficile ? GEO_DIFFICILE : GEO_NORMAL;
  const { N } = geo;
  const vals = Array.from({ length: N }, (_, k) => k + 1);
  const sol = new Array(N * N).fill(0);
  const fill = (i: number): boolean => {
    if (i === N * N) return true;
    for (const v of shuffle(rng, vals)) {
      if (ok(geo, sol, i, v)) {
        sol[i] = v;
        if (fill(i + 1)) return true;
        sol[i] = 0;
      }
    }
    return false;
  };
  fill(0);

  // Retire des cases tant que la solution reste unique (14 indices en 6×6,
  // 28 en 9×9 — proportionnellement moins que le quotidien)
  const puzzle = sol.slice();
  for (const i of shuffle(rng, Array.from({ length: N * N }, (_, k) => k))) {
    if (puzzle.filter((v) => v !== 0).length <= geo.indices) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(geo, puzzle.slice(), 2) > 1) puzzle[i] = keep;
  }
  return { geo, sol, puzzle };
}

export default function Sudoku({ rng, difficile, onAdjust, onDone }: GameProps) {
  const { geo, sol, puzzle } = useMemo(() => generate(rng, difficile), [rng, difficile]);
  const { N } = geo;
  const [grid, setGrid] = useState<number[]>(puzzle.slice());
  const [sel, setSel] = useState<number>(puzzle.indexOf(0));
  const [wrong, setWrong] = useState<Set<number>>(() => new Set());
  const doneRef = useRef(false);

  // Valeurs déjà posées dans le bloc de la case sélectionnée : on atténue
  // ces chiffres sur le pavé et on met en avant ceux qui restent à placer.
  const dansBloc = useMemo(() => {
    const s = new Set<number>();
    if (sel < 0) return s;
    const b = blockOf(geo, Math.floor(sel / N), sel % N);
    grid.forEach((v, i) => {
      if (v !== 0 && blockOf(geo, Math.floor(i / N), i % N) === b) s.add(v);
    });
    return s;
  }, [grid, sel, geo, N]);

  function setVal(v: number) {
    if (sel < 0 || puzzle[sel] !== 0) return;
    setGrid((g) => {
      const n = g.slice();
      n[sel] = v;
      return n;
    });
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (new RegExp(`^[1-${N}]$`).test(e.key)) setVal(Number(e.key));
      else if (e.key === 'Backspace' || e.key === '0' || e.key === 'Delete') setVal(0);
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        setSel((s) => {
          const r = Math.floor(s / N);
          const c = s % N;
          if (e.key === 'ArrowRight' && c < N - 1) return s + 1;
          if (e.key === 'ArrowLeft' && c > 0) return s - 1;
          if (e.key === 'ArrowDown' && r < N - 1) return s + N;
          if (e.key === 'ArrowUp' && r > 0) return s - N;
          return s;
        });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, puzzle]);

  useEffect(() => {
    if (doneRef.current || grid.includes(0)) return;
    if (grid.every((v, i) => v === sol[i])) {
      doneRef.current = true;
      setTimeout(() => onDone({ adjustMs: -10000, detail: 'résolu', status: 'success' }), 400);
    }
  }, [grid, sol, onDone]);

  function verifier() {
    onAdjust(5000, 'Vérification');
    const w = new Set<number>();
    grid.forEach((v, i) => {
      if (v !== 0 && puzzle[i] === 0 && v !== sol[i]) w.add(i);
    });
    setWrong(w);
    setTimeout(() => setWrong(new Set()), 2000);
  }

  return (
    <div className="game-area">
      <div
        className={`cellgrid sudoku-grid${N === 9 ? ' n9' : ''}`}
        style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}
      >
        {grid.map((v, i) => {
          const r = Math.floor(i / N);
          const c = i % N;
          return (
            <div
              key={i}
              className={`cell${puzzle[i] !== 0 ? ' given' : ''}${sel === i ? ' sel' : ''}${
                (c + 1) % geo.bc === 0 && c < N - 1 ? ' bR' : ''
              }${(r + 1) % geo.br === 0 && r < N - 1 ? ' bB' : ''}${wrong.has(i) ? ' error' : ''}`}
              onClick={() => setSel(i)}
            >
              {v !== 0 &&
                (puzzle[i] !== 0 ? (
                  v
                ) : (
                  <span className="cell-pop" key={v}>
                    {v}
                  </span>
                ))}
            </div>
          );
        })}
      </div>
      <div className="numpad">
        {Array.from({ length: N }, (_, k) => k + 1).map((v) => (
          <button
            key={v}
            className={sel >= 0 ? (dansBloc.has(v) ? 'deja' : 'dispo') : ''}
            onClick={() => setVal(v)}
          >
            {v}
          </button>
        ))}
        <button onClick={() => setVal(0)}>⌫</button>
      </div>
      <div className="game-actions">
        <button className="btn btn-sm" onClick={verifier}>
          Vérifier (+5 s)
        </button>
      </div>
    </div>
  );
}
