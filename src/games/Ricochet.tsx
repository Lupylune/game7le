import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COULEURS,
  DIRECTIONS,
  MUR,
  TEINTES,
  TEINTE_VORTEX,
  cibleAtteinte,
  colDe,
  deplace,
  genRicochet,
  glisse,
  ligneDe,
  trouveSolution,
  type Cible,
  type Coup,
  type Direction,
  type Plateau,
} from '../lib/ricochet';
import type { GameProps } from './types';

/** Pénalités : un coup de trop, un indice, un retour au départ. */
const PENALITE_COUP = 10000;
const PENALITE_INDICE = 15000;
const PENALITE_RESET = 10000;
const BONUS = -15000;

const FLECHES: Record<Direction, string> = {
  haut: '↑',
  droite: '→',
  bas: '↓',
  gauche: '←',
};

const TOUCHES: Record<string, Direction> = {
  ArrowUp: 'haut',
  ArrowRight: 'droite',
  ArrowDown: 'bas',
  ArrowLeft: 'gauche',
};

/** Teinte d'une cible, vortex compris. */
function teinteCible(cible: Cible): string {
  return cible.robot === null ? TEINTE_VORTEX : TEINTES[COULEURS[cible.robot]];
}

/** Libellé du robot attendu sur une cible. */
function robotAttendu(cible: Cible): string {
  return cible.robot === null ? 'n’importe quel robot' : `le robot ${COULEURS[cible.robot]}`;
}

/**
 * Convertit les masques de murs en segments dessinables, sans doublon entre
 * voisins : sud et est ne sont tracés qu'en bordure, ailleurs le voisin porte
 * déjà le trait.
 */
function segments(plateau: Plateau): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  const { taille, murs } = plateau;
  for (let pos = 0; pos < taille * taille; pos++) {
    const m = murs[pos] ?? 0;
    const x = colDe(pos, taille);
    const y = ligneDe(pos, taille);
    if (m & MUR.nord) out.push([x, y, x + 1, y]);
    if (m & MUR.ouest) out.push([x, y, x, y + 1]);
    if (m & MUR.sud && y === taille - 1) out.push([x, y + 1, x + 1, y + 1]);
    if (m & MUR.est && x === taille - 1) out.push([x + 1, y, x + 1, y + 1]);
  }
  return out;
}

