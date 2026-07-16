import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { pick } from '../lib/rng';
import { SOL5, DICO5_SET } from '../data/lexique';
import type { GameProps } from './types';

type LetterState = 'correct' | 'present' | 'absent';

const ROWS: string[] = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];

function scoreGuess(guess: string, solution: string): LetterState[] {
  const res: LetterState[] = Array(5).fill('absent');
  const rest: Record<string, number> = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === solution[i]) res[i] = 'correct';
    else rest[solution[i]] = (rest[solution[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] !== 'correct' && rest[guess[i]] > 0) {
      res[i] = 'present';
      rest[guess[i]]--;
    }
  }
  return res;
}

/** Bonus selon le nombre d'essais ; échec = +60 s. */
function adjustFor(tries: number | null): number {
  if (tries === null) return 60000;
  if (tries <= 3) return -15000;
  if (tries === 4) return -10000;
  if (tries === 5) return -5000;
  return 0;
}

export default function LeMot({ rng, onDone }: GameProps) {
  const solution = useMemo(() => pick(rng, SOL5), [rng]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [message, setMessage] = useState('');
  const [over, setOver] = useState(false);
  const [shake, setShake] = useState(false);

  const keyStates = useMemo(() => {
    const st: Record<string, LetterState> = {};
    for (const g of guesses) {
      const sc = scoreGuess(g, solution);
      for (let i = 0; i < 5; i++) {
        const prev = st[g[i]];
        const next = sc[i];
        if (prev === 'correct') continue;
        if (prev === 'present' && next === 'absent') continue;
        st[g[i]] = next;
      }
    }
    return st;
  }, [guesses, solution]);

  const submit = useCallback(() => {
    if (over) return;
    if (current.length !== 5) return;
    if (!DICO5_SET.has(current)) {
      setMessage('Mot inconnu du dictionnaire');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    const next = [...guesses, current];
    setGuesses(next);
    setCurrent('');
    setMessage('');
    if (current === solution) {
      setOver(true);
      const adj = adjustFor(next.length);
      setTimeout(
        () => onDone({ adjustMs: adj, detail: `trouvé en ${next.length} essai${next.length > 1 ? 's' : ''}`, status: 'success' }),
        600,
      );
    } else if (next.length >= 6) {
      setOver(true);
      setMessage(`C'était « ${solution} »`);
      setTimeout(() => onDone({ adjustMs: adjustFor(null), detail: `échoué (${solution})`, status: 'fail' }), 1400);
    }
  }, [current, guesses, over, solution, onDone]);

  const onKey = useCallback(
    (k: string) => {
      if (over) return;
      if (k === 'ENTREE') submit();
      else if (k === 'EFFACER') setCurrent((c) => c.slice(0, -1));
      else if (/^[A-Z]$/.test(k)) setCurrent((c) => (c.length < 5 ? c + k : c));
    },
    [over, submit],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === 'Enter') onKey('ENTREE');
      else if (e.key === 'Backspace') onKey('EFFACER');
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toUpperCase());
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onKey]);

  return (
    <div className="game-area">
      <div className="wordy-board">
        {Array.from({ length: 6 }, (_, r) => {
          const g = guesses[r];
          const isCur = r === guesses.length;
          const sc = g ? scoreGuess(g, solution) : null;
          return (
            <div className={`wordy-row${isCur && shake ? ' shake' : ''}`} key={r}>
              {Array.from({ length: 5 }, (_, c) => {
                const letter = g ? g[c] : isCur ? current[c] ?? '' : '';
                const cls = sc
                  ? ` ${sc[c]} reveal`
                  : isCur && letter
                    ? ' typed'
                    : '';
                return (
                  <div
                    className={`wordy-cell${cls}`}
                    key={c}
                    style={sc ? ({ '--d': `${c * 0.09}s` } as CSSProperties) : undefined}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {message && <p className="muted">{message}</p>}
      <div className="kb">
        {ROWS.map((row, i) => (
          <div className="kb-row" key={i}>
            {i === 2 && (
              <button className="kb-key wide" onClick={() => onKey('ENTREE')}>
                Entrée
              </button>
            )}
            {row.split('').map((k) => (
              <button key={k} className={`kb-key ${keyStates[k] ?? ''}`} onClick={() => onKey(k)}>
                {k}
              </button>
            ))}
            {i === 2 && (
              <button className="kb-key wide" onClick={() => onKey('EFFACER')}>
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
