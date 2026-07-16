import { supabase } from './supabase';
import type { RunRecord } from './storage';

/**
 * Envoie un run au classement global Supabase (best-effort, non-bloquant).
 * Le local reste la source de vérité : si le backend est absent, injoignable,
 * ou en erreur, l'app continue de fonctionner normalement.
 */
export async function syncRun(pseudo: string, run: RunRecord): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc('submit_run', {
      p_pseudo: pseudo,
      p_date: run.date,
      p_total_ms: Math.round(run.totalMs),
      p_lines: run.lines,
      p_flawless: run.flawless,
    });
  } catch {
    // silencieux : pas de retry, le run est déjà enregistré en local
  }
}
