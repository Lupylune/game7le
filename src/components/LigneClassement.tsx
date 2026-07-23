import { useEffect, useState, type CSSProperties } from 'react';
import type { Entry } from '../lib/classement';
import { formatMs } from '../lib/time';
import { SymEtincelle, SymEtoile } from './GameIcon';
import { BadgePicto } from './BadgeIcon';
import { parseToken } from '../lib/badges';
import SplitsRun from './SplitsRun';

/**
 * Ligne d'un classement (top 5 de l'accueil, classement complet). Si le run
 * a des splits (runs réels ou run local), un clic déplie le détail par
 * mini-jeu, comme sur l'écran de résultats.
 *
 * Le détail n'est consultable que si l'on a soi-même terminé le défi
 * correspondant (`deverrouille`) ; sinon, un clic affiche un petit message
 * invitant à finir le défi d'abord.
 */
export default function LigneClassement({
  e,
  rank,
  deverrouille = true,
  messageVerrou,
  champion,
}: {
  e: Entry;
  rank: number;
  deverrouille?: boolean;
  messageVerrou?: string;
  /** Pseudo du·de la champion·ne de la semaine : effet spécial sur son nom. */
  champion?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [verrouAffiche, setVerrouAffiche] = useState(false);
  const depliable = !!e.lines?.length;
  const verrouille = depliable && !deverrouille;

  useEffect(() => {
    if (!verrouAffiche) return;
    const t = setTimeout(() => setVerrouAffiche(false), 2600);
    return () => clearTimeout(t);
  }, [verrouAffiche]);

  function onClic() {
    if (verrouille) {
      setVerrouAffiche(true);
    } else {
      setOuvert((v) => !v);
    }
  }

  const contenu = (
    <>
      <span className={`rank${rank <= 3 ? ` rank-${rank}` : ''}`}>{rank}</span>
      <span className="name">
        {parseToken(e.badge) ? (
          <BadgePicto token={e.badge} size={16} />
        ) : (
          e.badge && <SymEtoile />
        )}{' '}
        <span className={champion && e.pseudo === champion ? 'lb-champion' : undefined}>
          {e.pseudo}
        </span>
        {e.me && ' (vous)'}
      </span>
      {e.jours != null && (
        <span className="jours">
          {e.jours} j
        </span>
      )}
      <span className="time">{formatMs(e.ms)}</span>
      <span>{e.flawless && <SymEtincelle />}</span>
      {depliable &&
        (verrouille ? (
          <svg className="cadenas" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <rect x="2.5" y="5.5" width="7" height="5" rx="1" fill="currentColor" />
            <path
              d="M4 5.5V4a2 2 0 0 1 4 0v1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
        ) : (
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
        ))}
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
          aria-expanded={verrouille ? undefined : ouvert}
          onClick={onClic}
        >
          {contenu}
        </button>
      ) : (
        <div className="row-main">{contenu}</div>
      )}
      {verrouAffiche && (
        <div className="row-verrou" role="status">
          {messageVerrou ?? 'Terminez le défi pour voir le détail des temps.'}
        </div>
      )}
      {ouvert && !verrouille && e.lines && <SplitsRun lines={e.lines} />}
    </li>
  );
}
