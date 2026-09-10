# Game7le

**🔗 [game7le.lupy.workers.dev](https://game7le.lupy.workers.dev)** · [dépôt GitHub](https://github.com/Lupylune/game7le)

Adaptation française non officielle de [gauntle.com](https://gauntle.com) : un défi quotidien de
**7 épreuves tirées au sort chaque jour parmi 17 mini-jeux**, enchaînées sous un chronomètre
unique. Le tirage et les énigmes sont identiques pour tous les joueurs d'un même jour (PRNG seedé
sur la date, aucun backend requis). Les bonus réduisent le temps total, les pénalités l'augmentent ;
l'objectif est de boucler le parcours le plus vite possible.

Chaque semaine s'y ajoute un **défi difficile** : 7 épreuves tirées dans un pool réduit, jouées en
variantes corsées, identiques pour tout le monde du lundi au dimanche.

---

## Sommaire

1. [Le run quotidien](#le-run-quotidien)
2. [Le défi difficile hebdomadaire](#le-défi-difficile-hebdomadaire)
3. [Les 17 mini-jeux](#les-17-mini-jeux)
4. [Déterminisme du tirage](#déterminisme-du-tirage)
5. [Pages](#pages)
6. [Progression : profil, badges, statistiques](#progression--profil-badges-statistiques)
7. [Stack et architecture](#stack-et-architecture)
8. [Backend Supabase (optionnel)](#backend-supabase-optionnel)
9. [Données générées](#données-générées)
10. [Commandes](#commandes)
11. [Configuration](#configuration)
12. [Déploiement](#déploiement)
13. [Tests](#tests)
14. [Ajouter un mini-jeu](#ajouter-un-mini-jeu)
15. [À propos, crédits et licences](#à-propos-crédits-et-licences)

---

## Le run quotidien

- **7 épreuves** tirées au sort parmi le pool du jour, dans un ordre identique pour tous.
- **Un seul chronomètre** court sur tout le parcours. Il se met en pause pendant l'écran de
  transition de 3 s intercalé entre deux épreuves (verdict de la précédente + décompte).
- Le chrono affiché est du **temps brut** ; bonus et pénalités s'accumulent dans une réserve
  séparée, affichée à côté, et ne sont fondus qu'au total final (`total = brut + ajustements`).
- **SANS-FAUTE** : les 7 épreuves réussies, sans la moindre pénalité (aide, vérification, erreur
  facturée). Recalculé à l'identique côté serveur.
- **Passer une épreuve** est possible après 45 s sur la plupart des jeux, contre une pénalité
  (souvent +90 s). Les épreuves à tentative unique (Ratiole, Tracé) ne peuvent pas être passées.
- **Run reprenable** : onglet fermé, rechargement ou navigation, la progression est retrouvée
  (« Reprendre le run »). L'épreuve en cours repart de zéro — l'état interne d'un mini-jeu n'est
  pas sérialisable — mais son temps écoulé et ses pénalités déjà facturées restent dus. Impossible
  de recommencer la journée à neuf.
- **Chrono masquable** (`/parametres`) pour jouer à l'aveugle : seul l'affichage disparaît, le
  calcul du temps et des pénalités est strictement identique.
- Un run **en direct** est la *première* tentative du jour de son puzzle. Toute reprise (archive ou
  rejouage le jour même) part dans le créneau « archive » et n'écrase jamais le run en direct : le
  classement du jour, la série et les stats du profil reflètent donc les premières tentatives.

## Le défi difficile hebdomadaire

`/defi` — 7 épreuves tirées dans un pool réduit (11 jeux la semaine en cours), jouées en variantes
plus dures. Le défi est identifié par le **lundi de la semaine courante** (Europe/Paris), donc
inchangé pendant sept jours. Il a son propre classement (`/classement?onglet=defi`), son propre
stockage local, et un seuil de SANS-FAUTE plus large (8 min contre 5).

Exemples de variantes : Le Mot et Mélimélo en 8 lettres, Sudoku 9×9 à 28 indices, Reines 8×8,
Nonogramme 15×15, Croisés en vocabulaire rare, Dactylo sur 24 mots, Échecs en mats plus cotés,
Pokédle toutes générations en 12 essais, Ricochet en solutions de 8 à 9 coups.

## Les 17 mini-jeux

| # | Jeu | Type | Génération / source | Défi difficile |
|---|-----|------|---------------------|----------------|
| 1 | Le Mot | Wordle FR, 5 lettres en 6 essais | Lexique 3.83 : 5 036 formes de validation, 1 097 solutions courantes | 8 lettres |
| 2 | Mini Croisés | mots croisés 5×5 | grilles assemblées à la volée depuis 655 lemmes indicés + 1 142 définitions Wiktionnaire | vocabulaire rare (534 lemmes) |
| 3 | Paire | type « Tango » 6×6 (★/●, `=`, `×`) | générateur + solveur, solution unique | — |
| 4 | Mini Sudoku | 6×6, blocs 2×3 | générateur + solveur, solution unique | 9×9, 28 indices |
| 5 | Reines | type « Queens » 6×6, régions colorées | générateur + solveur, solution unique | 8×8 |
| 6 | Démineur | 12×12, 20 mines | grilles vérifiées résolubles sans aucun pari | ✓ |
| 7 | Nonogramme | 8×8 | vérifié résoluble par pure logique de lignes | 15×15 |
| 8 | Ratiole | couper 3 formes au ratio cible | découpe de polygone (Sutherland–Hodgman), tentative unique | — |
| 9 | Mélimélo | anagramme de mémoire, 6 lettres | 741 cibles courantes, 9 815 formes acceptées | 8 lettres |
| 10 | Chromal | perception des couleurs, 10 niveaux | écart de luminosité décroissant | — |
| 11 | Tracé | reproduire une forme d'un seul trait | score par distance moyenne symétrique, tentative unique | — |
| 12 | Dactylo | recopier une phrase au plus vite | 8 mots tirés du lexique, fautes comptées | 24 mots |
| 13 | Échecs | mat en 1 à 3 coups | base Lichess (CC0) : 800 puzzles 700–1600 Elo | 601 puzzles corsés |
| 14 | Pokédle | deviner le Pokémon en 8 essais | PokeAPI, génération 1 (151), indices type / stade / couleur / habitat | 1 025 Pokémon, 12 essais, indice Génération |
| 15 | Atlas | panorama 360° + carte, à la GeoGuessr | pool de grandes villes + Mapillary et Leaflet chargés du CDN (seule épreuve à exiger le réseau) | — |
| 16 | Tempo | reproduire 5 durées de mémoire | durées tirées au sort, restitution par appui maintenu | sorti du pool le 2026-09-14 |
| 17 | Ricochet | Ricochet Robots 16×16 | plateau physique transcrit (12 quadrants), BFS complet, solution optimale de 6 à 8 coups | 8 à 9 coups |

Les jeux à solution cachée proposent un bouton **« Vérifier »** (les cases fausses clignotent en
rouge ~2 s, +5 s) plutôt qu'un bouton qui révèle la réponse — Sudoku, Paire, Nonogramme, Croisés,
Reines. Échecs propose un **« Indice »** qui surligne la pièce à jouer (+15 s) sans dévoiler la
ligne complète.

## Déterminisme du tirage

Tout ce qui doit être « le même puzzle pour tout le monde aujourd'hui » dérive d'un PRNG seedé par
une chaîne — `seededRng()` dans `src/lib/rng.ts` (hash xmur3 → mulberry32) :

- `game7le:${date}:selection` mélange le pool du jour et en garde 7 → l'ordre des épreuves ;
- `game7le:${date}:${jeu.id}` alimente chaque mini-jeu → le contenu du puzzle ;
- `game7le:defi:${lundi}:…` fait de même pour le défi hebdomadaire ;
- le mode entraînement seede sur un nonce aléatoire, pour varier à chaque tentative.

Aucune logique de jeu n'appelle `Math.random()` : le `rng` est passé en prop.

**Pools datés.** Chaque jeu porte une fenêtre `tirage` (et parfois `defi`) ; seul le pool réellement
en vigueur ce jour-là est mélangé. Ajouter ou retirer un mini-jeu ne réécrit donc **jamais** les
tirages passés, et les archives (`/jouer/:date`) restent identiques pour toujours. D'où deux règles
en touchant à `JEUX` : **ajouter en fin de tableau, ne jamais réordonner** (un retrait s'exprime
avec `retire`, pas en supprimant l'entrée), et faire commencer la fenêtre **après** la mise en
ligne.

## Pages

| Route | Contenu |
|-------|---------|
| `/` | accueil : run du jour, décompte, top 5, série en cours |
| `/jouer` | le run du jour |
| `/jouer/:date` | rejouer un jour passé (archive) |
| `/defi` | le défi difficile de la semaine |
| `/classement` | classements jour · semaine · mois · général · défi |
| `/statistiques` | statistiques globales de la communauté + les vôtres, avec graphiques |
| `/archives` | liste des jours passés |
| `/entrainement` et `/entrainement/:id` | mode libre, un jeu à la fois, sans chrono de run |
| `/profil` | stats personnelles, badges, série, rang estimé |
| `/comment-jouer` | règles |
| `/a-propos` | crédits et sources |
| `/parametres` | thème, pseudo, badge affiché, chrono visible |

## Progression : profil, badges, statistiques

- **Badges** (`src/lib/badges.ts`) : 11 succès calculés intégralement côté client depuis
  l'historique — Premiers pas, Sans-faute, En feu (série), Assidu, Centurion, Bolide, Numéro 1,
  Archiviste, Marathonien, Costaud (défi), Élite. Certains ont trois paliers bronze / argent / or.
  Le badge choisi s'affiche à gauche du pseudo.
- **Statistiques** (`/statistiques`) : tuiles de synthèse (runs, joueurs, moyenne et médiane, meilleur
  et pire run, part de sans-faute, taux de réussite / passe / échec, bonus contre pénalités
  cumulés) et une ligne par mini-jeu (moyenne, record, pire, « spécialiste », vos propres chiffres).
  Les temps par jeu ne comptent que les tentatives **réussies** — une épreuve passée ou ratée n'est
  pas une performance chronométrable — ce qui explique l'écart avec les totaux de run.
- **Graphiques** (`src/components/Graphes.tsx`) : SVG inline maison, sans dépendance de charting.
  Courbe de distribution des temps (densité lissée par KDE gaussien, jamais en remplacement des
  données brutes) et séries par jour. Conventions : le bleu `--chart-com` est **toujours** la
  communauté, le terracotta `--chart-moi` **toujours** vous ; chaque graphique embarque une infobulle
  **et** la navigation ←/→ **et** un tableau de données dépliable, pour qu'aucune valeur ne soit
  accessible au seul survol.

## Stack et architecture

- **Vite + React 19 + TypeScript**, hébergé en statique. Interface, commentaires de code et contenu
  intégralement en **français**.
- `src/games/*.tsx` — un composant autonome par mini-jeu, implémentant le contrat `GameProps` et
  déclaré comme `GameDef` dans `src/games/index.ts` :
  - `rng` : le générateur seedé, pour toute forme d'aléa ;
  - `difficile?` : la variante du défi hebdomadaire ;
  - `onAdjust(ms, label)` : signaler un bonus / malus intermédiaire (affiché en toast) sans
    terminer l'épreuve ;
  - `onDone(result)` : terminer, une seule fois, avec `adjustMs`, un `detail` lisible et un
    `status` (`success` / `fail` / `skip`).
- `src/pages/RunPage.tsx` — la machine à états du parcours (`intro` → `playing` → `results`), qui
  sert aussi les archives et le défi.
- `src/lib/` — RNG, stockage, classements, statistiques, badges, géo, générateur de croisés,
  solveur Ricochet, hooks.
- Temps, historique et réglages en **localStorage** ; le backend, quand il est configuré, n'est
  qu'un miroir.
- `GameIcon.tsx` dessine un pictogramme SVG par jeu (aucun emoji).

## Backend Supabase (optionnel)

Le jeu est **pleinement fonctionnel sans backend** : sans variables d'environnement, le client
Supabase vaut `null` et tout `src/lib/sync.ts` dégrade en no-op — on retombe sur le localStorage et
sur un peloton simulé (déterministe) pour le classement.

Configuré, il apporte le vrai classement mondial et un historique qui suit le pseudo d'un appareil
à l'autre. Deux tables, `comptes(pseudo)` et `runs(pseudo, date, en_direct, defi, total_ms, lines)`,
définies et verrouillées par RLS dans `supabase/schema.sql` (à passer une fois dans l'éditeur SQL
Supabase). Il n'y a **aucune authentification** — le pseudo est choisi librement, comme en local —
donc les écritures directes sont refusées : tout passe par la RPC `submit_run()` (`SECURITY
DEFINER`), qui ne remplace une ligne que si le temps est meilleur.

`submit_run()` ne fait confiance à rien de ce que le client envoie : format du pseudo, date dans
`[lancement … aujourd'hui]` (Europe/Paris), `total_ms` borné, `lines` = exactement 7 identifiants de
jeu connus et distincts avec des durées plausibles, statut « en direct » recalculé (le jour du
puzzle, première tentative), SANS-FAUTE recalculé depuis les lignes (le drapeau client ne peut que
l'enlever). S'y ajoute une limite par IP (20 soumissions et 5 nouveaux pseudos par heure), calibrée
pour qu'un foyer entier de joueurs légitimes ne la touche jamais.

## Données générées

`src/data/{lexique,definitions,echecs,pokemon}.ts` sont des **fichiers générés puis committés** — à
régénérer avec les scripts, jamais à éditer à la main. Rien n'est téléchargé au runtime : le jeu
chronométré reste instantané et hors-ligne (Atlas excepté).

- **Lexique 3.83** (lexique.org, CC BY-SA) via `scripts/build-lexique.mjs` : 142 000 formes du
  français avec fréquences, filtrées par longueur, propreté orthographique et fréquence
  films / livres. Le pool de Croisés est scindé en mots courants (grilles du jour) et plus rares
  (grilles du défi).
- **Wiktionnaire** (CC BY-SA 4.0) via `scripts/build-defs.mjs`, depuis le dump wiktextract de
  kaikki.org. Plutôt que de prendre la première définition d'une page, le script **note tous les
  sens** — et les préfixes obtenus en les coupant à des frontières syntaxiques sûres — pour retenir
  la formulation la plus courte et autonome du sens *principal*, puis masque le mot dans son propre
  indice. L'ensemble des clés est **gelé** : les grilles se construisent sur cette intersection,
  ajouter ou retirer un mot rebattrait toutes les grilles passées.
- **Lichess** (CC0) via `scripts/build-echecs.mjs` : tranche de la base de puzzles, filtrée aux
  mats sans promotion.
- **PokeAPI** via `scripts/build-pokemon.mjs` : nom français, type(s), couleur, habitat, génération,
  stade d'évolution. Les sprites des 1 025 Pokémon vivent dans `public/sprites/pokemon/`.

## Commandes

```bash
npm install
npm run dev       # serveur de développement
npm run build     # tsc -b && vite build → dist/
npm run preview   # sert le build de production (port 4183 pour les tests)
npm run lint      # oxlint
npm test          # tests Playwright : fumée + parcours complet
                  # (nécessite `npm run preview` actif au préalable)

npm run lexique   # régénère src/data/{lexique,definitions}.ts (Lexique 3.83 + Wiktionnaire)
npm run echecs    # régénère src/data/echecs.ts (base Lichess)
npm run pokemon   # régénère src/data/pokemon.ts (PokeAPI, toutes générations)
```

La version de Node est épinglée par `.node-version` (nodenv) ; si `node`/`npm` manquent dans un
shell, lancer `eval "$(nodenv init -)"`.

## Configuration

Copier `.env.example` vers `.env`. Toutes les variables sont **optionnelles** :

| Variable | Rôle | Sans elle |
|----------|------|-----------|
| `VITE_SUPABASE_URL` | URL du projet Supabase | classement simulé, historique local seulement |
| `VITE_SUPABASE_ANON_KEY` | clé anonyme publique | idem |
| `VITE_MAPILLARY_TOKEN` | jeton Mapillary (gratuit) pour Atlas | Atlas reste jouable, mais sans le panorama 360° |

## Déploiement

Build statique dans `dist/`, avec repli SPA sur `index.html`.

- **Cloudflare Workers** (production, `wrangler.jsonc`) : `dist/` servi en assets statiques,
  `not_found_handling: single-page-application`.

  ```bash
  npm run build && npx wrangler deploy
  ```

  → [game7le.lupy.workers.dev](https://game7le.lupy.workers.dev)

- **Vercel** : `vercel.json` fournit la réécriture `/(.*) → /index.html`.

## Tests

Pas de runner unitaire : deux scripts Playwright pilotent l'application **construite** sur
`localhost:4183` (`npm run preview` doit tourner avant).

- `scripts/smoke.mjs` — charge chaque page et chaque route d'entraînement, et vérifie l'absence
  d'erreur console ou de page.
- `scripts/full-run.mjs` — joue un run complet (7 épreuves) en avançant l'horloge (`page.clock`)
  pour contourner le délai avant « passer », avec gestes de glisser simulés pour les jeux au tracé,
  puis contrôle l'écran de résultats et la persistance localStorage. Comme le tirage change chaque
  jour, il lit le nom du jeu à l'écran et choisit l'action correspondante au lieu de coder un ordre
  en dur.

## Ajouter un mini-jeu

1. Créer `src/games/MonJeu.tsx` implémentant `GameProps` (voir `src/games/types.ts`) : tout aléa
   passe par `rng`, la fin d'épreuve par un unique `onDone`.
2. **Ajouter l'entrée en fin de `JEUX`** dans `src/games/index.ts`, avec une fenêtre
   `tirage.depuis` **postérieure** à la mise en ligne (et `defi.depuis` un lundi suivant, si le jeu
   doit rejoindre le défi).
3. Ajouter un `case` dans `GameIcon.tsx` pour son pictogramme.
4. Ajouter l'identifiant aux tableaux d'identifiants de `submit_run()` (`supabase/schema.sql`) —
   c'est le catalogue de tout ce qui a été un jour éligible : on y ajoute, on n'y retire jamais.
5. En touchant un générateur existant, garder **exactement la même séquence d'appels à `rng`** dans
   le chemin non-difficile, sous peine de changer les puzzles du jour déjà publiés.

## À propos, crédits et licences

Game7le est une **adaptation française non officielle** de [gauntle.com](https://gauntle.com), le
jeu de casse-têtes quotidien créé par Hannah. Il s'en distingue par son format : 7 épreuves
**tirées au sort** chaque jour parmi 17, plus un défi hebdomadaire.

Comme l'original : **gratuit, sans publicité, sans inscription obligatoire**. Aucune donnée
personnelle n'est collectée — le pseudo est choisi librement et sert uniquement de clé de
classement.

Générateurs et solveurs sont embarqués (Sudoku, Démineur sans pari, Nonogramme, Paire, Reines) :
chaque grille est vérifiée à solution unique avant d'être servie.

**Sources et licences**

| Source | Usage | Licence |
|--------|-------|---------|
| [Lexique 3.83](http://www.lexique.org) (New & Pallier) | Le Mot, Mélimélo, Croisés, Dactylo | CC BY-SA |
| [Wiktionnaire](https://fr.wiktionary.org) (dump wiktextract / kaikki.org) | indices des Croisés | CC BY-SA 4.0 |
| [Base de puzzles Lichess](https://database.lichess.org) | Échecs | CC0 |
| [PokeAPI](https://pokeapi.co) | Pokédle | données et sprites libres d'usage |
| [Mapillary](https://www.mapillary.com) + [Leaflet](https://leafletjs.com) / OpenStreetMap | Atlas | API et tuiles publiques |
| [Lireer/ricochet-robot-solver](https://github.com/Lireer/ricochet-robot-solver) | relevé des quadrants du plateau Ricochet | MIT |

Polices : Rubik Mono One, Lexend, Chivo Mono (Google Fonts).
