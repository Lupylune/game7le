import { useState, type CSSProperties } from 'react';
import type { Entry } from '../lib/classement';
import { formatMs } from '../lib/time';
import { SymEtincelle, SymEtoile } from './GameIcon';
import SplitsRun from './SplitsRun';

/**
 * Ligne d'un classement (top 5 de l'accueil, classement complet). Si le run
 * a des splits (runs réels ou run local), un clic déplie le détail par
 * mini-jeu, comme sur l'écran de résultats.
 */
export default function LigneClassement({ e, rank }: { e: Entry; rank: number }) {
  const [ouvert, setOuvert] = useState(false);
  const depliable = !!e.lines?.length;

  const contenu = (
    <>
      <span className="rank">{rank}</span>
      <span className="name">
        {e.pseudo} {e.badge && <SymEtoile />}
        {e.me && ' (vous)'}
      </span>
      {e.jours != null && (
        <span className="jours">
          {e.jours} j
        </span>
      )}
      <span className="time">{formatMs(e.ms)}</span>
      <span>{e.flawless && <SymEtincelle />}</span>
      {depliable && (
        <svg className="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path
            d="M2 4l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  );

  return (
    <li
      className={`row${e.me ? ' me' : ''}${ouvert ? ' open' : ''}`}
      style={{ '--i': rank - 1 } as CSSProperties}
    >
      {depliable ? (
        <button
          type="button"
          className="row-main"
          aria-expanded={ouvert}
          onClick={() => setOuvert((v) => !v)}
        >
          {contenu}
        </button>
      ) : (
        <div className="row-main">{contenu}</div>
      )}
      {ouvert && e.lines && <SplitsRun lines={e.lines} />}
    </li>
  );
}
