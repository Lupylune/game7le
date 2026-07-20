import type { RunRecord } from './storage';
import { type RunPourStats, estEnDirect, joursEnDirect } from './stats';

/**
 * Système de badges (achievements). Chaque badge se calcule intégralement
 * côté client depuis l'historique du joueur (runs quotidiens, défis difficiles,
 * rangs réels, partages). Un badge peut être à palier unique (débloqué ou non)
 * ou à trois niveaux — bronze / argent / or.
 *
 * Le badge choisi par le joueur est stocké dans les réglages sous forme de
 * *token* : `id` (palier unique) ou `id:niveau` (badge à paliers), résolu au
 * moment de l'affichage — voir `tokenBadge` / `parseToken`.
 */

export type Niveau = 'bronze' | 'argent' | 'or';
export const NIVEAUX: Niveau[] = ['bronze', 'argent', 'or'];

export interface Palier {
  niveau: Niveau;
  seuil: number;
}

export interface BadgeDef {
  id: string;
  nom: string;
  /** Phrase courte décrivant comment l'obtenir. */
  desc: string;
  /** Unité de la valeur (« run », « j », « h »…), pour l'affichage de la progression. */
  unite?: string;
  /** Paliers bronze/argent/or, ou `null` pour un badge à palier unique (`seuil`). */
  paliers: Palier[] | null;
  /** Seuil de déblocage des badges à palier unique (défaut : 1). */
  seuil?: number;
  /** `min` : la valeur doit être ≤ seuil (temps, rang) ; `max` (défaut) : ≥ seuil. */
  sens?: 'min' | 'max';
  /** Valeur de progression courante du joueur. */
  valeur: (c: CtxBadges) => number;
}

/** Données agrégées nécessaires au calcul de tous les badges. */
export interface CtxBadges {
  /** Tous les runs quotidiens connus (direct + archives). */
  runs: RunPourStats[];
  /** Runs quotidiens joués en direct uniquement. */
  runsLive: RunPourStats[];
  /** Défis difficiles hebdomadaires (stockage local). */
  defis: RunRecord[];
  /** Nombre de jours où le joueur a fini 1er au classement réel (Supabase). */
  nbNumeroUn: number;
  today: string;
}

/**
 * Meilleure série de jours consécutifs jamais atteinte (badge « En feu »),
 * par opposition à `calculeStreak` qui ne donne que la série en cours.
 * Arithmétique en UTC, comme le reste des séries.
 */
export function meilleureSerie(dates: Set<string>): number {
  const tri = [...dates].sort();
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of tri) {
    if (prev) {
      const veille = new Date(`${d}T00:00:00Z`);
      veille.setUTCDate(veille.getUTCDate() - 1);
      cur = veille.toISOString().slice(0, 10) === prev ? cur + 1 : 1;
    } else {
      cur = 1;
    }
    if (cur > best) best = cur;
    prev = d;
  }
  return best;
}

/** Jours d'archives distincts rejoués (runs non joués en direct). */
function joursArchives(runs: RunPourStats[]): number {
  const live = joursEnDirect(runs);
  const arch = new Set(runs.filter((r) => !estEnDirect(r)).map((r) => r.date));
  for (const d of live) arch.delete(d); // un jour joué en direct ne compte pas comme archive
  return arch.size;
}

