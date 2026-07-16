import { useEffect, useMemo, useRef, useState } from 'react';
import { PUZZLES } from '../data/echecs';
import type { GameProps } from './types';

/** Échiquier en tableau de 64 cases, index 0 = a8 … 63 = h1. */
type Board = string[];

const GLYPHES: Record<string, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

function idx(sq: string): number {
  return (8 - Number(sq[1])) * 8 + (sq.charCodeAt(0) - 97);
}

function parseFen(fen: string): { board: Board; actif: 'w' | 'b' } {
  const [placement, actif] = fen.split(' ');
  const board: Board = new Array(64).fill('');
  let i = 0;
  for (const ch of placement) {
    if (ch === '/') continue;
    if (/\d/.test(ch)) i += Number(ch);
    else board[i++] = ch;
  }
  return { board, actif: actif as 'w' | 'b' };
}

/** Applique un coup UCI (gère prise en passant et roque, pas la promotion — filtrée au build). */
function applyUci(board: Board, uci: string): Board {
  const b = board.slice();
  const from = idx(uci.slice(0, 2));
  const to = idx(uci.slice(2, 4));
  const p = b[from];
  // prise en passant : pion qui change de colonne vers une case vide
  if (p.toLowerCase() === 'p' && from % 8 !== to % 8 && !b[to]) {
    b[Math.floor(from / 8) * 8 + (to % 8)] = '';
  }
  b[to] = p;
  b[from] = '';
  // roque : le roi bouge de deux colonnes, la tour suit
  if (p.toLowerCase() === 'k' && Math.abs((from % 8) - (to % 8)) === 2) {
    const rank = Math.floor(from / 8) * 8;
    if (to % 8 === 6) {
      b[rank + 5] = b[rank + 7];
      b[rank + 7] = '';
    } else {
      b[rank + 3] = b[rank];
      b[rank] = '';
    }
  }
  return b;
}

const estBlanche = (p: string) => p !== '' && p === p.toUpperCase();

/** Solution lisible du puzzle du jour (pour l'écran de résultats). */
export function solutionEchecs(rng: () => number): string {
  const pz = PUZZLES[Math.floor(rng() * PUZZLES.length)];
  const { board } = parseFen(pz.fen);
  const apres = applyUci(board, pz.riposte);
  const from = pz.solution.slice(0, 2);
  const to = pz.solution.slice(2, 4);
  const piece = apres[idx(from)];
  return `${GLYPHES[piece?.toLowerCase()] ?? ''} ${from} → ${to}${pz.mat ? ' (mat)' : ''}`;
}

