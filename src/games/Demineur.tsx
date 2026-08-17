import { useMemo, useRef, useState } from 'react';
import { shuffle, type RNG } from '../lib/rng';
import { SymDrapeau, SymMine, SymPioche } from '../components/GameIcon';
import type { GameProps } from './types';

const N = 12;
const MINES = 20;

// Pénalité de mine dégressive : maximale si la faute survient d'entrée, elle
// décroît d'une seconde par seconde de jeu jusqu'à un plancher (on punit la
// précipitation, pas l'erreur commise après un vrai effort de déduction).
const PENALITE_MAX = 120000; // +2 min si la mine saute dès le départ
const PENALITE_MIN = 30000; // plancher atteint après ~90 s de jeu

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

/**
 * Case de départ, tirée au sort mais identique pour tous : c'est elle qui fixe
 * la grille (les mines sont placées autour d'elle, et la solvabilité est
 * vérifiée depuis elle), donc tout le monde déminera exactement les mêmes 20
 * mines. Elle est marquée dans la grille et le premier coup doit s'y faire —
 * sinon le placement dépendrait de l'endroit cliqué, comme avant.
 * Tirée hors des deux rangs de bord : l'ouverture initiale y est plus large.
 */
function caseDepart(rng: RNG): number {
  const r = 2 + Math.floor(rng() * (N - 4));
  const c = 2 + Math.floor(rng() * (N - 4));
  return r * N + c;
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
  // Grille tirée au montage (et non au premier clic) : elle ne dépend plus de
  // ce que le joueur touche, elle est donc la même pour tout le monde.
  const { depart, mines } = useMemo(() => {
    const d = caseDepart(rng);
    return { depart: d, mines: placeMines(rng, d) };
  }, [rng]);
  const adj = useMemo(
    () => Array.from({ length: N * N }, (_, i) => neighbors(i).filter((n) => mines[n]).length),
    [mines],
  );
  const [states, setStates] = useState<CellState[]>(() => new Array(N * N).fill('hidden'));
  /** La case de départ est creusée : la grille s'ouvre au reste des clics. */
  const commence = states[depart] === 'open';
  const [mode, setMode] = useState<'dig' | 'flag'>('dig');
  const [boom, setBoom] = useState<number | null>(null);
  const doneRef = useRef(false);
  // Début de l'épreuve : le composant est monté au lancement du jeu (après le
  // décompte), donc `performance.now()` ici ≈ départ du chrono de l'épreuve.
  const startRef = useRef(performance.now());

  function finish(win: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    const penalite = Math.max(
      PENALITE_MIN,
      Math.round(PENALITE_MAX - (performance.now() - startRef.current)),
    );
    setTimeout(
      () =>
        onDone(
          win
            ? { adjustMs: -15000, detail: 'grille nettoyée', status: 'success' }
            : { adjustMs: penalite, detail: 'mine touchée', status: 'fail' },
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
    // Tant que la case de départ n'est pas creusée, elle seule répond : la
    // grille est garantie sûre et déductible depuis là, pas d'ailleurs.
    if (!commence && (i !== depart || flagAction)) return;
    const m = mines;
    const a = adj;
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
            className={`cell ${s === 'open' ? 'open' : ''} ${boom === i ? 'boom' : ''} ${
              !commence && i === depart ? 'ms-depart' : ''
            }`}
            style={s === 'open' && !mines[i] && adj[i] > 0 ? { color: MS_COLORS[adj[i]] } : undefined}
            title={!commence && i === depart ? 'Commencez par cette case' : undefined}
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
              mines[i] ? <SymMine size={16} /> : adj[i] > 0 ? adj[i] : ''
            ) : !commence && i === depart ? (
              <svg className="ms-croix" viewBox="0 0 24 24" aria-hidden>
                <path d="M4 4 L20 20 M20 4 L4 20" />
              </svg>
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
          {commence
            ? `${MINES - states.filter((s) => s === 'flag').length} mines restantes · clic droit = drapeau`
            : 'Creusez la case marquée pour ouvrir la grille'}
        </span>
      </div>
    </div>
  );
}
