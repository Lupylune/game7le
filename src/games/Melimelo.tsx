import { useEffect, useMemo, useRef, useState } from 'react';
import { pick, shuffle } from '../lib/rng';
import { SOL6, DICO6 } from '../data/lexique';
import type { GameProps } from './types';

const norm = (w: string) => w.split('').sort().join('');
const REVEAL_MS = 650; // durée d'affichage de chaque lettre

export default function Melimelo({ rng, onAdjust, onDone }: GameProps) {
  const { letters, solutions } = useMemo(() => {
    const target = pick(rng, SOL6);
    // toute anagramme du dictionnaire complet est acceptée
    const solutions = new Set(DICO6.filter((w) => norm(w) === norm(target)));
    return { letters: shuffle(rng, target.split('')), solutions };
  }, [rng]);

  // Les lettres se révèlent une par une (comme l'original), puis tout se masque.
  // -2 = pas encore commencé, 0..5 = lettre en cours, -1 = séquence terminée
  const [revealIdx, setRevealIdx] = useState(-2);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState(0);
  const doneRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (revealIdx === -1) {
      inputRef.current?.focus();
      return;
    }
    const t = setTimeout(
      () => setRevealIdx((i) => (i === -2 ? 0 : i + 1 >= letters.length ? -1 : i + 1)),
      revealIdx === -2 ? 400 : REVEAL_MS,
    );
    return () => clearTimeout(t);
  }, [revealIdx, letters.length]);

  const sequenceActive = revealIdx !== -1;

  function submit() {
    if (doneRef.current || sequenceActive || input.length !== 6) return;
    if (solutions.has(input)) {
      doneRef.current = true;
      setMessage('Bien joué !');
      setTimeout(
        () =>
          onDone({
            adjustMs: -8000,
            detail: `trouvé (${input})${errors ? `, ${errors} erreur${errors > 1 ? 's' : ''}` : ''}`,
            status: 'success',
          }),
        600,
      );
    } else {
      setErrors((e) => e + 1);
      onAdjust(10000, 'Mauvaise réponse');
      setMessage("Ce n'était pas ça… (+10 s)");
      setInput('');
    }
  }

  return (
    <div className="game-area">
      <div className="meli-reveal">
        {revealIdx >= 0 && (
          <>
            <span className="lettre" key={revealIdx}>
              {letters[revealIdx]}
            </span>
            <span className="compteur">
              {revealIdx + 1} / {letters.length}
            </span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        className="meli-input"
        value={input}
        maxLength={6}
        placeholder={sequenceActive ? 'Mémorisez…' : '······'}
        disabled={sequenceActive}
        autoCapitalize="characters"
        autoComplete="off"
        onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {message && <p className="muted">{message}</p>}
      <div className="game-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={sequenceActive || input.length !== 6}
        >
          Valider
        </button>
        {!sequenceActive && (
          <button
            className="btn btn-sm"
            onClick={() => {
              onAdjust(10000, 'Lettres revues');
              setErrors((e) => e + 1);
              setRevealIdx(0);
            }}
          >
            Revoir les lettres (+10 s)
          </button>
        )}
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Les six lettres se révèlent une par une : mémorisez-les, puis reconstituez le mot qui les
        utilise toutes.
      </p>
    </div>
  );
}
