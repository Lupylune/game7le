import { useEffect, useMemo, useRef, useState } from 'react';
import { CROISES } from '../data/croises';
import { genCroise } from '../lib/croisesgen';
import { useSaisieTexte } from '../lib/saisie';
import type { GameProps } from './types';

const N = 5;

export default function Croises({ rng, difficile, onAdjust, onDone }: GameProps) {
  // Grille dynamique (Lexique + Wiktionnaire) ; repli sur les grilles artisanales
  const puzzle = useMemo(
    () => genCroise(rng, difficile) ?? CROISES[Math.floor(rng() * CROISES.length)],
    [rng, difficile],
  );
  const solution = puzzle.grille;
  const [cells, setCells] = useState<string[][]>(() =>
    solution.map((row) => row.split('').map((ch) => (ch === '#' ? '#' : ''))),
  );
  const [sel, setSel] = useState<{ r: number; c: number; dir: 'h' | 'v' }>(() => firstWhite());
  const [revealed, setRevealed] = useState(false);
  const [wrong, setWrong] = useState<Set<string>>(() => new Set());
  // Mots entièrement justes : `solus` teinte durablement les cases et l'indice,
  // `flash` déclenche la vague de validation (retirée à la fin de l'animation).
  const [solus, setSolus] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState<Set<string>>(() => new Set());
  const solusRef = useRef<Set<string>>(new Set());
  const minuteries = useRef<number[]>([]);
  const doneRef = useRef(false);
  // Champ caché : donne un foyer de saisie pour que le clavier virtuel
  // s'ouvre au toucher d'une case (aucun clavier physique sur mobile).
  const inputRef = useRef<HTMLInputElement>(null);
  const saisie = useSaisieTexte(
    (ch) => {
      if (/[a-zA-Z]/.test(ch)) setLetter(ch.toUpperCase());
    },
    () => setLetter(''),
  );

  function focusSaisie() {
    inputRef.current?.focus({ preventScroll: true });
  }

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

  // Cases de chaque mot indicé, clés `h<ligne>` / `v<colonne>`
  const mots = useMemo(() => {
    const ligne = (dir: 'h' | 'v', i: number) => {
      const cs: [number, number][] = [];
      for (let k = 0; k < N; k++) {
        const [r, c] = dir === 'h' ? [i, k] : [k, i];
        if (isWhite(r, c)) cs.push([r, c]);
      }
      return { cle: `${dir}${i}`, cells: cs };
    };
    return [
      ...puzzle.horizontaux.map((m) => ligne('h', m.ligne)),
      ...puzzle.verticaux.map((m) => ligne('v', m.col)),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, solution]);

  // Un mot devient juste → vague de validation sur ses cases
  useEffect(() => {
    const justes = new Set(
      mots
        .filter((m) => m.cells.every(([r, c]) => cells[r][c] === solution[r][c]))
        .map((m) => m.cle),
    );
    const nouveaux = [...justes].filter((k) => !solusRef.current.has(k));
    const perdus = [...solusRef.current].filter((k) => !justes.has(k));
    if (!nouveaux.length && !perdus.length) return;
    solusRef.current = justes;
    setSolus(justes);
    if (!nouveaux.length) return;
    setFlash((f) => new Set([...f, ...nouveaux]));
    minuteries.current.push(
      window.setTimeout(() => {
        setFlash((f) => {
          const n = new Set(f);
          nouveaux.forEach((k) => n.delete(k));
          return n;
        });
      }, 900),
    );
  }, [cells, mots, solution]);

  useEffect(() => () => minuteries.current.forEach(clearTimeout), []);

  // Cases teintées (mot juste) et cases en cours d'animation (→ décalage en vague)
  const cellsSolues = useMemo(() => {
    const s = new Set<string>();
    for (const m of mots) if (solus.has(m.cle)) m.cells.forEach(([r, c]) => s.add(`${r},${c}`));
    return s;
  }, [mots, solus]);
  const cellsFlash = useMemo(() => {
    const m2 = new Map<string, number>();
    for (const m of mots)
      if (flash.has(m.cle))
        m.cells.forEach(([r, c], i) => {
          const k = `${r},${c}`;
          m2.set(k, Math.min(m2.get(k) ?? i, i));
        });
    return m2;
  }, [mots, flash]);

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
      // le champ caché a le foyer : lettres et effacement passent par lui
      const surSaisie = e.target === inputRef.current;
      if (!surSaisie && /^[a-zA-Z]$/.test(e.key)) setLetter(e.key.toUpperCase());
      else if (!surSaisie && e.key === 'Backspace') {
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
        <input
          ref={inputRef}
          className="saisie-cachee"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Saisie de lettres"
          onInput={saisie}
          onKeyDown={(e) => {
            // champ vide : l'effacement n'émet pas d'événement input
            if (e.key === 'Backspace' && e.currentTarget.value === '') {
              e.preventDefault();
              setLetter('');
            }
          }}
        />
        <div
          className="cellgrid cw-grid"
          style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}
        >
          {solution.flatMap((row, r) =>
            row.split('').map((ch, c) => {
              if (ch === '#') return <div className="cell black" key={`${r}${c}`} />;
              const isSel = sel.r === r && sel.c === c;
              const inWord = wordCells.has(`${r},${c}`);
              const rang = cellsFlash.get(`${r},${c}`);
              return (
                <div
                  key={`${r}${c}`}
                  className={`cell${isSel ? ' sel' : inWord ? ' word' : ''}${wrong.has(`${r},${c}`) ? ' error' : ''}${cellsSolues.has(`${r},${c}`) ? ' juste' : ''}${rang === undefined ? '' : ' vague'}`}
                  style={rang === undefined ? undefined : { animationDelay: `${rang * 70}ms` }}
                  onClick={() => {
                    setSel((s) =>
                      s.r === r && s.c === c ? { ...s, dir: s.dir === 'h' ? 'v' : 'h' } : { r, c, dir: s.dir },
                    );
                    focusSaisie();
                  }}
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
            {puzzle.horizontaux.map((m, i) => (
              <li
                key={m.mot}
                className={`${sel.dir === 'h' && sel.r === m.ligne ? 'active' : ''}${solus.has(`h${m.ligne}`) ? ' trouve' : ''}`}
                onClick={() => setSel({ r: m.ligne, c: solution[m.ligne].indexOf(m.mot[0]) >= 0 ? solution[m.ligne].split('').findIndex((x) => x !== '#') : 0, dir: 'h' })}
              >
                {i + 1}. {m.indice}
              </li>
            ))}
          </ul>
          <h4>Verticaux</h4>
          <ul>
            {puzzle.verticaux.map((m, i) => (
              <li
                key={m.mot}
                className={`${sel.dir === 'v' && sel.c === m.col ? 'active' : ''}${solus.has(`v${m.col}`) ? ' trouve' : ''}`}
                onClick={() => setSel({ r: 0, c: m.col, dir: 'v' })}
              >
                {i + 1}. {m.indice}
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
