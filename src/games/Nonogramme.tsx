import { useEffect, useMemo, useRef, useState } from 'react';
import type { RNG } from '../lib/rng';
import type { GameProps } from './types';

const N_NORMAL = 8;
const N_DIFFICILE = 15;

function cluesOf(line: number[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const v of line) {
    if (v === 1) run++;
    else if (run) {
      out.push(run);
      run = 0;
    }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
}

/** Toutes les dispositions possibles d'une ligne pour un jeu d'indices donné. */
function placements(clue: number[], len: number): number[][] {
  if (clue.length === 1 && clue[0] === 0) return [new Array(len).fill(0)];
  const out: number[][] = [];
  const rec = (idx: number, pos: number, acc: number[]) => {
    if (idx === clue.length) {
      out.push([...acc, ...new Array(len - acc.length).fill(0)]);
      return;
    }
    const size = clue[idx];
    const restMin = clue.slice(idx + 1).reduce((a, b) => a + b + 1, 0);
    for (let p = pos; p + size + restMin <= len; p++) {
      const next = [...acc, ...new Array(p - acc.length).fill(0), ...new Array(size).fill(1)];
      if (idx < clue.length - 1) next.push(0);
      rec(idx + 1, next.length, next);
    }
  };
  rec(0, 0, []);
  return out;
}

/** Résolubilité par logique de lignes (intersection des dispositions). */
function lineSolvable(N: number, rows: number[][], cols: number[][]): boolean {
  const g = new Array(N * N).fill(-1);
  for (let iter = 0; iter < 40; iter++) {
    let progress = false;
    const applyLine = (cells: number[], clue: number[]) => {
      const cur = cells.map((i) => g[i]);
      const opts = placements(clue, N).filter((opt) => opt.every((v, k) => cur[k] === -1 || cur[k] === v));
      if (opts.length === 0) return;
      for (let k = 0; k < N; k++) {
        if (cur[k] !== -1) continue;
        const v = opts[0][k];
        if (opts.every((o) => o[k] === v)) {
          g[cells[k]] = v;
          progress = true;
        }
      }
    };
    for (let r = 0; r < N; r++) applyLine(Array.from({ length: N }, (_, c) => r * N + c), rows[r]);
    for (let c = 0; c < N; c++) applyLine(Array.from({ length: N }, (_, r) => r * N + c), cols[c]);
    if (!g.includes(-1)) return true;
    if (!progress) return false;
  }
  return false;
}

export function generate(rng: RNG, difficile = false) {
  const N = difficile ? N_DIFFICILE : N_NORMAL;
  for (let t = 0; t < 80; t++) {
    const pattern = Array.from({ length: N * N }, () => (rng() < 0.52 ? 1 : 0));
    const rows = Array.from({ length: N }, (_, r) =>
      cluesOf(pattern.slice(r * N, r * N + N)),
    );
    const cols = Array.from({ length: N }, (_, c) =>
      cluesOf(Array.from({ length: N }, (_, r) => pattern[r * N + c])),
    );
    if (lineSolvable(N, rows, cols)) return { N, pattern, rows, cols };
  }
  // Secours : damier (toujours résoluble ligne à ligne)
  const pattern = Array.from({ length: N * N }, (_, i) => (i % 2) as number);
  const rows = Array.from({ length: N }, (_, r) => cluesOf(pattern.slice(r * N, r * N + N)));
  const cols = Array.from({ length: N }, (_, c) =>
    cluesOf(Array.from({ length: N }, (_, r) => pattern[r * N + c])),
  );
  return { N, pattern, rows, cols };
}

export default function Nonogramme({ rng, difficile, onAdjust, onDone }: GameProps) {
  const { N, pattern, rows, cols } = useMemo(() => generate(rng, difficile), [rng, difficile]);
  // 0 = vide, 1 = rempli, 2 = croix
  const [grid, setGrid] = useState<number[]>(() => new Array(N * N).fill(0));
  // Grille 15×15 : cases plus petites pour tenir à l'écran
  const taille = difficile
    ? 'clamp(16px, 4.4vw, 26px)'
    : 'clamp(28px, 7vw, 36px)';
  const [wrong, setWrong] = useState<Set<number>>(() => new Set());
  const doneRef = useRef(false);

  // Indices barrés : un nombre est barré si, dans toutes les dispositions de la
  // ligne compatibles avec les cases posées (remplies/croix), son segment est
  // entièrement rempli par le joueur — il est donc acquis sans ambiguïté.
  const barres = useMemo(() => {
    const calc = (cells: number[], clue: number[]): boolean[] => {
      if (clue.length === 1 && clue[0] === 0) return [false];
      const cur = cells.map((i) => grid[i]);
      const opts = placements(clue, N).filter((opt) =>
        opt.every((v, k) => (cur[k] === 1 ? v === 1 : cur[k] === 2 ? v === 0 : true)),
      );
      if (opts.length === 0) return clue.map(() => false);
      // segments (listes d'indices) de chaque disposition
      const runs = opts.map((opt) => {
        const out: number[][] = [];
        let run: number[] | null = null;
        opt.forEach((v, k) => {
          if (v === 1) {
            if (!run) out.push((run = []));
            run.push(k);
          } else run = null;
        });
        return out;
      });
      return clue.map((_, ci) => runs.every((r) => r[ci].every((k) => cur[k] === 1)));
    };
    return {
      rows: rows.map((clue, r) => calc(Array.from({ length: N }, (_, c) => r * N + c), clue)),
      cols: cols.map((clue, c) => calc(Array.from({ length: N }, (_, r) => r * N + c), clue)),
    };
  }, [grid, rows, cols, N]);

  useEffect(() => {
    if (doneRef.current) return;
    // victoire si les indices sont tous satisfaits (toute solution valide compte)
    for (let r = 0; r < N; r++) {
      const line = grid.slice(r * N, r * N + N).map((v) => (v === 1 ? 1 : 0));
      if (JSON.stringify(cluesOf(line)) !== JSON.stringify(rows[r])) return;
    }
    for (let c = 0; c < N; c++) {
      const line = Array.from({ length: N }, (_, r) => (grid[r * N + c] === 1 ? 1 : 0));
      if (JSON.stringify(cluesOf(line)) !== JSON.stringify(cols[c])) return;
    }
    doneRef.current = true;
    setTimeout(() => onDone({ adjustMs: -10000, detail: 'résolu', status: 'success' }), 400);
  }, [grid, rows, cols, onDone, N]);

  // La grille étant résoluble par pure logique, sa solution est unique :
  // on peut vérifier les cases remplies contre le motif d'origine.
  function verifier() {
    onAdjust(5000, 'Vérification');
    const w = new Set<number>();
    grid.forEach((v, i) => {
      if (v === 1 && pattern[i] !== 1) w.add(i);
    });
    setWrong(w);
    setTimeout(() => setWrong(new Set()), 2000);
  }

  // Peinture au glisser : la case de départ fixe l'action (remplir / effacer /
  // marquer), appliquée ensuite à toutes les cases survolées bouton enfoncé.
  const dragRef = useRef<number | null>(null);

  function cellAt(e: React.PointerEvent): number | null {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const d = el?.closest('[data-i]')?.getAttribute('data-i');
    return d == null ? null : Number(d);
  }

  function applique(i: number, cible: number) {
    setGrid((g) => (g[i] === cible ? g : g.map((v, k) => (k === i ? cible : v))));
  }

  function onDown(e: React.PointerEvent) {
    if (doneRef.current) return;
    const i = cellAt(e);
    if (i === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const alt = e.button === 2;
    const cible = alt ? (grid[i] === 2 ? 0 : 2) : grid[i] === 1 ? 0 : 1;
    dragRef.current = cible;
    applique(i, cible);
  }

  function onMove(e: React.PointerEvent) {
    if (dragRef.current === null || doneRef.current) return;
    const i = cellAt(e);
    if (i !== null) applique(i, dragRef.current);
  }

  return (
    <div className="game-area">
      <div className={`nono-wrap${difficile ? ' n15' : ''}`} onContextMenu={(e) => e.preventDefault()}>
        <div className="nono-colclues" style={{ gridTemplateColumns: `repeat(${N}, ${taille})` }}>
          {cols.map((clue, c) => (
            <div className="clue" key={c}>
              {clue.map((v, k) => (
                <span key={k} className={barres.cols[c][k] ? 'done' : ''}>
                  {v}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="nono-rowclues" style={{ gridTemplateRows: `repeat(${N}, ${taille})` }}>
          {rows.map((clue, r) => (
            <div className="clue" key={r}>
              {clue.map((v, k) => (
                <span key={k} className={barres.rows[r][k] ? 'done' : ''}>
                  {v}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div
          className="cellgrid nono-grid"
          style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (dragRef.current = null)}
          onPointerCancel={() => (dragRef.current = null)}
        >
          {grid.map((v, i) => (
            <div
              key={i}
              data-i={i}
              className={`cell${v === 1 ? ' fill' : v === 2 ? ' x' : ''}${wrong.has(i) ? ' error' : ''}`}
            >
              {v === 2 && <span className="cell-pop">×</span>}
            </div>
          ))}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Clic = remplir · clic droit = croix · maintenez et glissez pour peindre plusieurs cases
      </p>
      <div className="game-actions">
        <button className="btn btn-sm" onClick={verifier}>
          Vérifier (+5 s)
        </button>
      </div>
    </div>
  );
}