export default function Echecs({ rng, onAdjust, onDone }: GameProps) {
  const puzzle = useMemo(() => PUZZLES[Math.floor(rng() * PUZZLES.length)], [rng]);
  const initial = useMemo(() => parseFen(puzzle.fen), [puzzle]);
  const joueurBlanc = initial.actif === 'b'; // l'adversaire joue la riposte, puis à nous

  const [board, setBoard] = useState<Board>(initial.board);
  const [lastMove, setLastMove] = useState<[number, number] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [flashSq, setFlashSq] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const doneRef = useRef(false);

  // L'adversaire joue son coup après un court délai
  useEffect(() => {
    const t = setTimeout(() => {
      setBoard((b) => applyUci(b, puzzle.riposte));
      setLastMove([idx(puzzle.riposte.slice(0, 2)), idx(puzzle.riposte.slice(2, 4))]);
      setReady(true);
    }, 800);
    return () => clearTimeout(t);
  }, [puzzle]);

  function finish(adjustMs: number, detail: string) {
    if (doneRef.current) return;
    doneRef.current = true;
    setTimeout(() => onDone({ adjustMs, detail, status: 'success' }), 900);
  }

  function sqName(i: number): string {
    return String.fromCharCode(97 + (i % 8)) + String(8 - Math.floor(i / 8));
  }

  function tenter(from: number, to: number) {
    if (doneRef.current) return;
    const mine = board[to] && estBlanche(board[to]) === joueurBlanc;
    if (mine) {
      setSel(to); // re-sélection d'une autre de ses pièces
      return;
    }
    const tentative = sqName(from) + sqName(to);
    if (tentative === puzzle.solution) {
      setBoard((b) => applyUci(b, puzzle.solution));
      setLastMove([from, to]);
      setSel(null);
      finish(revealed ? 0 : -15000, puzzle.mat ? 'mat trouvé' : 'meilleur coup trouvé');
    } else {
      onAdjust(10000, 'Mauvais coup');
      setFlashSq(to);
      setTimeout(() => setFlashSq(null), 400);
      setSel(null);
    }
  }

  // Glisser-déposer façon Lichess : la pièce saisie suit le curseur, le
  // relâchement sur une case tente le coup. Le clic-clic reste possible.
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const dragStart = useRef<[number, number]>([0, 0]);

  function squareAt(e: React.PointerEvent): number | null {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const d = el?.closest('[data-i]')?.getAttribute('data-i');
    return d == null ? null : Number(d);
  }

  function onDown(e: React.PointerEvent) {
    if (!ready || doneRef.current) return;
    const i = squareAt(e);
    if (i === null) return;
    const mine = board[i] && estBlanche(board[i]) === joueurBlanc;
    if (mine) {
      setSel(i);
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStart.current = [e.clientX, e.clientY];
      setDrag({ from: i, x: e.clientX, y: e.clientY, moved: false });
    } else if (sel !== null) {
      tenter(sel, i);
    }
  }

  function onMove(e: React.PointerEvent) {
    if (!drag) return;
    const moved =
      drag.moved ||
      Math.hypot(e.clientX - dragStart.current[0], e.clientY - dragStart.current[1]) > 5;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
  }

  function onUp(e: React.PointerEvent) {
    if (!drag) return;
    const { from, moved } = drag;
    setDrag(null);
    if (!moved) return; // simple clic : la pièce reste sélectionnée (clic-clic)
    const target = squareAt(e);
    if (target !== null && target !== from) tenter(from, target);
  }

  // orientation : les pièces du joueur en bas
  const ordre = useMemo(
    () => Array.from({ length: 64 }, (_, k) => (joueurBlanc ? k : 63 - k)),
    [joueurBlanc],
  );

  return (
    <div className="game-area">
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Trait aux {joueurBlanc ? 'Blancs' : 'Noirs'} ·{' '}
        {puzzle.mat ? 'mat en 1 coup' : 'trouvez le meilleur coup'} · puzzle Lichess ~{puzzle.elo} Elo
      </p>
      <div
        className="chess-board"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        {ordre.map((i) => {
          const clair = (Math.floor(i / 8) + i) % 2 === 0;
          const p = board[i];
          const enMain = drag?.moved && drag.from === i;
          return (
            <div
              key={i}
              data-i={i}
              className={`chess-sq ${clair ? 'clair' : 'sombre'}${sel === i ? ' sel' : ''}${
                lastMove?.includes(i) ? ' last' : ''
              }${flashSq === i ? ' errflash' : ''}`}
            >
              {p && (
                <span
                  className={`chess-piece ${estBlanche(p) ? 'w' : 'b'}${enMain ? ' en-main' : ''}`}
                  key={p + i}
                >
                  {GLYPHES[p.toLowerCase()]}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {drag?.moved && board[drag.from] && (
        <span
          className={`chess-piece chess-drag ${estBlanche(board[drag.from]) ? 'w' : 'b'}`}
          style={{ left: drag.x, top: drag.y }}
        >
          {GLYPHES[board[drag.from].toLowerCase()]}
        </span>
      )}
      <div className="game-actions">
        <button
          className="btn btn-sm"
          disabled={!ready}
          onClick={() => {
            onAdjust(30000, 'Solution révélée');
            setRevealed(true);
            setBoard((b) => applyUci(b, puzzle.solution));
            setLastMove([idx(puzzle.solution.slice(0, 2)), idx(puzzle.solution.slice(2, 4))]);
            finish(0, 'solution révélée');
          }}
        >
          Révéler (+30 s)
        </button>
        <span className="muted" style={{ fontSize: 'var(--text-sm)', alignSelf: 'center' }}>
          Glissez la pièce (ou cliquez départ puis arrivée) · mauvais coup : +10 s
        </span>
      </div>
    </div>
  );
}
