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
