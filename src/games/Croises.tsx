import { useEffect, useMemo, useRef, useState } from 'react';
import { CROISES } from '../data/croises';
import { genCroise } from '../lib/croisesgen';
import type { GameProps } from './types';

const N = 5;

export default function Croises({ rng, onAdjust, onDone }: GameProps) {
  // Grille dynamique (Lexique + Wiktionnaire) ; repli sur les grilles artisanales
  const puzzle = useMemo(
    () => genCroise(rng) ?? CROISES[Math.floor(rng() * CROISES.length)],
    [rng],
  );
  const solution = puzzle.grille;
  const [cells, setCells] = useState<string[][]>(() =>
    solution.map((row) => row.split('').map((ch) => (ch === '#' ? '#' : ''))),
  );
  const [sel, setSel] = useState<{ r: number; c: number; dir: 'h' | 'v' }>(() => firstWhite());
  const [revealed, setRevealed] = useState(false);
  const [wrong, setWrong] = useState<Set<string>>(() => new Set());
  const doneRef = useRef(false);

  function firstWhite() {
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) if (solution[r][c] !== '#') return { r, c, dir: 'h' as const };
    return { r: 0, c: 0, dir: 'h' as const };
  }

  const isWhite = (r: number, c: number) =>
    r >= 0 && r < N && c >= 0 && c < N && solution[r][c] !== '#';

  // Cases du mot couramment sélectionné (pour le surlignage)
  const wordCells = useMemo(() => {
    const set = new Set<string>();
    const { r, c, dir } = sel;
    if (!isWhite(r, c)) return set;
    const dr = dir === 'v' ? 1 : 0;
    const dc = dir === 'h' ? 1 : 0;
    let sr = r;
    let sc = c;
    while (isWhite(sr - dr, sc - dc)) {
      sr -= dr;
      sc -= dc;
    }
    while (isWhite(sr, sc)) {
      set.add(`${sr},${sc}`);
      sr += dr;
      sc += dc;
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, solution]);

  function moveNext(r: number, c: number, dir: 'h' | 'v', delta: 1 | -1) {
    const dr = dir === 'v' ? delta : 0;
    const dc = dir === 'h' ? delta : 0;
    let nr = r + dr;
    let nc = c + dc;
    if (isWhite(nr, nc)) setSel({ r: nr, c: nc, dir });
  }

  function setLetter(ch: string) {
    const { r, c, dir } = sel;
    if (!isWhite(r, c)) return;
    setCells((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][c] = ch;
      return next;
    });
    if (ch) moveNext(r, c, dir, 1);
    else moveNext(r, c, dir, -1);
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) setLetter(e.key.toUpperCase());
      else if (e.key === 'Backspace') {
        e.preventDefault();
        setLetter('');
      } else if (e.key === 'ArrowRight') setSel((s) => (isWhite(s.r, s.c + 1) ? { ...s, c: s.c + 1, dir: 'h' } : s));
      else if (e.key === 'ArrowLeft') setSel((s) => (isWhite(s.r, s.c - 1) ? { ...s, c: s.c - 1, dir: 'h' } : s));
      else if (e.key === 'ArrowDown') setSel((s) => (isWhite(s.r + 1, s.c) ? { ...s, r: s.r + 1, dir: 'v' } : s));
      else if (e.key === 'ArrowUp') setSel((s) => (isWhite(s.r - 1, s.c) ? { ...s, r: s.r - 1, dir: 'v' } : s));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  // Victoire automatique quand la grille est correcte et complète
  useEffect(() => {
    if (doneRef.current) return;
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        if (solution[r][c] === '#') continue;
        if (cells[r][c] !== solution[r][c]) return;
      }
    doneRef.current = true;
    setTimeout(
      () =>
        onDone(
          revealed
            ? { adjustMs: 0, detail: 'résolu (avec révélation)', status: 'success' }
            : { adjustMs: -10000, detail: 'résolu', status: 'success' },
        ),
      400,
    );
  }, [cells, solution, revealed, onDone]);

  function revealLetter() {
    const { r, c } = sel;
    if (!isWhite(r, c) || cells[r][c] === solution[r][c]) return;
    onAdjust(8000, 'Lettre révélée');
    setRevealed(true);
    setCells((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][c] = solution[r][c];
      return next;
    });
  }

  function verifier() {
    onAdjust(5000, 'Vérification');
    const w = new Set<string>();
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        if (solution[r][c] === '#') continue;
        if (cells[r][c] && cells[r][c] !== solution[r][c]) w.add(`${r},${c}`);
      }
    setWrong(w);
    setTimeout(() => setWrong(new Set()), 2000);
  }

  return (
    <div className="game-area">
      <div className="cw-wrap">
        <div
          className="cellgrid cw-grid"
          style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}
        >
          {solution.flatMap((row, r) =>
            row.split('').map((ch, c) => {
              if (ch === '#') return <div className="cell black" key={`${r}${c}`} />;
              const isSel = sel.r === r && sel.c === c;
              const inWord = wordCells.has(`${r},${c}`);
              return (
                <div
                  key={`${r}${c}`}
                  className={`cell${isSel ? ' sel' : inWord ? ' word' : ''}${wrong.has(`${r},${c}`) ? ' error' : ''}`}
                  onClick={() =>
                    setSel((s) =>
                      s.r === r && s.c === c ? { ...s, dir: s.dir === 'h' ? 'v' : 'h' } : { r, c, dir: s.dir },
                    )
                  }
                >
                  {cells[r][c] && (
                    <span className="cell-pop" key={cells[r][c]}>
                      {cells[r][c]}
                    </span>
                  )}
                </div>
              );
            }),
          )}
        </div>
        <div className="cw-clues">
          <h4>Horizontaux</h4>
          <ul>
            {puzzle.horizontaux.map((m) => (
              <li
                key={m.mot}
                className={sel.dir === 'h' && sel.r === m.ligne ? 'active' : ''}
                onClick={() => setSel({ r: m.ligne, c: solution[m.ligne].indexOf(m.mot[0]) >= 0 ? solution[m.ligne].split('').findIndex((x) => x !== '#') : 0, dir: 'h' })}
              >
                {m.ligne + 1}. {m.indice} ({m.mot.length})
              </li>
            ))}
          </ul>
          <h4>Verticaux</h4>
          <ul>
            {puzzle.verticaux.map((m) => (
              <li
                key={m.mot}
                className={sel.dir === 'v' && sel.c === m.col ? 'active' : ''}
                onClick={() => setSel({ r: 0, c: m.col, dir: 'v' })}
              >
                {m.col + 1}. {m.indice} ({m.mot.length})
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="game-actions">
        <button className="btn btn-sm" onClick={revealLetter}>
          Révéler une lettre (+8 s)
        </button>
        <button className="btn btn-sm" onClick={verifier}>
          Vérifier (+5 s)
        </button>
      </div>
    </div>
  );
}
