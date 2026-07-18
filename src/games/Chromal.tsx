import { useMemo, useRef, useState } from 'react';
import type { GameProps } from './types';

const LEVELS = 10;

export default function Chromal({ rng, difficile, onDone }: GameProps) {
  // Défi difficile : la case à trouver se cache parmi 16 au lieu de 6
  const nCases = difficile ? 16 : 6;
  // Pré-génère les 10 niveaux : couleur de base, case différente, écart décroissant
  const levels = useMemo(
    () =>
      Array.from({ length: LEVELS }, (_, lvl) => {
        const h = Math.floor(rng() * 360);
        const s = 45 + Math.floor(rng() * 30);
        const l = 40 + Math.floor(rng() * 25);
        const delta = Math.max(2, 14 - lvl * 1.3); // de ±14 % à ±2 % de luminosité
        const odd = Math.floor(rng() * nCases);
        const sign = rng() < 0.5 ? 1 : -1;
        return { h, s, l, delta: delta * sign, odd };
      }),
    [rng, nCases],
  );
  const [level, setLevel] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const doneRef = useRef(false);

  function finish(completed: number) {
    if (doneRef.current) return;
    doneRef.current = true;
    // Éliminé : pénalité dégressive avec la progression. Au défi difficile
    // (16 cases) la case à trouver est bien plus dure à repérer et l'erreur
    // tient plus de la perception que de la déduction → rampe plus douce (de
    // +30 s à −6 s au lieu de +35 s à −10 s).
    const adjustMs =
      completed === LEVELS
        ? -15000
        : difficile
          ? Math.round((30 - completed * 4) * 1000)
          : Math.round((35 - completed * 5) * 1000);
    setTimeout(
      () =>
        onDone({
          adjustMs,
          detail:
            completed === LEVELS
              ? 'les 10 niveaux réussis'
              : `éliminé au niveau ${completed + 1}`,
          status: completed === LEVELS ? 'success' : 'fail',
        }),
      800,
    );
  }

  function tap(i: number) {
    if (doneRef.current) return;
    const cur = levels[level];
    if (i === cur.odd) {
      if (level + 1 === LEVELS) finish(LEVELS);
      else setLevel((l) => l + 1);
    } else {
      setFlash(i);
      finish(level);
    }
  }

  const cur = levels[level];
  const base = `hsl(${cur.h} ${cur.s}% ${cur.l}%)`;
  const odd = `hsl(${cur.h} ${cur.s}% ${cur.l + cur.delta}%)`;

  return (
    <div className="game-area">
      <p className="chromal-level">
        Niveau {level + 1} / {LEVELS}
      </p>
      <div className={`chromal-grid${difficile ? ' seize' : ''}`} key={level}>
        {Array.from({ length: nCases }, (_, i) => (
          <button
            key={i}
            style={{ background: i === cur.odd ? odd : base, outline: flash === i ? '3px solid var(--error)' : 'none' }}
            onClick={() => tap(i)}
          />
        ))}
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Trouvez la case légèrement différente. Un mauvais clic et c'est terminé !
      </p>
    </div>
  );
}
