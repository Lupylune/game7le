import type { CSSProperties } from 'react';
import type { GameLine } from '../lib/storage';
import { formatAdjust } from '../lib/time';

/**
 * Tableau des splits d'un run : une ligne par mini-jeu (nom, détail,
 * bonus/malus). Même rendu sur l'écran de résultats et dans le classement.
 */
export default function SplitsRun({ lines }: { lines: GameLine[] }) {
  return (
    <table className="run-splits">
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.id} style={{ '--i': i } as CSSProperties}>
            <td>{l.nom}</td>
            <td className="muted">{l.detail}</td>
            <td className={`adj ${l.adjustMs < 0 ? 'bonus' : l.adjustMs > 0 ? 'malus' : ''}`}>
              {l.adjustMs === 0 ? '—' : formatAdjust(l.adjustMs)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