export const BADGES: BadgeDef[] = [
  {
    id: 'premiers-pas',
    nom: 'Premiers pas',
    desc: 'Terminer un premier run.',
    paliers: null,
    valeur: (c) => c.runsLive.length,
  },
  {
    id: 'sans-faute',
    nom: 'Sans-faute',
    desc: 'Boucler des runs sans la moindre erreur.',
    unite: 'run',
    paliers: [
      { niveau: 'bronze', seuil: 1 },
      { niveau: 'argent', seuil: 10 },
      { niveau: 'or', seuil: 50 },
    ],
    valeur: (c) => c.runsLive.filter((r) => r.flawless).length,
  },
  {
    id: 'en-feu',
    nom: 'En feu',
    desc: 'Enchaîner les jours sans en manquer un.',
    unite: 'j',
    paliers: [
      { niveau: 'bronze', seuil: 3 },
      { niveau: 'argent', seuil: 7 },
      { niveau: 'or', seuil: 30 },
    ],
    valeur: (c) => meilleureSerie(joursEnDirect(c.runsLive)),
  },
  {
    id: 'assidu',
    nom: 'Assidu',
    desc: 'Accumuler les runs quotidiens.',
    unite: 'run',
    paliers: [
      { niveau: 'bronze', seuil: 7 },
      { niveau: 'argent', seuil: 30 },
      { niveau: 'or', seuil: 86 },
    ],
    valeur: (c) => c.runsLive.length,
  },
  {
    id: 'centurion',
    nom: 'Centurion',
    desc: 'Terminer 100 runs.',
    unite: 'run',
    paliers: null,
    seuil: 100,
    valeur: (c) => c.runsLive.length,
  },
  {
    id: 'bolide',
    nom: 'Bolide',
    desc: 'Boucler un run sous la barre du temps.',
    unite: 's',
    sens: 'min',
    paliers: [
      { niveau: 'bronze', seuil: 180 },
      { niveau: 'argent', seuil: 120 },
      { niveau: 'or', seuil: 90 },
    ],
    valeur: (c) =>
      c.runsLive.length ? Math.round(Math.min(...c.runsLive.map((r) => r.totalMs)) / 1000) : Infinity,
  },
  {
    id: 'numero-un',
    nom: 'Numéro 1',
    desc: 'Décrocher la première place du jour.',
    unite: 'fois',
    paliers: [
      { niveau: 'bronze', seuil: 1 },
      { niveau: 'argent', seuil: 3 },
      { niveau: 'or', seuil: 7 },
    ],
    valeur: (c) => c.nbNumeroUn,
  },
  {
    id: 'archiviste',
    nom: 'Archiviste',
    desc: 'Rejouer les Game7le des jours passés.',
    unite: 'j',
    paliers: [
      { niveau: 'bronze', seuil: 3 },
      { niveau: 'argent', seuil: 15 },
      { niveau: 'or', seuil: 50 },
    ],
    valeur: (c) => joursArchives(c.runs),
  },
  {
    id: 'marathonien',
    nom: 'Marathonien',
    desc: 'Cumuler du temps de jeu.',
    unite: 'h',
    paliers: [
      { niveau: 'bronze', seuil: 1 },
      { niveau: 'argent', seuil: 6 },
      { niveau: 'or', seuil: 24 },
    ],
    valeur: (c) => Math.floor(c.runsLive.reduce((s, r) => s + r.totalMs, 0) / 3600000),
  },
  {
    id: 'costaud',
    nom: 'Costaud',
    desc: 'Relever le défi difficile de la semaine.',
    unite: 'défi',
    paliers: [
      { niveau: 'bronze', seuil: 1 },
      { niveau: 'argent', seuil: 5 },
      { niveau: 'or', seuil: 15 },
    ],
    valeur: (c) => c.defis.filter((r) => r.enDirect ?? true).length,
  },
  {
    id: 'elite',
    nom: 'Élite',
    desc: 'Terminer un défi difficile sans aucune faute.',
    paliers: null,
    valeur: (c) => c.defis.filter((r) => r.flawless).length,
  },
];

export const BADGE_PAR_ID: Record<string, BadgeDef> = Object.fromEntries(
  BADGES.map((b) => [b.id, b]),
);

export interface EtatBadge {
  def: BadgeDef;
  valeur: number;
  /** Niveau atteint, `null` si le badge n'est pas débloqué. */
  niveau: Niveau | null;
  debloque: boolean;
  /** Seuil du prochain palier à atteindre, `null` si tout est débloqué. */
  prochainSeuil: number | null;
}

/** Niveau atteint pour un badge donné (le plus haut palier satisfait). */
export function niveauAtteint(def: BadgeDef, valeur: number): Niveau | null {
  const ok = (seuil: number) => (def.sens === 'min' ? valeur <= seuil : valeur >= seuil);
  if (def.paliers) {
    let atteint: Niveau | null = null;
    for (const p of def.paliers) if (ok(p.seuil)) atteint = p.niveau;
    return atteint;
  }
  return ok(def.seuil ?? 1) ? 'or' : null;
}

/** Prochain seuil non atteint d'un badge, `null` si complet. */
function prochainSeuil(def: BadgeDef, valeur: number): number | null {
  const ok = (seuil: number) => (def.sens === 'min' ? valeur <= seuil : valeur >= seuil);
  const seuils = def.paliers ? def.paliers.map((p) => p.seuil) : [def.seuil ?? 1];
  return seuils.find((s) => !ok(s)) ?? null;
}

/** État de tous les badges pour un contexte donné. */
export function calculeBadges(c: CtxBadges): EtatBadge[] {
  return BADGES.map((def) => {
    const valeur = def.valeur(c);
    const niveau = niveauAtteint(def, valeur);
    return { def, valeur, niveau, debloque: niveau != null, prochainSeuil: prochainSeuil(def, valeur) };
  });
}

/** Token stocké/synchronisé : `id:niveau` (le niveau porte la couleur d'affichage). */
export function tokenBadge(id: string, niveau: Niveau | null): string {
  return niveau ? `${id}:${niveau}` : id;
}

export function parseToken(token: string | undefined | null): { id: string; niveau: Niveau | null } | null {
  if (!token) return null;
  const [id, niv] = token.split(':');
  if (!BADGE_PAR_ID[id]) return null;
  return { id, niveau: (NIVEAUX as string[]).includes(niv) ? (niv as Niveau) : null };
}
