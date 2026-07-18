import { JEUX, JEUX_DEFI } from '../games';
import GameIcon, { SymEtincelle } from '../components/GameIcon';

export default function CommentJouer() {
  return (
    <div className="prose">
      <h1>Comment jouer</h1>
      <p>
        Game7le est un défi quotidien : <strong>7 épreuves consécutives, tirées au sort chaque
        jour parmi les {JEUX.length} mini-jeux</strong>, sous un seul chronomètre global. Tout le
        monde reçoit le même tirage et les mêmes énigmes ; l'objectif est de finir avec le temps
        total le plus bas.
      </p>
      <ul>
        <li>
          Les <span className="bonus">bonus</span> (vert) réduisent votre temps total.
        </li>
        <li>
          Les <span className="malus">pénalités</span> (rouge) l'augmentent.
        </li>
        <li>
          Le chronomètre tourne sans interruption pendant les épreuves ; il se met en pause
          pendant les 3 secondes de transition entre deux épreuves (verdict + compte à rebours).
        </li>
        <li>
          La plupart des jeux peuvent être <strong>passés</strong> après 30 secondes, moyennant une
          pénalité de +90 s (sauf mention contraire).
        </li>
      </ul>

      <h2>Les {JEUX.length} mini-jeux du tirage</h2>
      {JEUX.map((j, i) => (
        <div className="rule-card" key={j.id}>
          <h3>
            {i + 1}. <GameIcon id={j.id} /> {j.nom}
          </h3>
          <p>{j.regles}</p>
          <p className="scoring">
            {j.scoring}
            {j.skip
              ? ` · passer : +${j.skip.penaliteS} s après ${j.skip.apresS} s`
              : ' · impossible à passer'}
          </p>
        </div>
      ))}

      <h2>Le défi difficile de la semaine</h2>
      <p>
        Chaque semaine (du lundi au dimanche), un second parcours vous attend : <strong>7 épreuves
        corsées tirées au sort parmi {JEUX_DEFI.length} mini-jeux</strong> (sans Paire, Ratiole ni
        Tracé), avec des variantes relevées — mot de 8 lettres, sudoku 9×9 avare en indices,
        nonogramme 15×15, 8 reines, 16 cases au Chromal, mots croisés au vocabulaire plus rare,
        phrase doublée à la Dactylo, mats d'échecs mieux cotés, Mélimélo à 8 lettres. Y passer une
        épreuve coûte <strong>+3 min</strong> (contre +90 s au quotidien), et les pénalités
        d'échec y sont ajustées (Le Mot raté : +90 s ; élimination au Chromal un peu plus
        clémente, la case étant plus dure à repérer parmi 16). Même tirage pour tout le monde, un
        classement dédié, et seule la première tentative de la semaine compte.
      </p>

      <h2>
        <SymEtincelle size={20} /> Mode SANS-FAUTE <SymEtincelle size={20} />
      </h2>
      <p>
        Bouclez l'intégralité du parcours en moins de 5 minutes (8 minutes pour le défi
        difficile), en réussissant chaque épreuve, sans pénalité ni révélation. Le badge s'affiche
        à côté de votre temps.
      </p>
    </div>
  );
}
