import { useMemo, useRef, useState } from 'react';
import type { GameProps } from './types';

const LEVELS = 10;

export default function Chromal({ rng, onDone }: GameProps) {
  // Pré-génère les 10 niveaux : couleur de base, case différente, écart décroissant
  const levels = useMemo(
    () =>
      Array.from({ length: LEVELS }, (_, lvl) => {
        const h = Math.floor(rng() * 360);
        const s = 45 + Math.floor(rng() * 30);
        const l = 40 + Math.floor(rng() * 25);
        const delta = Math.max(2, 14 - lvl * 1.3); // de ±14 % à ±2 % de luminosité
        const odd = Math.floor(rng() * 6);
        const sign = rng() < 0.5 ? 1 : -1;
        return { h, s, l, delta: delta * sign, odd };
      }),
    [rng],
  );
  const [level, setLevel] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const doneRef = useRef(false);

  function finish(completed: number) {
    if (doneRef.current) return;
    doneRef.current = true;
    const adjustMs = completed === LEVELS ? -15000 : Math.round((35 - completed * 5) * 1000);
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
      <div className="chromal-grid" key={level}>
        {Array.from({ length: 6 }, (_, i) => (
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
