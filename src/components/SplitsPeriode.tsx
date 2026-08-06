import type { CSSProperties } from 'react';
import type { JourSemaine } from '../lib/classement';
import { formatMs, nomJour } from '../lib/time';
import { SymEtincelle } from './GameIcon';

/**
 * Détail d'une entrée des classements mensuel et général : les meilleurs runs
 * de la période, du plus rapide au plus lent. Contrairement au détail
 * hebdomadaire on ne peut pas lister tous les jours (un mois, voire toute
 * l'histoire du jeu) : la liste est tronquée et `total` rappelle le nombre réel
 * de jours joués, qui est ce qui décide du classement.
 */
export default function SplitsPeriode({
  jours,
  total,
}: {
  jours: JourSemaine[];
  total?: number;
}) {
  if (jours.length === 0) return null;
  const tries = [...jours].sort((x, y) => x.ms - y.ms);
  const restants = (total ?? jours.length) - tries.length;
  return (
    <table className="run-splits">
      <tbody>
        {tries.map((j, i) => (
          <tr key={j.date} style={{ '--i': i } as CSSProperties}>
            <td>{nomJour(j.date)}</td>
            <td className="muted">
              {j.date.slice(8, 10)}/{j.date.slice(5, 7)}/{j.date.slice(2, 4)}
            </td>
            <td className="duree">{formatMs(j.ms)}</td>
            <td className="adj">
              {j.flawless && <SymEtincelle />}
              {i === 0 && tries.length > 1 && (
                <span className="bonus" title="Meilleur temps de la période">
                  {' '}
                  record
                </span>
              )}
            </td>
          </tr>
        ))}
        {restants > 0 && (
          <tr className="vide" style={{ '--i': tries.length } as CSSProperties}>
            <td colSpan={4}>
              + {restants} autre{restants > 1 ? 's' : ''} jour{restants > 1 ? 's' : ''} joué
              {restants > 1 ? 's' : ''}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
