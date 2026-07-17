import { Link } from 'react-router-dom';
import { todayStr } from '../lib/rng';
import { formatDateFr, formatMs } from '../lib/time';
import { meilleurParDate } from '../lib/stats';
import { useHistorique } from '../lib/useHistorique';
import { usePseudo } from '../lib/usePseudo';
import { SymEtincelle } from '../components/GameIcon';

/** Date de « lancement » de la réplique : les archives remontent jusque-là. */
const LANCEMENT = '2026-07-01';

function listDates(): string[] {
  const out: string[] = [];
  const today = todayStr();
  const d = new Date(today);
  for (;;) {
    const key = todayStr(d);
    if (key < LANCEMENT) break;
    out.push(key);
    d.setDate(d.getDate() - 1);
  }
  return out;
}

export default function Archives() {
  // Meilleur temps par jour, direct ou archive confondus.
  const runs = meilleurParDate(useHistorique(usePseudo()));
  const today = todayStr();

  return (
    <div className="prose" style={{ maxWidth: 560 }}>
      <h1>Archives</h1>
      <p className="muted">
        Rejouez les défis des jours précédents (chaque jour a son propre tirage de 7 épreuves).
        Les temps d'archive sont conservés (le meilleur
        temps par jour) mais seule la course du jour compte pour la série.
      </p>
      <ul className="archive-list">
        {listDates().map((date) => {
          const run = runs[date];
          return (
            <li key={date}>
              <span className="date">
                {formatDateFr(date)}
                {date === today && ' · aujourd’hui'}
              </span>
              {run ? (
                <>
                  <span className="time">
                    {formatMs(run.totalMs)} {run.flawless && <SymEtincelle size={14} />}
                  </span>
                  <Link className="btn btn-sm" to={`/jouer/${date}`}>
                    Rejouer
                  </Link>
                </>
              ) : (
                <Link className="btn btn-primary btn-sm" to={`/jouer/${date}`}>
                  Jouer
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
