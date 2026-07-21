import { useEffect, useState } from 'react';
import { loadDefis, loadRuns } from './storage';
import { fetchDefisParPseudo, fetchRunsParPseudo } from './sync';
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

/**
 * Historique des défis hebdomadaires difficiles d'un pseudo, tous appareils
 * confondus — même principe que `useHistorique` mais sur la table `defis`
 * (`defi = true` côté Supabase). Sans ça, un défi complété sur un autre
 * appareil / après un vidage du navigateur resterait invisible localement
 * alors qu'il est bien enregistré côté serveur.
 */
export function useHistoriqueDefis(pseudo: string): RunPourStats[] {
  const [distant, setDistant] = useState<RunPourStats[] | null>(null);

  useEffect(() => {
    let vivant = true;
    setDistant(null);
    fetchDefisParPseudo(pseudo).then((r) => vivant && setDistant(r));
    return () => {
      vivant = false;
    };
  }, [pseudo]);

  return distant ?? loadDefis();
}