export default function Ricochet({ rng, difficile, onAdjust, onDone }: GameProps) {
  const enigme = useMemo(() => genRicochet(rng, difficile), [rng, difficile]);
  const { plateau, depart, cible, optimal, solution } = enigme;
  const taille = plateau.taille;

  const [robots, setRobots] = useState<number[]>(depart);
  const [coups, setCoups] = useState(0);
  // Aucun robot présélectionné : l'énigme commence par le choix du robot à
  // bouger, pas par un plateau déjà en mode déplacement.
  const [sel, setSel] = useState<number | null>(null);
  const [indice, setIndice] = useState<Coup | null>(null);
  // Indice demandé depuis une position trop éloignée pour être résolue à temps
  const [tropLoin, setTropLoin] = useState(false);
  // Les coups joués suivent-ils encore la solution optimale connue ? tant que
  // oui, l'indice est immédiat ; sinon il faut résoudre depuis la position.
  const [surChemin, setSurChemin] = useState(true);
  const doneRef = useRef(false);
  // Le joueur s'est-il fait aider ? signalé dans le verdict final
  const aideRef = useRef(false);

  const murs = useMemo(() => segments(plateau), [plateau]);

  /** Cases d'arrivée du robot sélectionné, une par direction où il n'est pas bloqué. */
  const arrivees = useMemo(() => {
    if (sel === null) return [];
    const occupees = new Set(robots.filter((_, i) => i !== sel));
    return DIRECTIONS.map((dir) => ({ dir, pos: glisse(plateau, occupees, robots[sel], dir) })).filter(
      (m) => m.pos !== robots[sel],
    );
  }, [sel, robots, plateau]);

  function joue(robot: number, dir: Direction) {
    if (doneRef.current) return;
    // Un coup qui ne déplace aucun robot (déjà bloqué) n'est pas décompté.
    const suite = deplace(plateau, robots, robot, dir);
    if (!suite) return;

    const n = coups + 1;
    setRobots(suite);
    setCoups(n);
    setSel(robot);
    setIndice(null);
    setSurChemin(
      surChemin &&
        coups < solution.length &&
        solution[coups].robot === robot &&
        solution[coups].dir === dir,
    );
    if (n > optimal) {
      aideRef.current = true;
      onAdjust(PENALITE_COUP, 'Coup supplémentaire');
    }

    if (cibleAtteinte(cible, suite)) {
      doneRef.current = true;
      const marge = n - optimal;
      setTimeout(
        () =>
          onDone({
            adjustMs: BONUS,
            detail:
              marge > 0
                ? `résolu en ${n} coups (optimum : ${optimal})`
                : aideRef.current
                  ? `résolu à l’optimum, avec un indice`
                  : `résolu en ${n} coups, l’optimum`,
            status: 'success',
          }),
        400,
      );
    }
  }

  // Déplacement au clavier : flèches sur le robot sélectionné. Sans tableau de
  // dépendances, l'écouteur est réinstallé à chaque rendu — il doit fermer sur
  // les positions courantes, qui changent à chaque coup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = TOUCHES[e.key];
      if (!dir || sel === null || doneRef.current) return;
      e.preventDefault();
      joue(sel, dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /**
   * Prochain coup d'une solution optimale. Tant que le joueur suit la solution
   * connue, c'est une simple lecture ; s'il s'en est écarté, on résout depuis sa
   * position — recherche bornée en profondeur et en budget pour garder
   * l'interface réactive. Une position trop éloignée ne rend donc rien, et n'est
   * alors pas facturée plutôt que de faire payer +15 s pour un silence.
   */
  function montreIndice() {
    if (doneRef.current || indice) return;
    const coup =
      surChemin && coups < solution.length
        ? solution[coups]
        : (trouveSolution(plateau, robots, cible, optimal + 3, 1_200_000) ?? [])[0];
    if (!coup) {
      setTropLoin(true);
      setTimeout(() => setTropLoin(false), 3000);
      return;
    }
    onAdjust(PENALITE_INDICE, 'Indice');
    aideRef.current = true;
    setSel(coup.robot);
    setIndice(coup);
    setTimeout(() => setIndice(null), 3000);
  }

  function recommence() {
    if (doneRef.current || coups === 0) return;
    onAdjust(PENALITE_RESET, 'Retour au départ');
    aideRef.current = true;
    setRobots(depart);
    setCoups(0);
    setSel(null);
    setIndice(null);
    setSurChemin(true);
  }

  return (
    <div className="game-area">
      <p className="ric-consigne">
        Amenez <strong style={{ color: teinteCible(cible) }}>{robotAttendu(cible)}</strong> sur{' '}
        <span className="ric-symbole" style={{ color: teinteCible(cible) }}>
          {cible.symbole}
        </span>{' '}
        · coups joués <strong className={coups > optimal ? 'malus' : ''}>{coups}</strong>
      </p>

      <svg
        className="ric-plateau"
        viewBox={`-0.15 -0.15 ${taille + 0.3} ${taille + 0.3}`}
        role="img"
        aria-label={`Plateau de ricochet ${taille}×${taille}`}
      >
        {Array.from({ length: taille * taille }, (_, pos) => (
          <rect
            key={pos}
            className={`ric-case${(ligneDe(pos, taille) + colDe(pos, taille)) % 2 === 0 ? ' pair' : ''}`}
            x={colDe(pos, taille)}
            y={ligneDe(pos, taille)}
            width={1}
            height={1}
            onClick={() => setSel(null)}
          />
        ))}

        <g className="ric-grille">
          {Array.from({ length: taille - 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i + 1} x2={taille} y2={i + 1} />
          ))}
          {Array.from({ length: taille - 1 }, (_, i) => (
            <line key={`v${i}`} x1={i + 1} y1={0} x2={i + 1} y2={taille} />
          ))}
        </g>

        {/* Bloc central infranchissable */}
        <rect
          className="ric-centre"
          x={taille / 2 - 1}
          y={taille / 2 - 1}
          width={2}
          height={2}
          rx={0.18}
        />

        {/* Les seize autres cibles restent visibles mais en retrait, comme sur
            le plateau physique : elles font partie du décor, pas de l'énigme. */}
        {plateau.cibles.map((c) => {
          const active = c.pos === cible.pos && c.robot === cible.robot;
          const teinte = teinteCible(c);
          const x = colDe(c.pos, taille);
          const y = ligneDe(c.pos, taille);
          return (
            <g key={`${c.pos}-${c.symbole}`} className={`ric-cible${active ? ' active' : ''}`}>
              {active && (
                <rect
                  className="ric-vise"
                  x={x + 0.02}
                  y={y + 0.02}
                  width={0.96}
                  height={0.96}
                  rx={0.2}
                  stroke={teinte}
                />
              )}
              <rect
                x={x + 0.08}
                y={y + 0.08}
                width={0.84}
                height={0.84}
                rx={0.16}
                fill={teinte}
                stroke={teinte}
              />
              <text x={x + 0.5} y={y + 0.5} fill={teinte}>
                {c.symbole}
              </text>
            </g>
          );
        })}

        <g className="ric-murs">
          {murs.map((s, i) => (
            <line key={i} x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} />
          ))}
        </g>
        <rect className="ric-bord" x={0} y={0} width={taille} height={taille} rx={0.1} />

        {/* Trajectoires et cases d'arrivée du robot sélectionné : on clique la
            case visée, comme aux échecs. */}
        {sel !== null &&
          arrivees.map((m) => {
            const teinte = TEINTES[COULEURS[sel]];
            const x1 = colDe(robots[sel], taille) + 0.5;
            const y1 = ligneDe(robots[sel], taille) + 0.5;
            const x2 = colDe(m.pos, taille) + 0.5;
            const y2 = ligneDe(m.pos, taille) + 0.5;
            const vise = indice?.robot === sel && indice.dir === m.dir;
            return (
              <g key={m.dir} className={`ric-vers${vise ? ' indique' : ''}`}>
                <line className="ric-trajet" x1={x1} y1={y1} x2={x2} y2={y2} stroke={teinte} />
                <g
                  className="ric-coup"
                  onClick={() => joue(sel, m.dir)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Déplacer vers ${m.dir}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') joue(sel, m.dir);
                  }}
                >
                  <rect
                    x={colDe(m.pos, taille)}
                    y={ligneDe(m.pos, taille)}
                    width={1}
                    height={1}
                    fill={teinte}
                  />
                  <rect
                    className="ric-focus"
                    x={colDe(m.pos, taille) + 0.06}
                    y={ligneDe(m.pos, taille) + 0.06}
                    width={0.88}
                    height={0.88}
                    rx={0.12}
                  />
                  <circle cx={x2} cy={y2} r={0.15} fill={teinte} />
                  <circle
                    className="ric-anneau"
                    cx={x2}
                    cy={y2}
                    r={0.38}
                    fill="none"
                    stroke={teinte}
                  />
                </g>
              </g>
            );
          })}

        {robots.map((pos, i) => (
          <g
            key={i}
            className={`ric-robot${sel === i ? ' sel' : ''}${indice?.robot === i ? ' indique' : ''}`}
            transform={`translate(${colDe(pos, taille)} ${ligneDe(pos, taille)})`}
            role="button"
            tabIndex={0}
            aria-label={`Robot ${COULEURS[i]}`}
            onClick={() => setSel(sel === i ? null : i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setSel(sel === i ? null : i);
            }}
          >
            <circle className="ric-ombre" cx={0.5} cy={0.58} r={0.33} />
            <circle cx={0.5} cy={0.5} r={0.33} fill={TEINTES[COULEURS[i]]} />
            <circle className="ric-reflet" cx={0.41} cy={0.41} r={0.1} />
            {sel === i && (
              <circle className="ric-halo" cx={0.5} cy={0.5} r={0.46} stroke={TEINTES[COULEURS[i]]} />
            )}
            <circle className="ric-focus" cx={0.5} cy={0.5} r={0.44} />
          </g>
        ))}
      </svg>

      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Un robot glisse jusqu’à un mur, le bloc central ou un autre robot · cliquez un robot puis sa
        case d’arrivée (ou les flèches du clavier) · chaque coup au-delà de la solution optimale : +10 s
        {indice && (
          <>
            {' '}
            · indice : robot <strong>{COULEURS[indice.robot]}</strong> vers{' '}
            <strong>{FLECHES[indice.dir]}</strong>
          </>
        )}
        {tropLoin && (
          <>
            {' '}
            · <strong>trop loin de la cible pour un indice</strong> — revenez au départ
          </>
        )}
      </p>

      <div className="game-actions">
        <button className="btn btn-sm" onClick={montreIndice}>
          Indice (+15 s)
        </button>
        <button className="btn btn-sm" onClick={recommence} disabled={coups === 0}>
          Recommencer (+10 s)
        </button>
      </div>
    </div>
  );
}
