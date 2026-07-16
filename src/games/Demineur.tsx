import { useMemo, useRef, useState } from 'react';
import { shuffle, type RNG } from '../lib/rng';
import { SymDrapeau, SymMine, SymPioche } from '../components/GameIcon';
import type { GameProps } from './types';

const N = 12;
const MINES = 20;

const MS_COLORS = ['', 'var(--ms-1)', 'var(--ms-2)', 'var(--ms-3)', 'var(--ms-4)', 'var(--ms-5)', 'var(--ms-6)', 'var(--ms-7)', 'var(--ms-8)'];

function neighbors(i: number): number[] {
  const r = Math.floor(i / N);
  const c = i % N;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) out.push(nr * N + nc);
    }
  return out;
}

/** Vérifie qu'une grille se résout par pure logique depuis la case de départ. */
function solvable(mines: boolean[], start: number): boolean {
  const adj = Array.from({ length: N * N }, (_, i) =>
    neighbors(i).filter((n) => mines[n]).length,
  );
  const open = new Array(N * N).fill(false);
  const flagged = new Array(N * N).fill(false);
  const reveal = (i: number) => {
    if (open[i] || flagged[i]) return;
    open[i] = true;
    if (adj[i] === 0) neighbors(i).forEach(reveal);
  };
  reveal(start);
  for (;;) {
    let progress = false;
    // Contraintes : cases ouvertes numérotées avec inconnues autour
    const constraints: { cells: number[]; count: number }[] = [];
    for (let i = 0; i < N * N; i++) {
      if (!open[i]) continue;
      const unk = neighbors(i).filter((n) => !open[n] && !flagged[n]);
      const flags = neighbors(i).filter((n) => flagged[n]).length;
      if (unk.length > 0) constraints.push({ cells: unk, count: adj[i] - flags });
    }
    for (const { cells, count } of constraints) {
      if (count === 0) {
        cells.forEach(reveal);
        progress = true;
      } else if (count === cells.length) {
        cells.forEach((c) => {
          if (!flagged[c]) {
            flagged[c] = true;
            progress = true;
          }
        });
      }
    }
    // Règle des sous-ensembles (A ⊂ B)
    if (!progress) {
      outer: for (const a of constraints) {
        for (const b of constraints) {
          if (a === b || a.cells.length >= b.cells.length) continue;
          const setB = new Set(b.cells);
          if (!a.cells.every((c) => setB.has(c))) continue;
          const diff = b.cells.filter((c) => !a.cells.includes(c));
          if (b.count - a.count === 0 && diff.length > 0) {
            diff.forEach(reveal);
            progress = true;
            break outer;
          }
          if (b.count - a.count === diff.length && diff.length > 0) {
            diff.forEach((c) => (flagged[c] = true));
            progress = true;
            break outer;
          }
        }
      }
    }
    if (!progress) break;
  }
  return open.filter(Boolean).length === N * N - MINES;
}

function placeMines(rng: RNG, start: number): boolean[] {
  const safe = new Set([start, ...neighbors(start)]);
  const candidates = Array.from({ length: N * N }, (_, i) => i).filter((i) => !safe.has(i));
  for (let t = 0; t < 40; t++) {
    const mines = new Array(N * N).fill(false);
    shuffle(rng, candidates)
      .slice(0, MINES)
      .forEach((i) => (mines[i] = true));
    if (solvable(mines, start)) return mines;
    if (t === 39) return mines; // secours : on accepte la dernière
  }
  return new Array(N * N).fill(false);
}

type CellState = 'hidden' | 'open' | 'flag';

