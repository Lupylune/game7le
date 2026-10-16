import { useEffect, useState } from 'react';
import { loadDefis, loadRuns } from './storage';
import { fetchDefisParPseudo, fetchRunsParPseudo } from './sync';
import type { RunPourStats } from './stats';

/**
 * Historique d'un pseudo, et s'il est encore en cours de chargement. Vient de
 * Supabase si le backend est configuré et joignable. Sinon (absent,
 * injoignable, ou chargement en cours) : repli sur l'historique local du
 * navigateur — **seulement pour son propre pseudo** (`repliLocal`). Le
 * localStorage ne porte pas de pseudo : sur le profil d'un autre joueur, il
 * montrerait nos propres runs sous son nom.
 */
function useHistoriqueDe(
  pseudo: string,
  repliLocal: boolean,
  distantDe: (p: string) => Promise<RunPourStats[] | null>,
  local: () => RunPourStats[],
): { runs: RunPourStats[]; charge: boolean } {
  const [distant, setDistant] = useState<RunPourStats[] | null>(null);
  const [charge, setCharge] = useState(true);

  useEffect(() => {
    let vivant = true;
    setDistant(null); // ne pas garder l'historique d'un pseudo précédent
    setCharge(true);
    distantDe(pseudo).then((r) => {
      if (!vivant) return;
      setDistant(r);
      setCharge(false);
    });
    return () => {
      vivant = false;
    };
  }, [pseudo, distantDe]);

  return { runs: distant ?? (repliLocal ? local() : []), charge };
}

/**
 * Historique des runs d'un pseudo (voir `useHistoriqueDe`). Une date peut
 * avoir jusqu'à deux runs : le meilleur joué en direct et le meilleur rejoué
 * en archive (voir `estEnDirect` / `meilleurParDate` dans stats.ts pour filtrer).
 */
export function useHistorique(pseudo: string, repliLocal = true): RunPourStats[] {
  return useHistoriqueDe(pseudo, repliLocal, fetchRunsParPseudo, loadRuns).runs;
}

/** Comme `useHistorique`, avec l'état de chargement (profil d'un autre joueur). */
export function useHistoriqueEtat(pseudo: string, repliLocal = true) {
  return useHistoriqueDe(pseudo, repliLocal, fetchRunsParPseudo, loadRuns);
}

/**
 * Historique des défis hebdomadaires difficiles d'un pseudo, tous appareils
 * confondus — même principe que `useHistorique` mais sur `defi = true` côté
 * Supabase. Sans ça, un défi complété sur un autre appareil / après un vidage
 * du navigateur resterait invisible localement alors qu'il est bien enregistré
 * côté serveur.
 */
export function useHistoriqueDefis(pseudo: string, repliLocal = true): RunPourStats[] {
  return useHistoriqueDe(pseudo, repliLocal, fetchDefisParPseudo, loadDefis).runs;
}
