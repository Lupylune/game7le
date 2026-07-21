import type { GameDef } from './types';
import { seededRng, shuffle } from '../lib/rng';
import LeMot from './LeMot';
import Croises from './Croises';
import Paire from './Paire';
import Sudoku from './Sudoku';
import Reines from './Reines';
import Demineur from './Demineur';
import Nonogramme from './Nonogramme';
import Ratiole from './Ratiole';
import Melimelo from './Melimelo';
import Chromal from './Chromal';
import Trace from './Trace';
import Dactylo from './Dactylo';
import Echecs from './Echecs';
import Pokedle from './Pokedle';

export const JEUX: GameDef[] = [
  {
    id: 'lemot',
    nom: 'Le Mot',
    regles: 'Devinez le mot de 5 lettres en 6 essais maximum.',
    reglesDifficile: 'Devinez le mot de 8 lettres en 6 essais maximum.',
    scoring: 'Trouvé en 1–3 essais : −15 s · 4 essais : −10 s · 5 essais : −5 s · échec : +60 s',
    skip: { apresS: 30, penaliteS: 90 },
    Component: LeMot,
  },
  {
    id: 'croises',
    nom: 'Mini Croisés',
    regles: 'Remplissez la mini-grille de mots croisés.',
    reglesDifficile: 'Remplissez la mini-grille de mots croisés — vocabulaire plus rare.',
    scoring: 'Résolu sans aide : −10 s · lettre révélée : +8 s · vérification : +5 s',
    skip: { apresS: 30, penaliteS: 90 },
    Component: Croises,
  },
  {
    id: 'paire',
    nom: 'Paire',
    regles: '3 ★ et 3 ● par ligne et colonne, jamais 3 identiques à la suite. « = » impose l’égalité, « × » la différence.',
    scoring: 'Résolu : −10 s · vérification : +5 s',
    skip: { apresS: 30, penaliteS: 90 },
    Component: Paire,
  },
  {
    id: 'sudoku',
    nom: 'Mini Sudoku',
    regles: 'Chiffres 1 à 6 : une fois par ligne, colonne et bloc 2×3.',
    reglesDifficile: 'Chiffres 1 à 9 : une fois par ligne, colonne et bloc 3×3 — peu d’indices.',
    scoring: 'Résolu : −10 s · vérification : +5 s',
    skip: { apresS: 30, penaliteS: 90 },
    Component: Sudoku,
  },
  {
    id: 'reines',
    nom: 'Reines',
    regles: 'Placez 6 reines : une par ligne, colonne et région colorée, jamais deux qui se touchent.',
    reglesDifficile:
      'Placez 8 reines : une par ligne, colonne et région colorée, jamais deux qui se touchent.',
    scoring: 'Résolu : −5 s · révélation : +30 s',
    skip: { apresS: 30, penaliteS: 90 },
    Component: Reines,
  },
  {
    id: 'demineur',
    nom: 'Démineur',
    regles: 'Grille 12×12, 20 mines. Tout se déduit, aucun pari nécessaire.',
    scoring: 'Grille nettoyée : −15 s · mine touchée : de +120 s (dès le début) à +30 s (dégressif)',
    skip: { apresS: 30, penaliteS: 90 },
    Component: Demineur,
  },
  {
    id: 'nonogramme',
    nom: 'Nonogramme',
    regles: 'Noircissez les cases selon les indices de chaque ligne et colonne.',
    reglesDifficile:
      'Noircissez les cases selon les indices de chaque ligne et colonne — grille 15×15.',
    scoring: 'Résolu : −10 s · vérification : +5 s',
    skip: { apresS: 30, penaliteS: 90 },
    Component: Nonogramme,
  },
  {
    id: 'ratiole',
    nom: 'Ratiole',
    regles: 'Coupez chaque forme d’un trait droit pour atteindre son ratio cible — 3 formes à la suite.',
    scoring: 'Par coupe : de −7 s (parfait) à +15 s (très raté) · une seule tentative par forme',
    skip: null,
    Component: Ratiole,
  },
  {
    id: 'melimelo',
    nom: 'Mélimélo',
    regles: 'Six lettres se révèlent une par une puis se masquent : retrouvez le mot qui les utilise toutes.',
    reglesDifficile:
      'Huit lettres se révèlent une par une puis se masquent : retrouvez le mot qui les utilise toutes.',
    scoring: 'Trouvé : −8 s · +10 s par erreur ou revoir les lettres',
    skip: { apresS: 30, penaliteS: 90 },
    Component: Melimelo,
  },
  {
    id: 'chromal',
    nom: 'Chromal',
    regles: '10 niveaux : cliquez la case légèrement différente parmi les 6. Un mauvais clic = éliminé.',
    reglesDifficile:
      '10 niveaux : cliquez la case légèrement différente parmi les 16. Un mauvais clic = éliminé.',
    scoring: '10 niveaux : −15 s · éliminé : de +35 s (niveau 1) à −10 s (niveau 10)',
    skip: { apresS: 30, penaliteS: 60 },
    Component: Chromal,
  },
  {
    id: 'trace',
    nom: 'Tracé',
    regles:
      'Un segment dessine la forme puis s’efface : reproduisez-la de mémoire, d’un seul trait.',
    scoring: 'De −40 s (100 % de précision) à +90 s (0 %) · une seule tentative · revoir +10 s',
    skip: null,
    Component: Trace,
  },
  {
    id: 'dactylo',
    nom: 'Dactylo',
    regles: 'Recopiez la phrase le plus vite possible — seule la bonne lettre fait avancer.',
    reglesDifficile:
      'Recopiez la phrase (deux fois plus longue) le plus vite possible — seule la bonne lettre fait avancer.',
    scoring: 'Sans faute : −15 s · 5 fautes ou moins : −10 s · au-delà : −5 s',
    skip: { apresS: 30, penaliteS: 90 },
    Component: Dactylo,
  },
  {
    id: 'echecs',
    nom: 'Échecs',
    regles: 'Un puzzle Lichess : l’adversaire vient de jouer, menez l’attaque jusqu’au mat.',
    reglesDifficile:
      'Un puzzle Lichess corsé : l’adversaire vient de jouer, menez l’attaque jusqu’au mat.',
    scoring: 'Mat trouvé : −15 s (davantage si plusieurs coups) · mauvais coup : +10 s · indice : +15 s',
    skip: { apresS: 30, penaliteS: 90 },
    Component: Echecs,
  },
  {
    id: 'pokedle',
    nom: 'Pokédle',
    regles:
      'Devinez le Pokémon (génération 1) en 8 essais : chaque proposition révèle type, stade, couleur et habitat.',
    scoring: 'Trouvé en 1–3 essais : −15 s · 4–5 : −10 s · 6–8 : −5 s · échec : +60 s',
    skip: { apresS: 30, penaliteS: 90 },
    Component: Pokedle,
  },
];

export const JEU_PAR_ID = new Map(JEUX.map((j) => [j.id, j]));

export const JEUX_PAR_JOUR = 7;

/** Les 7 épreuves du jour, tirées au sort parmi les 14 (même tirage pour tous). */
export function jeuxDuJour(date: string): GameDef[] {
  return shuffle(seededRng(`game7le:${date}:selection`), JEUX).slice(0, JEUX_PAR_JOUR);
}

/** Jeux exclus du défi difficile : pas de variante corsée pertinente. */
const EXCLUS_DEFI = new Set(['paire', 'ratiole', 'trace', 'pokedle']);

/** Pool du défi hebdomadaire difficile (10 jeux). */
export const JEUX_DEFI: GameDef[] = JEUX.filter((j) => !EXCLUS_DEFI.has(j.id));

/**
 * Les 7 épreuves du défi difficile de la semaine (identifiée par son lundi),
 * tirées au sort parmi les 10 — même tirage pour tous.
 */
export function jeuxDefiSemaine(lundi: string): GameDef[] {
  return shuffle(seededRng(`game7le:defi:${lundi}:selection`), JEUX_DEFI).slice(0, JEUX_PAR_JOUR);
}
