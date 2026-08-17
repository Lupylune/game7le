import type { Fenetre, GameDef } from './types';
import { LANCEMENT, seededRng, shuffle } from '../lib/rng';
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
import Atlas from './Atlas';
import Tempo from './Tempo';

/**
 * Dates repères de l'historique du tirage. Le tirage d'un jour n'utilise que
 * les jeux présents ce jour-là (`GameDef.tirage` / `GameDef.defi`), si bien
 * qu'ajouter ou retirer un mini-jeu ne rejoue jamais les archives : les jours
 * déjà passés gardent exactement le tirage qu'ils ont eu.
 *
 * Deux règles à respecter en ajoutant un jeu :
 * 1. **l'ajouter à la fin de `JEUX`** et ne jamais réordonner les entrées
 *    existantes — le tirage est un mélange de ce tableau, tout déplacement
 *    changerait les tirages passés ;
 * 2. lui donner une fenêtre `tirage.depuis` (et `defi.depuis`) qui commence
 *    **après** la mise en ligne : le jour en cours, déjà joué par certains, ne
 *    doit pas changer.
 *
 * Les jeux arrivés avant ce mécanisme (Pokédle, Atlas) sont datés du lancement,
 * et Chromal/Atlas n'ont pas de fenêtre `defi` du tout : les tirages passés
 * restent alors ceux qu'affiche le site aujourd'hui. Le mécanisme ne vaut donc
 * que pour les ajouts et retraits à venir, à partir de Tempo.
 */
const DEFI_LANCEMENT = '2026-07-13'; // lundi de la semaine où le défi difficile est arrivé

export const JEUX: GameDef[] = [
  {
    id: 'lemot',
    nom: 'Le Mot',
    regles: 'Devinez le mot de 5 lettres en 6 essais maximum.',
    reglesDifficile: 'Devinez le mot de 8 lettres en 6 essais maximum.',
    scoring: 'Trouvé en 1–3 essais : −15 s · 4 essais : −10 s · 5 essais : −5 s · échec : +60 s',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    defi: { depuis: DEFI_LANCEMENT },
    Component: LeMot,
  },
  {
    id: 'croises',
    nom: 'Mini Croisés',
    regles: 'Remplissez la mini-grille de mots croisés.',
    reglesDifficile: 'Remplissez la mini-grille de mots croisés — vocabulaire plus rare.',
    scoring: 'Résolu sans aide : −10 s · lettre révélée : +8 s · vérification : +20 s',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    defi: { depuis: DEFI_LANCEMENT },
    Component: Croises,
  },
  {
    id: 'paire',
    nom: 'Paire',
    regles: '3 ★ et 3 ● par ligne et colonne, jamais 3 identiques à la suite. « = » impose l’égalité, « × » la différence.',
    scoring: 'Résolu : −10 s · vérification : +20 s (disponible après 30 s)',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    Component: Paire,
  },
  {
    id: 'sudoku',
    nom: 'Mini Sudoku',
    regles: 'Chiffres 1 à 6 : une fois par ligne, colonne et bloc 2×3.',
    reglesDifficile: 'Chiffres 1 à 9 : une fois par ligne, colonne et bloc 3×3 — peu d’indices.',
    scoring: 'Résolu : −10 s · vérification : +20 s',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    defi: { depuis: DEFI_LANCEMENT },
    Component: Sudoku,
  },
  {
    id: 'reines',
    nom: 'Reines',
    regles: 'Placez 6 reines : une par ligne, colonne et région colorée, jamais deux qui se touchent.',
    reglesDifficile:
      'Placez 8 reines : une par ligne, colonne et région colorée, jamais deux qui se touchent.',
    scoring: 'Résolu : −5 s · vérification : +20 s',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    defi: { depuis: DEFI_LANCEMENT },
    Component: Reines,
  },
  {
    id: 'demineur',
    nom: 'Démineur',
    regles:
      'Grille 12×12, 20 mines. Creusez la case marquée en premier : la grille est la même pour tous. Tout se déduit ensuite, aucun pari nécessaire.',
    scoring: 'Grille nettoyée : −15 s · mine touchée : de +120 s (dès le début) à +30 s (dégressif)',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    defi: { depuis: DEFI_LANCEMENT },
    Component: Demineur,
  },
  {
    id: 'nonogramme',
    nom: 'Nonogramme',
    regles: 'Noircissez les cases selon les indices de chaque ligne et colonne.',
    reglesDifficile:
      'Noircissez les cases selon les indices de chaque ligne et colonne — grille 15×15.',
    scoring: 'Résolu : −10 s · vérification : +20 s (disponible après 30 s)',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    defi: { depuis: DEFI_LANCEMENT },
    Component: Nonogramme,
  },
  {
    id: 'ratiole',
    nom: 'Ratiole',
    regles: 'Coupez chaque forme d’un trait droit pour atteindre son ratio cible — 3 formes à la suite.',
    scoring: 'Par coupe : de −7 s (parfait) à +15 s (très raté) · une seule tentative par forme',
    skip: null,
    tirage: { depuis: LANCEMENT },
    Component: Ratiole,
  },
  {
    id: 'melimelo',
    nom: 'Mélimélo',
    regles: 'Six lettres se révèlent une par une puis se masquent : retrouvez le mot qui les utilise toutes.',
    reglesDifficile:
      'Huit lettres se révèlent une par une puis se masquent : retrouvez le mot qui les utilise toutes.',
    scoring: 'Trouvé : −8 s · +10 s par erreur ou revoir les lettres',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    defi: { depuis: DEFI_LANCEMENT },
    Component: Melimelo,
  },
  {
    id: 'chromal',
    nom: 'Chromal',
    regles: '10 niveaux : cliquez la case légèrement différente parmi les 6. Un mauvais clic = éliminé.',
    reglesDifficile:
      '10 niveaux : cliquez la case légèrement différente parmi les 16. Un mauvais clic = éliminé.',
    scoring: '10 niveaux : −15 s · éliminé : de +35 s (niveau 1) à −10 s (niveau 10)',
    skip: { apresS: 45, penaliteS: 60 },
    tirage: { depuis: LANCEMENT },
    // Pas de `defi` : la case parmi 16 tient trop de la perception pour le défi
    Component: Chromal,
  },
  {
    id: 'trace',
    nom: 'Tracé',
    regles:
      'Un segment dessine la forme puis s’efface : reproduisez-la de mémoire, d’un seul trait.',
    scoring: 'De −40 s (100 % de précision) à +90 s (0 %) · une seule tentative · revoir +10 s',
    skip: null,
    tirage: { depuis: LANCEMENT },
    Component: Trace,
  },
  {
    id: 'dactylo',
    nom: 'Dactylo',
    regles: 'Recopiez la phrase le plus vite possible — seule la bonne lettre fait avancer.',
    reglesDifficile:
      'Recopiez la phrase (deux fois plus longue) le plus vite possible — seule la bonne lettre fait avancer.',
    scoring: 'Sans faute : −15 s · 5 fautes ou moins : −10 s · au-delà : −5 s',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    defi: { depuis: DEFI_LANCEMENT },
    Component: Dactylo,
  },
  {
    id: 'echecs',
    nom: 'Échecs',
    regles: 'Un puzzle Lichess : l’adversaire vient de jouer, menez l’attaque jusqu’au mat.',
    reglesDifficile:
      'Un puzzle Lichess corsé : l’adversaire vient de jouer, menez l’attaque jusqu’au mat.',
    scoring: 'Mat trouvé : −15 s (davantage si plusieurs coups) · mauvais coup : +10 s · indice : +15 s',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    defi: { depuis: DEFI_LANCEMENT },
    Component: Echecs,
  },
  {
    id: 'pokedle',
    nom: 'Pokédle',
    regles:
      'Devinez le Pokémon (génération 1) en 8 essais : chaque proposition révèle type, stade, couleur et habitat.',
    reglesDifficile:
      'Devinez le Pokémon (toutes générations) en 12 essais : chaque proposition révèle type, stade, couleur et génération.',
    scoring:
      'Trouvé en 1–3 essais : −15 s · 4–5 : −10 s · 6–8 : −5 s · échec : +60 s (défi difficile : 12 essais, paliers 1–4 / 5–8 / 9–12, échec +180 s)',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    defi: { depuis: DEFI_LANCEMENT },
    Component: Pokedle,
  },
  {
    id: 'atlas',
    nom: 'Atlas',
    regles:
      'Un panorama 360° d’un lieu du monde : explorez-le puis placez votre marqueur sur la carte pour deviner où vous êtes.',
    scoring:
      'Plus vous tombez juste, plus le bonus est grand : jusqu’à −35 s (< 100 m). Mauvaise réponse : de +2 min (validée d’emblée) à +1 min (dégressif)',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: LANCEMENT },
    Component: Atlas,
  },
  {
    id: 'tempo',
    nom: 'Tempo',
    regles:
      'Cinq durées pulsent une à une : reproduisez chacune de mémoire en maintenant l’appui (ou la barre d’espace).',
    reglesDifficile:
      'Cinq durées (0,5 à 6 s) pulsent une à une : reproduisez chacune de mémoire, à l’aveugle et sans compteur.',
    scoring:
      'Précision moyenne des 5 durées : de −30 s (100 %) à +45 s (0 %), neutre vers 60 % · une seule tentative par durée',
    skip: { apresS: 45, penaliteS: 90 },
    tirage: { depuis: '2026-08-04' },
    defi: { depuis: '2026-08-10' },
    Component: Tempo,
  },
];

