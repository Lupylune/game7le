import { useEffect, useMemo, useRef, useState } from 'react';
import type { RNG } from '../lib/rng';
import type { GameProps } from './types';

const N = 6;
type Cons = Map<string, 'e' | 'd'>; // '=' ou '×' entre deux cases adjacentes

const SYM = ['★', '●'];

function ok(g: number[], i: number, v: number, cons: Cons): boolean {
  const r = Math.floor(i / N);
  const c = i % N;
  // 3 max par ligne/colonne
  let rowCount = 0;
  let colCount = 0;
  for (let k = 0; k < N; k++) {
    if (g[r * N + k] === v && k !== c) rowCount++;
    if (g[k * N + c] === v && k !== r) colCount++;
  }
  if (rowCount >= 3 || colCount >= 3) return false;
  // pas 3 identiques consécutifs
  const at = (rr: number, cc: number) =>
    rr === r && cc === c ? v : rr < 0 || rr >= N || cc < 0 || cc >= N ? -1 : g[rr * N + cc];
  for (let k = c - 2; k <= c; k++)
    if (k >= 0 && k + 2 < N && at(r, k) === v && at(r, k + 1) === v && at(r, k + 2) === v) return false;
  for (let k = r - 2; k <= r; k++)
    if (k >= 0 && k + 2 < N && at(k, c) === v && at(k + 1, c) === v && at(k + 2, c) === v) return false;
  // contraintes = / ×
  const pairs: [string, number, number][] = [
    [`${r},${c - 1},h`, r, c - 1],
    [`${r},${c},h`, r, c + 1],
    [`${r - 1},${c},v`, r - 1, c],
    [`${r},${c},v`, r + 1, c],
  ];
  for (const [key, rr, cc] of pairs) {
    const t = cons.get(key);
    if (!t) continue;
    const other = rr < 0 || rr >= N || cc < 0 || cc >= N ? -1 : g[rr * N + cc];
    if (other === -1) continue;
    if (t === 'e' && other !== v) return false;
    if (t === 'd' && other === v) return false;
  }
  return true;
}

function countSolutions(g: number[], cons: Cons, limit: number): number {
  const i = g.indexOf(-1);
  if (i === -1) return 1;
  let n = 0;
  for (const v of [0, 1]) {
    if (ok(g, i, v, cons)) {
      g[i] = v;
      n += countSolutions(g, cons, limit - n);
      g[i] = -1;
      if (n >= limit) return n;
    }
  }
  return n;
}

export function generate(rng: RNG) {
  // 1. Grille solution complète
  const sol = new Array(N * N).fill(-1);
  const fill = (i: number): boolean => {
    if (i === N * N) return true;
    const order = rng() < 0.5 ? [0, 1] : [1, 0];
    for (const v of order) {
      if (ok(sol, i, v, new Map())) {
        sol[i] = v;
        if (fill(i + 1)) return true;
        sol[i] = -1;
      }
    }
    return false;
  };
  fill(0);

  // 2. Contraintes et cases pré-remplies, ajoutées jusqu'à unicité
  const cons: Cons = new Map();
  const givens = new Set<number>();
  const allEdges: [string, number, number][] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      if (c + 1 < N) allEdges.push([`${r},${c},h`, r * N + c, r * N + c + 1]);
      if (r + 1 < N) allEdges.push([`${r},${c},v`, r * N + c, (r + 1) * N + c]);
    }
  // quelques contraintes de départ
  for (let k = 0; k < 8; k++) {
    const [key, a, b] = allEdges[Math.floor(rng() * allEdges.length)];
    cons.set(key, sol[a] === sol[b] ? 'e' : 'd');
  }
  for (let k = 0; k < 4; k++) givens.add(Math.floor(rng() * (N * N)));

  const puzzleOf = () => {
    const g = new Array(N * N).fill(-1);
    for (const i of givens) g[i] = sol[i];
    return g;
  };
  let guard = 0;
  while (countSolutions(puzzleOf(), cons, 2) > 1 && guard++ < 40) {
    if (rng() < 0.5) {
      const [key, a, b] = allEdges[Math.floor(rng() * allEdges.length)];
      cons.set(key, sol[a] === sol[b] ? 'e' : 'd');
    } else {
      givens.add(Math.floor(rng() * (N * N)));
    }
  }
  return { sol, cons, givens, start: puzzleOf() };
}

export default function Paire({ rng, onAdjust, onDone }: GameProps) {
  const { sol, cons, givens, start } = useMemo(() => generate(rng), [rng]);
  const [grid, setGrid] = useState<number[]>(start);
  const [wrong, setWrong] = useState<Set<number>>(() => new Set());
  const doneRef = useRef(false);

  function cycle(i: number) {
    if (givens.has(i)) return;
    setGrid((g) => {
      const n = g.slice();
      n[i] = n[i] === -1 ? 0 : n[i] === 0 ? 1 : -1;
      return n;
    });
  }

  useEffect(() => {
    if (doneRef.current || grid.includes(-1)) return;
    // grille pleine : valide ssi identique à la solution (unique)
    if (grid.every((v, i) => v === sol[i])) {
      doneRef.current = true;
      setTimeout(() => onDone({ adjustMs: -10000, detail: 'résolu', status: 'success' }), 400);
    }
  }, [grid, sol, onDone]);

  function verifier() {
    onAdjust(5000, 'Vérification');
    const w = new Set<number>();
    grid.forEach((v, i) => {
      if (v !== -1 && !givens.has(i) && v !== sol[i]) w.add(i);
    });
    setWrong(w);
    setTimeout(() => setWrong(new Set()), 2000);
  }

  return (
    <div className="game-area">
      <div className="cellgrid paire-grid" style={{ gridTemplateColumns: `repeat(${N}, 1fr)`, overflow: 'visible' }}>
        {grid.map((v, i) => {
          const r = Math.floor(i / N);
          const c = i % N;
          const right = cons.get(`${r},${c},h`);
          const bottom = cons.get(`${r},${c},v`);
          return (
            <div
              key={i}
              className={`cell${givens.has(i) ? ' given' : ''}${wrong.has(i) ? ' error' : ''}`}
              onClick={() => cycle(i)}
              style={{ overflow: 'visible' }}
            >
              {v !== -1 &&
                (givens.has(i) ? (
                  <span className={`paire-sym ${v === 0 ? 'star' : 'circle'}`}>{SYM[v]}</span>
                ) : (
                  <span className={`cell-pop paire-sym ${v === 0 ? 'star' : 'circle'}`} key={v}>
                    {SYM[v]}
                  </span>
                ))}
              {right && <span className="paire-mark right">{right === 'e' ? '=' : '×'}</span>}
              {bottom && <span className="paire-mark bottom">{bottom === 'e' ? '=' : '×'}</span>}
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Clic sur une case : vide → ★ → ● → vide
      </p>
      <div className="game-actions">
        <button className="btn btn-sm" onClick={verifier}>
          Vérifier (+5 s)
        </button>
      </div>
    </div>
  );
}
