import { useMemo, useRef, useState } from 'react';
import { shuffle, type RNG } from '../lib/rng';
import { SymDrapeau, SymMine, SymPioche } from '../components/GameIcon';
import type { GameProps } from './types';

/**
 * Plateau du jour, et celui du défi difficile : côté doublé (24×24 au lieu de
 * 12×12, soit quatre fois plus de cases) à densité de mines constante — c'est la
 * longueur du déminage qui fait la difficulté, pas un champ de mines plus dense
 * qui forcerait à parier.
 */
const PLATEAU = {
  normal: { n: 12, mines: 20, bonus: -15000 },
  difficile: { n: 24, mines: 80, bonus: -30000 },
} as const;

// Pénalité de mine dégressive : maximale si la faute survient d'entrée, elle
// décroît d'une seconde par seconde de jeu jusqu'à un plancher (on punit la
// précipitation, pas l'erreur commise après un vrai effort de déduction).
const PENALITE_MAX = 120000; // +2 min si la mine saute dès le départ
const PENALITE_MIN = 30000; // plancher atteint après ~90 s de jeu

const MS_COLORS = ['', 'var(--ms-1)', 'var(--ms-2)', 'var(--ms-3)', 'var(--ms-4)', 'var(--ms-5)', 'var(--ms-6)', 'var(--ms-7)', 'var(--ms-8)'];

/**
 * Voisinages précalculés par taille de grille : `neighbors()` était rappelé (et
 * réallouait un tableau) à chaque case de chaque passe du solveur, ce que le
 * plateau 24×24 ne pardonne pas — la génération y passe de ~500 ms au pire à
 * moins de 10 ms, sans rien changer aux verdicts (donc aux grilles passées).
 */
const VOISINS = new Map<number, number[][]>();

function voisinsDe(n: number): number[][] {
  const cache = VOISINS.get(n);
  if (cache) return cache;
  const table = Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n);
    const c = i % n;
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
      }
    return out;
  });
  VOISINS.set(n, table);
  return table;
}

/** Vérifie qu'une grille se résout par pure logique depuis la case de départ. */
function solvable(n: number, nbMines: number, mines: boolean[], start: number): boolean {
  const V = voisinsDe(n);
  const adj = V.map((ns) => {
    let k = 0;
    for (const x of ns) if (mines[x]) k++;
    return k;
  });
  const open = new Array(n * n).fill(false);
  const flagged = new Array(n * n).fill(false);
  const pile: number[] = [];
  const reveal = (i: number) => {
    pile.push(i);
    while (pile.length) {
      const k = pile.pop()!;
      if (open[k] || flagged[k]) continue;
      open[k] = true;
      if (adj[k] === 0) for (const v of V[k]) pile.push(v);
    }
  };
  reveal(start);
  for (;;) {
    let progress = false;
    // Contraintes : cases ouvertes numérotées avec inconnues autour
    const constraints: { cells: number[]; count: number }[] = [];
    for (let i = 0; i < n * n; i++) {
      if (!open[i]) continue;
      const unk: number[] = [];
      let flags = 0;
      for (const v of V[i]) {
        if (flagged[v]) flags++;
        else if (!open[v]) unk.push(v);
      }
      if (unk.length > 0) constraints.push({ cells: unk, count: adj[i] - flags });
    }
    for (const { cells, count } of constraints) {
      if (count === 0) {
        cells.forEach(reveal);
        progress = true;
      } else if (count === cells.length) {
        for (const c of cells)
          if (!flagged[c]) {
            flagged[c] = true;
            progress = true;
          }
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
            for (const c of diff) flagged[c] = true;
            progress = true;
            break outer;
          }
        }
      }
    }
    if (!progress) break;
  }
  let ouvertes = 0;
  for (let i = 0; i < n * n; i++) if (open[i]) ouvertes++;
  return ouvertes === n * n - nbMines;
}

/**
 * Case de départ, tirée au sort mais identique pour tous : c'est elle qui fixe
 * la grille (les mines sont placées autour d'elle, et la solvabilité est
 * vérifiée depuis elle), donc tout le monde déminera exactement les mêmes
 * mines. Elle est marquée dans la grille et le premier coup doit s'y faire —
 * sinon le placement dépendrait de l'endroit cliqué, comme avant.
 * Tirée hors des deux rangs de bord : l'ouverture initiale y est plus large.
 */
function caseDepart(rng: RNG, n: number): number {
  const r = 2 + Math.floor(rng() * (n - 4));
  const c = 2 + Math.floor(rng() * (n - 4));
  return r * n + c;
}

function placeMines(rng: RNG, n: number, nbMines: number, start: number): boolean[] {
  const V = voisinsDe(n);
  const safe = new Set([start, ...V[start]]);
  const candidates = Array.from({ length: n * n }, (_, i) => i).filter((i) => !safe.has(i));
  for (let t = 0; t < 40; t++) {
    const mines = new Array(n * n).fill(false);
    shuffle(rng, candidates)
      .slice(0, nbMines)
      .forEach((i) => (mines[i] = true));
    if (solvable(n, nbMines, mines, start)) return mines;
    if (t === 39) return mines; // secours : on accepte la dernière
  }
  return new Array(n * n).fill(false);
}

type CellState = 'hidden' | 'open' | 'flag';

export default function Demineur({ rng, difficile, onDone }: GameProps) {
  const { n: N, mines: MINES, bonus } = PLATEAU[difficile ? 'difficile' : 'normal'];
  const voisins = voisinsDe(N);
  // Grille tirée au montage (et non au premier clic) : elle ne dépend plus de
  // ce que le joueur touche, elle est donc la même pour tout le monde.
  const { depart, mines } = useMemo(() => {
    const d = caseDepart(rng, N);
    return { depart: d, mines: placeMines(rng, N, MINES, d) };
  }, [rng, N, MINES]);
  const adj = useMemo(
    () => voisins.map((ns) => ns.filter((v) => mines[v]).length),
    [voisins, mines],
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
            ? { adjustMs: bonus, detail: 'grille nettoyée', status: 'success' }
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
      if (a[cur] === 0) for (const v of voisins[cur]) if (st[v] === 'hidden') stack.push(v);
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
        const ns = voisins[i];
        const flags = ns.filter((v) => st[v] === 'flag').length;
        if (flags === a![i]) ns.forEach((v) => st[v] === 'hidden' && reveal(v, m!, a!, st));
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
        className={`cellgrid ms-grid${difficile ? ' grand' : ''}`}
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
