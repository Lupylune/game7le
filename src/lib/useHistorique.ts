import { useEffect, useState } from 'react';
import { loadRuns } from './storage';
import { fetchRunsParPseudo } from './sync';
import type { RunPourStats } from './stats';

/**
 * Historique des runs d'un pseudo. Vient de Supabase si le backend est
 * configuré et joignable ; repli sur l'historique local du navigateur sinon
 * (absent, injoignable, ou chargement en cours). Une date peut avoir jusqu'à
 * deux runs : le meilleur joué en direct et le meilleur rejoué en archive
 * (voir `estEnDirect` / `meilleurParDate` dans stats.ts pour filtrer).
 */
export function useHistorique(pseudo: string): RunPourStats[] {
  const [distant, setDistant] = useState<RunPourStats[] | null>(null);

  useEffect(() => {
    let vivant = true;
    setDistant(null); // ne pas garder l'historique d'un pseudo précédent
    fetchRunsParPseudo(pseudo).then((r) => vivant && setDistant(r));
    return () => {
      vivant = false;
    };
  }, [pseudo]);

  return distant ?? loadRuns();
}
