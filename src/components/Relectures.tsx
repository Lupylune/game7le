import { useMemo } from 'react';
import { GLYPHES, estBlanche, lectureEchecs } from '../games/Echecs';
import { DecorPlateau } from '../games/Ricochet';
import { COULEURS, TEINTES, colDe, deplace, ligneDe, type Enigme } from '../lib/ricochet';
import { useLecture } from '../lib/useLecture';

/**
 * Relectures animées des solutions (écran de résultats), à la manière d'un GIF :
 * la ligne joue en boucle sur le vrai plateau, et se met en pause dès qu'on la
 * parcourt à la main. Le texte des coups reste affiché dessous — l'animation ne
 * remplace pas la lecture, elle l'illustre.
 */

function Commandes({
  lecture,
  dernier,
  libelle,
}: {
  lecture: ReturnType<typeof useLecture>;
  dernier: number;
  libelle: string;
}) {
  return (
    <div className="relecture-commandes">
      <button
        type="button"
        className="btn btn-sm"
        onClick={lecture.precedent}
        disabled={lecture.etape === 0}
        aria-label="Coup précédent"
      >
        ‹
      </button>
      <button
        type="button"
        className="btn btn-sm"
        onClick={lecture.basculer}
        aria-label={lecture.enLecture ? 'Mettre en pause' : 'Lire en boucle'}
      >
        {lecture.enLecture ? '❚❚' : '▶'}
      </button>
      <button
        type="button"
        className="btn btn-sm"
        onClick={lecture.suivant}
        disabled={lecture.etape === dernier}
        aria-label="Coup suivant"
      >
        ›
      </button>
      <span className="muted relecture-etape" aria-live="polite">
        {libelle}
      </span>
    </div>
  );
}

export function RelectureEchecs({ rng, defi }: { rng: () => number; defi: boolean }) {
  const { joueurBlanc, etapes, coups } = useMemo(() => lectureEchecs(rng, defi), [rng, defi]);
  const dernier = etapes.length - 1;
  const lecture = useLecture(dernier);
  const { pieces, coup } = etapes[lecture.etape];
  // Même orientation que l'épreuve : les pièces du joueur en bas.
  const vue = (sq: number) => (joueurBlanc ? sq : 63 - sq);
  const camp = joueurBlanc ? 'Blancs' : 'Noirs';
  return (
    <div className="relecture">
      <div className="chess-board relecture-echiquier" aria-hidden>
        {Array.from({ length: 64 }, (_, k) => {
          const i = vue(k);
          const clair = (Math.floor(i / 8) + i) % 2 === 0;
          return (
            <div
              key={i}
              className={`chess-sq ${clair ? 'clair' : 'sombre'}${coup.includes(i) ? ' last' : ''}`}
            />
          );
        })}
        {pieces.map(({ id, p, sq }) => (
          <span
            key={id}
            className={`chess-piece relecture-piece ${estBlanche(p) ? 'w' : 'b'}`}
            style={{ '--col': vue(sq) % 8, '--lig': Math.floor(vue(sq) / 8) } as React.CSSProperties}
          >
            {GLYPHES[p.toLowerCase()]}
          </span>
        ))}
      </div>
      <Commandes
        lecture={lecture}
        dernier={dernier}
        libelle={
          lecture.etape === 0
            ? `Trait aux ${camp}`
            : lecture.etape === dernier
              ? 'Mat'
              : `Coup ${lecture.etape}/${dernier}`
        }
      />
      <p className="solution-mot">{coups.join(' · ')} (mat)</p>
    </div>
  );
}

export function RelectureRicochet({ enigme }: { enigme: Enigme }) {
  const { plateau, depart, manches } = enigme;
  const taille = plateau.taille;
  // Une étape par coup, toutes manches confondues : au défi, les cinq cibles
  // s'enchaînent sur le même plateau, robots laissés où la ligne les a mis.
  const etapes = useMemo(() => {
    const out = [{ robots: depart, manche: 0, robot: -1, de: -1 }];
    let robots = depart;
    manches.forEach((m, im) =>
      m.solution.forEach((c) => {
        const de = robots[c.robot];
        robots = deplace(plateau, robots, c.robot, c.dir) ?? robots;
        out.push({ robots, manche: im, robot: c.robot, de });
      }),
    );
    return out;
  }, [plateau, depart, manches]);
  const dernier = etapes.length - 1;
  const lecture = useLecture(dernier, 900);
  const { robots, manche, robot, de } = etapes[lecture.etape];
  const cible = manches[manche].cible;
  const centre = (pos: number) => [colDe(pos, taille) + 0.5, ligneDe(pos, taille) + 0.5];
  const coupDansManche =
    lecture.etape - manches.slice(0, manche).reduce((n, m) => n + m.solution.length, 0);
  const fleches = { haut: '↑', droite: '→', bas: '↓', gauche: '←' } as const;
  return (
    <div className="relecture">
      <svg
        className="ric-plateau relecture-ricochet"
        viewBox={`-0.15 -0.15 ${taille + 0.3} ${taille + 0.3}`}
        aria-hidden
      >
        <DecorPlateau plateau={plateau} cible={cible} />
        {robot >= 0 && (
          <line
            key={lecture.etape}
            className="ric-trajet relecture-trajet"
            x1={centre(de)[0]}
            y1={centre(de)[1]}
            x2={centre(robots[robot])[0]}
            y2={centre(robots[robot])[1]}
            stroke={TEINTES[COULEURS[robot]]}
          />
        )}
        {robots.map((pos, i) => (
          <g
            key={i}
            className="ric-robot relecture-robot"
            transform={`translate(${colDe(pos, taille)} ${ligneDe(pos, taille)})`}
          >
            <circle className="ric-ombre" cx={0.5} cy={0.58} r={0.33} />
            <circle cx={0.5} cy={0.5} r={0.33} fill={TEINTES[COULEURS[i]]} />
            <circle className="ric-reflet" cx={0.41} cy={0.41} r={0.1} />
          </g>
        ))}
      </svg>
      <Commandes
        lecture={lecture}
        dernier={dernier}
        libelle={[
          manches.length > 1 && `Cible ${manche + 1}/${manches.length}`,
          lecture.etape === 0
            ? 'Départ'
            : `coup ${coupDansManche}/${manches[manche].solution.length}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      {manches.map((m, im) => (
        <p className="solution-coups" key={im}>
          {manches.length > 1 && (
            <span className="solution-coup muted">
              {m.cible.symbole} {im + 1}/{manches.length}
            </span>
          )}
          {m.solution.map((c, i) => (
            <span key={i} className="solution-coup" style={{ color: TEINTES[COULEURS[c.robot]] }}>
              {COULEURS[c.robot]} {fleches[c.dir]}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
