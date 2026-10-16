import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { seededRng, pick } from '../lib/rng';
import { JEU_PAR_ID } from '../games';
import { SOL5, SOL6, DICO6, SOL8, DICO8 } from '../data/lexique';
import { CROISES } from '../data/croises';
import { genCroise } from '../lib/croisesgen';
import { generate as genPaire } from '../games/Paire';
import { generate as genSudoku } from '../games/Sudoku';
import { generate as genReines } from '../games/Reines';
import { generate as genNono } from '../games/Nonogramme';
import { cibleDe } from '../lib/geo';
import { genRicochet } from '../lib/ricochet';
import { POKEMONS } from '../data/pokemon';
import GameIcon, { SymCouronne } from './GameIcon';
import HauteurFluide from './HauteurFluide';
import { RelectureEchecs, RelectureRicochet } from './Relectures';

/**
 * Solutions des épreuves du jour, régénérées depuis le même seed que le run —
 * rien n'est stocké. Certains jeux n'ont pas de solution affichable :
 * Chromal/Tracé/Ratiole/Dactylo/Tempo (rien à révéler) et Démineur (la grille
 * dépend du premier clic du joueur).
 */

/** Jeux sans solution affichable (voir ci-dessus) — en phase avec `solutionDe`. */
const SANS_SOLUTION = new Set(['chromal', 'trace', 'ratiole', 'dactylo', 'tempo', 'demineur']);

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
      // Mêmes classes que le plateau : la carte de solution se lit avec le
      // même code couleur (cf. --paire-etoile / --paire-rond).
      return (
        <MiniGrille
          n={6}
          cells={sol.map((v) => ({
            contenu: (
              <span className={`paire-sym ${v === 0 ? 'star' : 'circle'}`}>{v === 0 ? '★' : '●'}</span>
            ),
          }))}
        />
      );
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
      return <RelectureEchecs rng={rng} defi={defi} />;
    case 'atlas': {
      const { ville } = cibleDe(rng);
      return (
        <p className="solution-mot">
          {ville.nom} — {ville.pays}
        </p>
      );
    }
    case 'pokedle': {
      const p = pick(rng, POKEMONS);
      return (
        <p className="solution-mot solution-pokemon">
          <img
            className="pokedle-sprite"
            src={`${import.meta.env.BASE_URL}sprites/pokemon/${p.num}.png`}
            alt={p.nom}
          />
          {p.nom}
        </p>
      );
    }
    case 'ricochet':
      // Une des lignes optimales, rejouée sur le plateau — au défi, les cinq
      // cibles enchaînées. Les manches suivantes partent des positions laissées
      // par cette ligne-là : c'est la référence, pas forcément le chemin qu'a
      // pris le joueur.
      return <RelectureRicochet enigme={genRicochet(rng, defi)} />;
    default:
      return null;
  }
}

function Carte({ id, date, defi }: { id: string; date: string; defi: boolean }) {
  const contenu = solutionDe(id, date, defi);
  const jeu = JEU_PAR_ID.get(id);
  if (!jeu || !contenu) return null;
  return (
    <div className="solution-card">
      <h4>
        <GameIcon id={id} size={16} /> {jeu.nom}
      </h4>
      {contenu}
    </div>
  );
}

/**
 * Une solution à la fois, choisie par un onglet à pictogramme (la première
 * épreuve par défaut) : seule la solution affichée est générée et montée.
 */
function SolutionsOnglets({ date, ids, defi }: { date: string; ids: string[]; defi: boolean }) {
  const dispo = ids.filter((id) => JEU_PAR_ID.has(id) && !SANS_SOLUTION.has(id));
  const [actif, setActif] = useState(0);
  // La solution suivante glisse depuis le côté de l'onglet choisi
  const [sens, setSens] = useState(1);
  if (dispo.length === 0) return null;
  const i = Math.min(actif, dispo.length - 1);
  const choisir = (j: number) => {
    setSens(j >= i ? 1 : -1);
    setActif(j);
  };

  // ←/→ parcourent les onglets, comme une barre d'onglets native
  const clavier = (e: KeyboardEvent) => {
    const pas = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const j = (i + pas + dispo.length) % dispo.length;
    choisir(j);
    (e.currentTarget.children[j] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="solutions solutions-a-onglets">
      <div className="solutions-onglets" role="tablist" aria-label="Épreuves" onKeyDown={clavier}>
        {dispo.map((id, j) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`onglet-solution-${id}`}
            aria-selected={j === i}
            aria-controls="solution-active"
            aria-label={JEU_PAR_ID.get(id)!.nom}
            title={JEU_PAR_ID.get(id)!.nom}
            tabIndex={j === i ? 0 : -1}
            className={`solutions-onglet${j === i ? ' actif' : ''}`}
            onClick={() => choisir(j)}
          >
            <GameIcon id={id} size={22} />
          </button>
        ))}
      </div>
      <HauteurFluide className="solutions-panneau">
        <div
          id="solution-active"
          role="tabpanel"
          aria-labelledby={`onglet-solution-${dispo[i]}`}
          style={{ '--sens': sens } as CSSProperties}
        >
          <Carte key={dispo[i]} id={dispo[i]} date={date} defi={defi} />
        </div>
      </HauteurFluide>
    </div>
  );
}

export default function Solutions({
  date,
  ids,
  defi = false,
  onglets = false,
}: {
  date: string;
  ids: string[];
  defi?: boolean;
  /** Une solution à la fois, derrière des onglets à pictogramme. */
  onglets?: boolean;
}) {
  if (onglets) return <SolutionsOnglets date={date} ids={ids} defi={defi} />;
  return (
    <div className="solutions">
      {ids.map((id) => (
        <Carte key={id} id={id} date={date} defi={defi} />
      ))}
    </div>
  );
}
