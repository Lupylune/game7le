import type { CSSProperties } from 'react';
import type { JourSemaine } from '../lib/classement';
import { datesSemaine } from '../lib/classement';
import { formatMs } from '../lib/time';
import { SymEtincelle } from './GameIcon';

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/**
 * Détail jour par jour d'une entrée du classement hebdomadaire : les 7 jours de
 * la semaine (lundi → dimanche), le temps du run en direct de chaque jour, et un
 * repère sur le meilleur. Les jours non joués restent visibles (en creux) : ils
 * expliquent le classement, qui privilégie la régularité.
 */
export default function SplitsSemaine({ jours }: { jours: JourSemaine[] }) {
  if (jours.length === 0) return null;
  const parDate = new Map(jours.map((j) => [j.date, j]));
  // La semaine est celle des runs eux-mêmes : le détail reste juste dans les
  // archives comme sur la semaine en cours.
  const semaine = datesSemaine(jours[0].date);
  const meilleur = jours.reduce<JourSemaine | null>((b, j) => (!b || j.ms < b.ms ? j : b), null);
  return (
    <table className="run-splits">
      <tbody>
        {semaine.map((date, i) => {
          const j = parDate.get(date);
          const jour = JOURS[i];
          return (
            <tr key={date} style={{ '--i': i } as CSSProperties} className={j ? undefined : 'vide'}>
              <td>{jour.charAt(0).toUpperCase() + jour.slice(1)}</td>
              <td className="muted">{date.slice(8, 10)}/{date.slice(5, 7)}</td>
              <td className="duree">{j ? formatMs(j.ms) : '—'}</td>
              <td className="adj">
                {j?.flawless && <SymEtincelle />}
                {j && j === meilleur && jours.length > 1 && (
                  <span className="bonus" title="Meilleur temps de la semaine">
                    {' '}
                    record
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
