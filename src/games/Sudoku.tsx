import { useEffect, useMemo, useRef, useState } from 'react';
import { shuffle, type RNG } from '../lib/rng';
import type { GameProps } from './types';

const N = 6; // blocs 2×3

const blockOf = (r: number, c: number) => Math.floor(r / 2) * 2 + Math.floor(c / 3);

function ok(g: number[], i: number, v: number): boolean {
  const r = Math.floor(i / N);
  const c = i % N;
  for (let k = 0; k < N; k++) {
    if (g[r * N + k] === v || g[k * N + c] === v) return false;
  }
  for (let rr = 0; rr < N; rr++)
    for (let cc = 0; cc < N; cc++)
      if (blockOf(rr, cc) === blockOf(r, c) && g[rr * N + cc] === v) return false;
  return true;
}

function countSolutions(g: number[], limit: number): number {
  const i = g.indexOf(0);
  if (i === -1) return 1;
  let n = 0;
  for (let v = 1; v <= N; v++) {
    if (ok(g, i, v)) {
      g[i] = v;
      n += countSolutions(g, limit - n);
      g[i] = 0;
      if (n >= limit) return n;
    }
  }
  return n;
}

export function generate(rng: RNG) {
  const sol = new Array(N * N).fill(0);
  const fill = (i: number): boolean => {
    if (i === N * N) return true;
    for (const v of shuffle(rng, [1, 2, 3, 4, 5, 6])) {
      if (ok(sol, i, v)) {
        sol[i] = v;
        if (fill(i + 1)) return true;
        sol[i] = 0;
      }
    }
    return false;
  };
  fill(0);

  // Retire des cases tant que la solution reste unique (~14 indices restants)
  const puzzle = sol.slice();
  for (const i of shuffle(rng, Array.from({ length: N * N }, (_, k) => k))) {
    if (puzzle.filter((v) => v !== 0).length <= 14) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle.slice(), 2) > 1) puzzle[i] = keep;
  }
  return { sol, puzzle };
}

export default function Sudoku({ rng, onAdjust, onDone }: GameProps) {
  const { sol, puzzle } = useMemo(() => generate(rng), [rng]);
  const [grid, setGrid] = useState<number[]>(puzzle.slice());
  const [sel, setSel] = useState<number>(puzzle.indexOf(0));
  const [wrong, setWrong] = useState<Set<number>>(() => new Set());
  const doneRef = useRef(false);

  // Valeurs déjà posées dans le bloc 2×3 de la case sélectionnée : on atténue
  // ces chiffres sur le pavé et on met en avant ceux qui restent à placer.
  const dansBloc = useMemo(() => {
    const s = new Set<number>();
    if (sel < 0) return s;
    const b = blockOf(Math.floor(sel / N), sel % N);
    grid.forEach((v, i) => {
      if (v !== 0 && blockOf(Math.floor(i / N), i % N) === b) s.add(v);
    });
    return s;
  }, [grid, sel]);

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
      if (/^[1-6]$/.test(e.key)) setVal(Number(e.key));
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
      <div className="cellgrid sudoku-grid" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
        {grid.map((v, i) => {
          const r = Math.floor(i / N);
          const c = i % N;
          return (
            <div
              key={i}
              className={`cell${puzzle[i] !== 0 ? ' given' : ''}${sel === i ? ' sel' : ''}${
                c === 2 ? ' bR' : ''
              }${r === 1 || r === 3 ? ' bB' : ''}${wrong.has(i) ? ' error' : ''}`}
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
        {[1, 2, 3, 4, 5, 6].map((v) => (
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
