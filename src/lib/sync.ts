import { supabase } from './supabase';
import type { RunRecord } from './storage';
import type { RunPourStats } from './stats';

/**
 * Envoie un run au classement global Supabase (best-effort, non-bloquant).
 * Le local reste la source de vérité : si le backend est absent, injoignable,
 * ou en erreur, l'app continue de fonctionner normalement.
 */
export async function syncRun(pseudo: string, run: RunRecord, defi = false): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc('submit_run', {
      p_pseudo: pseudo,
      p_date: run.date,
      p_total_ms: Math.round(run.totalMs),
      p_lines: run.lines,
      p_flawless: run.flawless,
      p_en_direct: run.enDirect ?? true,
      p_defi: defi,
    });
  } catch {
    // silencieux : pas de retry, le run est déjà enregistré en local
  }
}

/**
 * Enregistre le badge choisi par un pseudo (picto affiché à côté du nom dans
 * le classement global). Best-effort et totalement isolé de `submit_run` : si
 * le backend n'a pas encore la RPC `set_badge` (migration non appliquée),
 * l'appel échoue silencieusement et la soumission des runs n'est pas affectée.
 */
export async function syncBadge(pseudo: string, badge: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc('set_badge', { p_pseudo: pseudo, p_badge: badge });
  } catch {
    // silencieux : le choix reste dans les réglages locaux
  }
}

/**
 * Badges choisis par un ensemble de pseudos (pour les afficher dans le
 * classement). Lecture best-effort de `comptes.badge` : `null` si le backend
 * est absent ou si la colonne n'existe pas encore — dans ce cas le classement
 * s'affiche simplement sans les badges des autres joueurs.
 */
export async function fetchBadges(pseudos: string[]): Promise<Record<string, string> | null> {
  if (!supabase || pseudos.length === 0) return null;
  try {
    const { data, error } = await supabase
      .from('comptes')
      .select('pseudo, badge')
      .in('pseudo', pseudos);
    if (error || !data) return null;
    const out: Record<string, string> = {};
    for (const r of data as { pseudo: string; badge: string | null }[])
      if (r.badge) out[r.pseudo] = r.badge;
    return out;
  } catch {
    return null;
  }
}

/**
 * Historique des runs d'un pseudo, tous appareils confondus (Supabase).
 * `null` si le backend est absent/injoignable : l'appelant retombe alors sur
 * l'historique local du navigateur.
 */
export async function fetchRunsParPseudo(pseudo: string): Promise<RunPourStats[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('runs')
    .select('date, total_ms, lines, flawless, finished_at, en_direct')
    .eq('pseudo', pseudo)
    .eq('defi', false)
    .order('date', { ascending: true });
  if (error || !data) return null;
  return data.map((r) => ({
    date: r.date,
    totalMs: r.total_ms,
    lines: r.lines,
    flawless: r.flawless,
    finishedAt: r.finished_at ? Date.parse(r.finished_at) : undefined,
    enDirect: r.en_direct,
  }));
}
