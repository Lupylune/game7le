import type { GameLine } from './storage';
import { rangEstime } from './classement';
import { todayStr } from './rng';

export interface StatsJoueur {
  runs: number;
  flawless: number;
  streak: number;
  moyenneMs: number;
  meilleur: { ms: number; date: string } | null;
  meilleurRang: { rang: number; date: string } | null;
  tauxPasseP: number; // % d'épreuves passées
  totalMs: number;
}

/** Sous-ensemble d'un run nécessaire au calcul des stats (local ou Supabase). */
export interface RunPourStats {
  date: string;
  totalMs: number;
  lines: GameLine[];
  flawless: boolean;
  /** Horodatage de fin du run (ms epoch). Absent sur d'anciens runs → traité comme joué en direct. */
  finishedAt?: number;
  /** Joué le jour même (`false` : archive rejouée). Absent des anciens runs. */
  enDirect?: boolean;
}

/**
 * Run joué « en direct », c.-à-d. le jour même du puzzle, par opposition aux
 * archives rejouées après coup. Flag explicite `enDirect` en priorité ;
 * repli sur l'heuristique `finishedAt` pour les anciens enregistrements (un
 * run sans `finishedAt` est compté comme en direct).
 */
export function estEnDirect(r: RunPourStats): boolean {
  if (r.enDirect != null) return r.enDirect;
  return r.finishedAt == null || todayStr(new Date(r.finishedAt)) === r.date;
}

/** Meilleur run par date, tous types confondus (affichage des archives). */
export function meilleurParDate(runs: RunPourStats[]): Record<string, RunPourStats> {
  const out: Record<string, RunPourStats> = {};
  for (const r of runs) if (!out[r.date] || r.totalMs < out[r.date].totalMs) out[r.date] = r;
  return out;
}

/** Dates jouées en direct — les archives ne doivent pas alimenter la série. */
export function joursEnDirect(runs: RunPourStats[]): Set<string> {
  return new Set(runs.filter(estEnDirect).map((r) => r.date));
}

/** Série de jours consécutifs joués (jusqu'à `today` ou hier). */
export function calculeStreak(dates: Set<string>, today: string): number {
  let streak = 0;
  const d = new Date(today);
  if (!dates.has(today)) d.setDate(d.getDate() - 1); // la série tient encore si hier est joué
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    if (!dates.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Stats du profil, calculées depuis un historique de runs (local ou Supabase selon la source). */
export function calculeStats(historique: RunPourStats[], today: string): StatsJoueur {
  const runs = [...historique].sort((a, b) => a.date.localeCompare(b.date));
  const n = runs.length;
  if (n === 0) {
    return {
      runs: 0,
      flawless: 0,
      streak: 0,
      moyenneMs: 0,
      meilleur: null,
      meilleurRang: null,
      tauxPasseP: 0,
      totalMs: 0,
    };
  }
  const totalMs = runs.reduce((s, r) => s + r.totalMs, 0);
  let meilleur = { ms: runs[0].totalMs, date: runs[0].date };
  let meilleurRang = { rang: rangEstime(runs[0].date, runs[0].totalMs), date: runs[0].date };
  let lignes = 0;
  let passees = 0;
  for (const r of runs) {
    if (r.totalMs < meilleur.ms) meilleur = { ms: r.totalMs, date: r.date };
    const rang = rangEstime(r.date, r.totalMs);
    if (rang < meilleurRang.rang) meilleurRang = { rang, date: r.date };
    lignes += r.lines.length;
    passees += r.lines.filter((l) => l.status === 'skip').length;
  }
  return {
    runs: n,
    flawless: runs.filter((r) => r.flawless).length,
    streak: calculeStreak(joursEnDirect(runs), today),
    moyenneMs: totalMs / n,
    meilleur,
    meilleurRang,
    tauxPasseP: Math.round((passees / lignes) * 100),
    totalMs,
  };
}

export interface StatsJeu {
  id: string;
  nom: string;
  /** Nombre de runs où l'épreuve figurait dans le tirage. */
  joues: number;
  /** Temps moyen (ms) sur les runs où la durée a été enregistrée, `null` si aucun. */
  moyenneMs: number | null;
}

/**
 * Temps moyen par mini-jeu. La durée par épreuve (`GameLine.ms`) n'existe que
 * sur les runs récents : la moyenne ignore les lignes qui en sont dépourvues.
 */
export function statsParJeu(historique: RunPourStats[]): StatsJeu[] {
  const acc = new Map<string, { nom: string; joues: number; totalMs: number; mesures: number }>();
  for (const r of historique)
    for (const l of r.lines) {
      const j = acc.get(l.id) ?? { nom: l.nom, joues: 0, totalMs: 0, mesures: 0 };
      j.joues++;
      if (l.ms != null) {
        j.totalMs += l.ms;
        j.mesures++;
      }
      acc.set(l.id, j);
    }
  return [...acc.entries()]
    .map(([id, j]) => ({
      id,
      nom: j.nom,
      joues: j.joues,
      moyenneMs: j.mesures > 0 ? j.totalMs / j.mesures : null,
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** Durée compacte « 1h 6m » / « 26m ». */
export function formatHeures(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Date courte « 13 juil. 2026 ». */
export function formatDateCourte(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
