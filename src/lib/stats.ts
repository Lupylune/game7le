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
}

/**
 * Dates jouées « en direct », c.-à-d. le jour même du puzzle (`finishedAt` tombe
 * le même jour que `date`). Les archives — rejouées après coup — sont exclues :
 * elles ne doivent pas alimenter la série. Un run sans `finishedAt` est compté
 * comme en direct (rétro-compat avec les anciens enregistrements).
 */
export function joursEnDirect(runs: RunPourStats[]): Set<string> {
  return new Set(
    runs
      .filter((r) => r.finishedAt == null || todayStr(new Date(r.finishedAt)) === r.date)
      .map((r) => r.date),
  );
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