export const JEU_PAR_ID = new Map(JEUX.map((j) => [j.id, j]));

export const JEUX_PAR_JOUR = 7;

const dans = (f: Fenetre | undefined, date: string) =>
  !!f && f.depuis <= date && (!f.retire || date < f.retire);

/**
 * Le pool du tirage quotidien tel qu'il était (ou sera) à cette date, dans
 * l'ordre de `JEUX` : c'est lui qu'on mélange, donc un jour passé retrouve
 * exactement le pool — et donc le tirage — qu'il a connu.
 */
export function jeuxDuPool(date: string): GameDef[] {
  return JEUX.filter((j) => dans(j.tirage, date));
}

/** Pool du défi hebdomadaire difficile pour la semaine du lundi donné. */
export function poolDefi(lundi: string): GameDef[] {
  return JEUX.filter((j) => dans(j.defi, lundi));
}

/** Les 7 épreuves du jour, tirées au sort dans le pool du jour (même tirage pour tous). */
export function jeuxDuJour(date: string): GameDef[] {
  return shuffle(seededRng(`game7le:${date}:selection`), jeuxDuPool(date)).slice(0, JEUX_PAR_JOUR);
}

/**
 * Les 7 épreuves du défi difficile de la semaine (identifiée par son lundi),
 * tirées au sort dans le pool de cette semaine — même tirage pour tous.
 */
export function jeuxDefiSemaine(lundi: string): GameDef[] {
  return shuffle(seededRng(`game7le:defi:${lundi}:selection`), poolDefi(lundi)).slice(
    0,
    JEUX_PAR_JOUR,
  );
}
