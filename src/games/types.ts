import type { ComponentType } from 'react';
import type { RNG } from '../lib/rng';

export interface GameResult {
  adjustMs: number; // négatif = bonus, positif = pénalité
  detail: string; // ex. « résolu en 3 essais »
  status: 'success' | 'fail' | 'skip';
}

export interface GameProps {
  rng: RNG;
  /** Variante corsée du défi hebdomadaire (grille plus grande, mots plus longs…). */
  difficile?: boolean;
  /** Signale un ajustement intermédiaire (indice révélé, erreur…) pour le toast et le chrono. */
  onAdjust: (ms: number, label: string) => void;
  /** Termine le jeu. L'ajustement final NE doit PAS réinclure les ajustements intermédiaires. */
  onDone: (r: GameResult) => void;
}

/**
 * Fenêtre de présence d'un jeu dans un tirage, en dates AAAA-MM-JJ : de
 * `depuis` (inclus) à `retire` (exclu ; absent = toujours présent). Le tirage
 * d'un jour donné ne considère que les jeux présents ce jour-là : ajouter ou
 * retirer un mini-jeu ne change donc que les tirages postérieurs, jamais les
 * archives déjà jouées.
 */
export interface Fenetre {
  depuis: string;
  retire?: string;
}

export interface GameDef {
  id: string;
  nom: string;
  regles: string; // une ligne, affichée pendant la partie
  /** Règles de la variante difficile quand elles diffèrent (défi hebdomadaire). */
  reglesDifficile?: string;
  scoring: string; // description du barème (page « Comment jouer »)
  skip: { apresS: number; penaliteS: number } | null;
  /** Présence dans le tirage quotidien (comparée à la date du jour joué). */
  tirage: Fenetre;
  /** Présence dans le pool du défi hebdo (comparée au lundi de la semaine) ; absent = jamais. */
  defi?: Fenetre;
  Component: ComponentType<GameProps>;
}
