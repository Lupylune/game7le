import type { CSSProperties } from 'react';
import type { GameLine } from '../lib/storage';
import { formatAdjust, formatMs } from '../lib/time';

/**
 * Tableau des splits d'un run : une ligne par mini-jeu (nom, détail, temps
 * passé, bonus/malus). Même rendu sur l'écran de résultats et dans le
 * classement. La durée manque sur les anciens runs (colonne vide).
 */
export default function SplitsRun({ lines }: { lines: GameLine[] }) {
  const avecDuree = lines.some((l) => l.ms != null);
  return (
    <table className="run-splits">
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.id} style={{ '--i': i } as CSSProperties}>
            <td>{l.nom}</td>
            <td className="muted">{l.detail}</td>
            {avecDuree && <td className="duree">{l.ms != null && formatMs(l.ms)}</td>}
            <td className={`adj ${l.adjustMs < 0 ? 'bonus' : l.adjustMs > 0 ? 'malus' : ''}`}>
              {l.adjustMs === 0 ? '—' : formatAdjust(l.adjustMs)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
