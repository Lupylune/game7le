import type { CSSProperties, ReactNode } from 'react';
import { seededRng, pick } from '../lib/rng';
import { JEU_PAR_ID } from '../games';
import { SOL5, SOL6, DICO6, SOL8, DICO8 } from '../data/lexique';
import { CROISES } from '../data/croises';
import { genCroise } from '../lib/croisesgen';
import { generate as genPaire } from '../games/Paire';
import { generate as genSudoku } from '../games/Sudoku';
import { generate as genReines } from '../games/Reines';
import { generate as genNono } from '../games/Nonogramme';
import { solutionEchecs } from '../games/Echecs';
import { cibleDe } from '../games/Atlas';
import GameIcon, { SymCouronne } from './GameIcon';

/**
 * Solutions des épreuves du jour, régénérées depuis le même seed que le run —
 * rien n'est stocké. Certains jeux n'ont pas de solution affichable :
 * Chromal/Tracé/Ratiole/Dactylo (rien à révéler) et Démineur (la grille dépend
 * du premier clic du joueur).
 */

const norm = (w: string) => w.split('').sort().join('');

function MiniGrille({
  n,
  cells,
}: {
  n: number;
  cells: { contenu?: ReactNode; style?: CSSProperties; classe?: string }[];
}) {
  return (
    <div className="cellgrid mini" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {cells.map((c, i) => (
        <div key={i} className={`cell ${c.classe ?? ''}`} style={c.style}>
          {c.contenu}
        </div>
      ))}
    </div>
  );
}

function solutionDe(id: string, date: string, defi: boolean): ReactNode | null {
  const rng = seededRng(`game7le:${defi ? 'defi:' : ''}${date}:${id}`);
  switch (id) {
    case 'lemot':
      return <p className="solution-mot">{pick(rng, defi ? SOL8 : SOL5)}</p>;
    case 'croises': {
      const puzzle = genCroise(rng, defi) ?? CROISES[Math.floor(rng() * CROISES.length)];
      return (
        <MiniGrille
          n={5}
          cells={puzzle.grille
            .join('')
            .split('')
            .map((ch) => (ch === '#' ? { classe: 'noir' } : { contenu: ch }))}
        />
      );
    }
    case 'paire': {
      const { sol } = genPaire(rng);
      return <MiniGrille n={6} cells={sol.map((v) => ({ contenu: v === 0 ? '★' : '●' }))} />;
    }
    case 'sudoku': {
      const { geo, sol, puzzle } = genSudoku(rng, defi);
      return (
        <MiniGrille
          n={geo.N}
          cells={sol.map((v, i) => ({ contenu: v, classe: puzzle[i] !== 0 ? 'given' : '' }))}
        />
      );
    }
    case 'reines': {
      const { N, regions, sol } = genReines(rng, defi);
      return (
        <MiniGrille
          n={N}
          cells={regions.map((reg, i) => ({
            contenu: sol.has(i) ? <SymCouronne size={14} /> : '',
            style: { background: `color-mix(in srgb, var(--queens-r${reg + 1}) 55%, var(--bg))` },
          }))}
        />
      );
    }
    case 'nonogramme': {
      const { N, pattern } = genNono(rng, defi);
      return (
        <MiniGrille
          n={N}
          cells={pattern.map((v) => ({ style: v === 1 ? { background: 'var(--text)' } : undefined }))}
        />
      );
    }
    case 'melimelo': {
      const cible = pick(rng, defi ? SOL8 : SOL6);
      const dico = defi ? DICO8 : DICO6;
      const mots = dico.filter((w) => norm(w) === norm(cible));
      return <p className="solution-mot">{mots.join(' / ')}</p>;
    }
    case 'echecs':
      return <p className="solution-mot">{solutionEchecs(rng, defi)}</p>;
    case 'atlas': {
      const { ville } = cibleDe(rng);
      return (
        <p className="solution-mot">
          {ville.nom} — {ville.pays}
        </p>
      );
    }
    default:
      return null;
  }
}

export default function Solutions({
  date,
  ids,
  defi = false,
}: {
  date: string;
  ids: string[];
  defi?: boolean;
}) {
  return (
    <div className="solutions">
      {ids.map((id) => {
        const contenu = solutionDe(id, date, defi);
        const jeu = JEU_PAR_ID.get(id);
        if (!jeu || !contenu) return null; // jeux sans solution affichable
        return (
          <div className="solution-card" key={id}>
            <h4>
              <GameIcon id={id} size={16} /> {jeu.nom}
            </h4>
            {contenu}
          </div>
        );
      })}
    </div>
  );
}
