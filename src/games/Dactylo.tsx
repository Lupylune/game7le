import { useEffect, useMemo, useRef, useState } from 'react';
import { pick } from '../lib/rng';
import { useSaisieTexte } from '../lib/saisie';
import { SOL5, SOL6 } from '../data/lexique';
import type { GameProps } from './types';

const N_MOTS = 12;

export default function Dactylo({ rng, difficile, onDone }: GameProps) {
  const phrase = useMemo(() => {
    // Défi difficile : deux fois plus de mots à recopier
    const n = difficile ? N_MOTS * 2 : N_MOTS;
    const mots: string[] = [];
    for (let i = 0; i < n; i++) mots.push(pick(rng, i % 2 ? SOL6 : SOL5).toLowerCase());
    return mots.join(' ');
  }, [rng, difficile]);

  const [pos, setPos] = useState(0);
  const [typos, setTypos] = useState(0);
  const [flash, setFlash] = useState(false);
  const doneRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const saisie = useSaisieTexte((ch) => onChar(ch.toLowerCase()));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function onChar(ch: string) {
    if (doneRef.current) return;
    if (ch === phrase[pos]) {
      const next = pos + 1;
      setPos(next);
      if (next === phrase.length) {
        doneRef.current = true;
        const adjustMs = typos === 0 ? -15000 : typos <= 5 ? -10000 : -5000;
        setTimeout(
          () =>
            onDone({
              adjustMs,
              detail: typos === 0 ? 'recopié sans faute' : `recopié (${typos} faute${typos > 1 ? 's' : ''})`,
              status: 'success',
            }),
          500,
        );
      }
    } else {
      setTypos((t) => t + 1);
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
    }
  }

  return (
    <div className="game-area">
      <p className={`dactylo-phrase${flash ? ' err' : ''}`} onClick={() => inputRef.current?.focus()}>
        {phrase.split('').map((c, i) => (
          <span key={i} className={i < pos ? 'ok' : i === pos ? 'cur' : ''}>
            {c === ' ' && i === pos ? '␣' : c}
          </span>
        ))}
      </p>
      <input
        ref={inputRef}
        className="saisie-cachee"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label="Zone de frappe"
        placeholder="Tapez ici…"
        onInput={saisie}
        onKeyDown={(e) => {
          // les lettres passent par onInput ; on ne bloque que la navigation
          if (e.key === 'Backspace') e.preventDefault();
        }}
      />
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Recopiez la phrase le plus vite possible — seule la bonne lettre fait avancer, chaque
        erreur compte. {typos > 0 && `Fautes : ${typos}`}
      </p>
    </div>
  );
}
