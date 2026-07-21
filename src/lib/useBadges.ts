import { useEffect, useState } from 'react';
import { loadSettings, saveSettings } from './storage';
import { rangsReels } from './classement';
import { fetchBadges } from './sync';
import { estEnDirect } from './stats';
import { useHistorique, useHistoriqueDefis } from './useHistorique';
import { todayStr } from './rng';
import { calculeBadges, type CtxBadges, type EtatBadge } from './badges';

/**
 * État de tous les badges d'un pseudo, calculé depuis son historique (runs
 * quotidiens + défis + rangs réels). Le nombre de premières places est chargé
 * depuis Supabase quand il est disponible ; sinon le badge Numéro 1 reste
 * verrouillé (rangs réels inconnus).
 */
export function useBadges(pseudo: string): EtatBadge[] {
  const runs = useHistorique(pseudo);
  const runsLive = runs.filter(estEnDirect);
  const defis = useHistoriqueDefis(pseudo);
  const [nbNumeroUn, setNbNumeroUn] = useState(0);

  const datesKey = runsLive
    .map((r) => r.date)
    .sort()
    .join(',');

  useEffect(() => {
    let vivant = true;
    setNbNumeroUn(0);
    rangsReels(pseudo, datesKey ? datesKey.split(',') : []).then((r) => {
      if (!vivant || !r) return;
      setNbNumeroUn(Object.values(r).filter((v) => v.rang === 1).length);
    });
    return () => {
      vivant = false;
    };
  }, [pseudo, datesKey]);

  const ctx: CtxBadges = {
    runs,
    runsLive,
    defis,
    nbNumeroUn,
    today: todayStr(),
  };
  return calculeBadges(ctx);
}

/**
 * Badges (tokens) choisis par un ensemble de pseudos, pour les afficher dans un
 * classement. Best-effort : objet vide tant que rien n'est chargé ou si le
 * backend ne fournit pas les badges.
 */
export function useBadgesJoueurs(pseudos: string[]): Record<string, string> {
  const key = [...new Set(pseudos)].sort().join(',');
  const [badges, setBadges] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivant = true;
    fetchBadges(key ? key.split(',') : []).then((r) => {
      if (vivant && r) setBadges(r);
    });
    return () => {
      vivant = false;
    };
  }, [key]);
  return badges;
}

/**
 * Rapatrie, sur un appareil/navigateur neuf, le badge épinglé au pseudo courant
 * depuis Supabase vers les réglages locaux — le badge suit ainsi le pseudo d'un
 * appareil à l'autre. Ne remplit que si aucun badge local n'est déjà choisi : un
 * choix local n'est jamais écrasé (et `fetchBadges` ne sait pas distinguer « pas
 * de badge » de « backend indisponible », donc un pull ne peut pas effacer).
 */
export function useRestaureBadge(pseudo: string): void {
  useEffect(() => {
    if (!pseudo || pseudo === 'Vous') return;
    if (loadSettings().badge) return; // un badge local est déjà choisi
    let vivant = true;
    fetchBadges([pseudo]).then((r) => {
      if (!vivant || !r) return;
      const token = r[pseudo];
      if (!token) return;
      const s = loadSettings();
      if (s.badge) return; // choisi entre-temps : on ne l'écrase pas
      saveSettings({ ...s, badge: token });
    });
    return () => {
      vivant = false;
    };
  }, [pseudo]);
}