export default function Demineur({ rng, onDone }: GameProps) {
  const [mines, setMines] = useState<boolean[] | null>(null);
  const adj = useMemo(
    () =>
      mines
        ? Array.from({ length: N * N }, (_, i) => neighbors(i).filter((n) => mines[n]).length)
        : null,
    [mines],
  );
  const [states, setStates] = useState<CellState[]>(() => new Array(N * N).fill('hidden'));
  const [mode, setMode] = useState<'dig' | 'flag'>('dig');
  const [boom, setBoom] = useState<number | null>(null);
  const doneRef = useRef(false);

  function finish(win: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    setTimeout(
      () =>
        onDone(
          win
            ? { adjustMs: -15000, detail: 'grille nettoyée', status: 'success' }
            : { adjustMs: 60000, detail: 'mine touchée', status: 'fail' },
        ),
      900,
    );
  }

  function reveal(i: number, m: boolean[], a: number[], st: CellState[]): void {
    if (st[i] !== 'hidden') return;
    if (m[i]) {
      st[i] = 'open';
      setBoom(i);
      // révèle toutes les mines
      for (let k = 0; k < N * N; k++) if (m[k]) st[k] = 'open';
      finish(false);
      return;
    }
    const stack = [i];
    while (stack.length) {
      const cur = stack.pop()!;
      if (st[cur] !== 'hidden') continue;
      st[cur] = 'open';
      if (a[cur] === 0) for (const n of neighbors(cur)) if (st[n] === 'hidden') stack.push(n);
    }
  }

  function checkWin(st: CellState[]) {
    const opened = st.filter((s) => s === 'open').length;
    if (boom === null && opened === N * N - MINES) finish(true);
  }

  function onCell(i: number, flagAction: boolean) {
    if (doneRef.current) return;
    let m = mines;
    let a = adj;
    if (!m) {
      if (flagAction) return;
      m = placeMines(rng, i);
      a = Array.from({ length: N * N }, (_, k) => neighbors(k).filter((n) => m![n]).length);
      setMines(m);
    }
    setStates((prev) => {
      const st = prev.slice();
      if (flagAction) {
        if (st[i] === 'hidden') st[i] = 'flag';
        else if (st[i] === 'flag') st[i] = 'hidden';
      } else if (st[i] === 'open' && a![i] > 0) {
        // accord (chord) : si le bon nombre de drapeaux entoure la case, ouvre le reste
        const ns = neighbors(i);
        const flags = ns.filter((n) => st[n] === 'flag').length;
        if (flags === a![i]) ns.forEach((n) => st[n] === 'hidden' && reveal(n, m!, a!, st));
      } else if (st[i] === 'hidden') {
        reveal(i, m!, a!, st);
      }
      checkWin(st);
      return st;
    });
  }

  return (
    <div className="game-area">
      <div
        className="cellgrid ms-grid"
        style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {states.map((s, i) => (
          <div
            key={i}
            className={`cell ${s === 'open' ? 'open' : ''} ${boom === i ? 'boom' : ''}`}
            style={s === 'open' && adj && !mines?.[i] && adj[i] > 0 ? { color: MS_COLORS[adj[i]] } : undefined}
            onClick={() => onCell(i, mode === 'flag' && s !== 'open')}
            onContextMenu={(e) => {
              e.preventDefault();
              onCell(i, true);
            }}
          >
            {s === 'flag' ? (
              <span className="cell-pop">
                <SymDrapeau />
              </span>
            ) : s === 'open' ? (
              mines?.[i] ? <SymMine size={16} /> : adj && adj[i] > 0 ? adj[i] : ''
            ) : (
              ''
            )}
          </div>
        ))}
      </div>
      <div className="game-actions">
        <button className="btn btn-sm" onClick={() => setMode((m) => (m === 'dig' ? 'flag' : 'dig'))}>
          Mode : {mode === 'dig' ? <SymPioche /> : <SymDrapeau />}{' '}
          {mode === 'dig' ? 'creuser' : 'drapeau'}
        </button>
        <span className="muted" style={{ fontSize: 'var(--text-sm)', alignSelf: 'center' }}>
          {MINES - states.filter((s) => s === 'flag').length} mines restantes · clic droit = drapeau
        </span>
      </div>
    </div>
  );
}
