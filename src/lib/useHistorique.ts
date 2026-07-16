import { useEffect, useState } from 'react';
import { loadRuns } from './storage';
import { fetchRunsParPseudo } from './sync';
import type { RunPourStats } from './stats';

/**
 * Historique des runs d'un pseudo, indexé par date. Vient de Supabase si le
 * backend est configuré et joignable ; repli sur l'historique local du
 * navigateur sinon (absent, injoignable, ou chargement en cours).
 */
export function useHistorique(pseudo: string): Record<string, RunPourStats> {
  const [distant, setDistant] = useState<RunPourStats[] | null>(null);

  useEffect(() => {
    let vivant = true;
    fetchRunsParPseudo(pseudo).then((r) => vivant && setDistant(r));
    return () => {
      vivant = false;
    };
  }, [pseudo]);

  const source = distant ?? Object.values(loadRuns());
  return Object.fromEntries(source.map((r) => [r.date, r]));
}
