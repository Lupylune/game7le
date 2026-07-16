# Game7le

Adaptation française non officielle de [gauntle.com](https://gauntle.com) : un défi quotidien de
**7 épreuves tirées au sort chaque jour parmi 13 mini-jeux** (les 11 de l'original + 2 inédits),
enchaînées sous un chronomètre unique. Le tirage et les énigmes sont identiques pour tous les
joueurs d'un même jour (PRNG seedé sur la date). Les bonus réduisent le temps total, les
pénalités l'augmentent ; l'objectif est de boucler le parcours le plus vite possible.

## Stack

- **Vite + React 19 + TypeScript** — 100 % front, aucun backend.
- Les puzzles du jour sont générés par un **PRNG déterministe seedé sur la date**
  (`src/lib/rng.ts`) : tous les visiteurs d'un même jour reçoivent les mêmes grilles, sans serveur.
- Temps, historique et réglages en **localStorage**. Le classement mondial est simulé
  (déterministe par jour) pour la démo ; seul le temps du joueur est réel.
- Design system repris de l'original : thème sombre/clair, polices Rubik Mono One / Lexend /
  Chivo Mono, logo braise.

## Les 13 mini-jeux du tirage

| # | Jeu | Type | Génération |
|---|-----|------|------------|
| 1 | Le Mot | Wordle FR (5 lettres, 6 essais) | Lexique 3.83 : ~5 000 mots de validation, ~1 100 solutions courantes |
| 2 | Mini Croisés | mots croisés 5×5 | grilles assemblées dynamiquement (Lexique) + indices = définitions Wiktionnaire ; repli sur 3 grilles artisanales |
| 3 | Paire | type « Tango » 6×6 (★/●, =, ×) | générateur + solveur, solution unique |
| 4 | Mini Sudoku | 6×6, blocs 2×3 | générateur + solveur, solution unique |
| 5 | Reines | type « Queens » 6×6, régions colorées | générateur + solveur, solution unique |
| 6 | Démineur | 12×12, 20 mines | grilles vérifiées résolubles sans pari |
| 7 | Nonogramme | 8×8 | vérifié résoluble par pure logique de lignes |
| 8 | Ratiole | couper une forme au ratio cible | découpe de polygone (Sutherland–Hodgman) |
| 9 | Mélimélo | anagramme mémoire (6 lettres) | cibles courantes Lexique (~740), toute anagramme du dictionnaire (~9 800 formes) acceptée |
| 10 | Chromal | perception des couleurs, 10 niveaux | écart de luminosité décroissant |
| 11 | Tracé | repasser une forme d'un trait | score par distance moyenne symétrique |
| 12 | Dactylo | recopier une phrase au plus vite | 8 mots tirés du lexique, erreurs comptées |
| 13 | Échecs | puzzle tactique en un coup | base Lichess (CC0), 800 puzzles Elo 700–1600, `npm run echecs` |

## Commandes

```bash
npm install
npm run dev       # développement
npm run build     # production (dist/)
npm run preview   # sert le build
npm test          # tests Playwright : fumée + parcours complet simulé
                  # (nécessite `npm run preview` actif sur le port 4183)
npm run lexique   # régénère les lexiques (Lexique 3.83) et les définitions
                  # d'indices (API Wiktionnaire) → src/data/{lexique,definitions}.ts
```

## Données lexicales

Les lexiques ne sont plus une base fixe écrite à la main : ils sont **générés depuis des bases
ouvertes** par `npm run lexique`, puis committés (aucune dépendance réseau au runtime — le jeu
chronométré reste instantané et hors-ligne) :

- **Lexique 3.83** (lexique.org, CC BY-SA) : 142 000 formes du français avec fréquences d'usage.
  Filtrage par longueur, propreté orthographique et fréquence films/livres.
- **Wiktionnaire** (fr.wiktionary.org, CC BY-SA 4.0) : définitions extraites du wikitext
  (section française, première ligne de définition nettoyée), mot masqué dans sa propre
  définition, requêtes groupées 20 titres avec cache et reprise.

## Pages

`/` accueil · `/jouer` run du jour · `/jouer/:date` archives · `/entrainement` mode libre ·
`/classement` · `/archives` · `/comment-jouer` · `/a-propos` · `/parametres`
