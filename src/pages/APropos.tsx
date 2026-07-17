export default function APropos() {
  return (
    <div className="prose">
      <h1>À propos</h1>
      <p>
        Game7le est une <strong>adaptation française non officielle</strong> de{' '}
        <a href="https://gauntle.com" target="_blank" rel="noopener noreferrer">
          gauntle.com
        </a>
        , le jeu de casse-têtes quotidien créé par Hannah : des mini-jeux enchaînés sous un
        chronomètre unique, les mêmes énigmes pour tout le monde chaque jour. Game7le s'en
        distingue par son format : <strong>7 épreuves tirées au sort chaque jour</strong>.
      </p>
      <h2>Comment ça marche ici</h2>
      <p>
        Cette version fonctionne <strong>entièrement dans votre navigateur</strong>, sans serveur ni
        compte :
      </p>
      <ul>
        <li>
          Les grilles du jour sont générées par un algorithme déterministe seedé sur la date — tous
          les visiteurs d'un même jour reçoivent les mêmes puzzles.
        </li>
        <li>Vos temps et votre historique sont stockés sous votre pseudo.</li>
        <li>
          Le classement mondial est simulé pour la démonstration ; seul votre temps est réel.
        </li>
      </ul>
      <h2>Gratuit, sans pub</h2>
      <p>
        Comme l'original : pas de publicité, pas d'inscription obligatoire, pas de collecte de
        données.
      </p>
      <h2>Technique</h2>
      <p className="muted">
        React + TypeScript + Vite. Générateurs et solveurs embarqués pour le sudoku, le démineur
        (grilles sans pari), le nonogramme, Paire et Reines — chaque grille est vérifiée à solution
        unique avant de vous être servie.
      </p>
      <h2>Sources lexicales</h2>
      <p className="muted">
        Les mots de « Le Mot », « Mélimélo » et des « Mini Croisés » proviennent de{' '}
        <a href="http://www.lexique.org" target="_blank" rel="noopener noreferrer">
          Lexique 3.83
        </a>{' '}
        (New &amp; Pallier, CC BY-SA). Les définitions servant d'indices aux mots croisés sont
        extraites du{' '}
        <a href="https://fr.wiktionary.org" target="_blank" rel="noopener noreferrer">
          Wiktionnaire
        </a>{' '}
        (CC BY-SA 4.0). Les grilles de croisés sont assemblées dynamiquement à partir de ce lexique
        — plus d'un millier de mots indicés. Les puzzles d'échecs proviennent de la{' '}
        <a href="https://database.lichess.org" target="_blank" rel="noopener noreferrer">
          base ouverte Lichess
        </a>{' '}
        (licence CC0).
      </p>
    </div>
  );
}
