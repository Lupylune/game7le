import type { ComponentType } from 'react';
import type { RNG } from '../lib/rng';

export interface GameResult {
  adjustMs: number; // négatif = bonus, positif = pénalité
  detail: string; // ex. « résolu en 3 essais »
  status: 'success' | 'fail' | 'skip';
}

export interface GameProps {
  rng: RNG;
  /** Signale un ajustement intermédiaire (indice révélé, erreur…) pour le toast et le chrono. */
  onAdjust: (ms: number, label: string) => void;
  /** Termine le jeu. L'ajustement final NE doit PAS réinclure les ajustements intermédiaires. */
  onDone: (r: GameResult) => void;
}

export interface GameDef {
  id: string;
  nom: string;
  regles: string; // une ligne, affichée pendant la partie
  scoring: string; // description du barème (page « Comment jouer »)
  skip: { apresS: number; penaliteS: number } | null;
  Component: ComponentType<GameProps>;
}
