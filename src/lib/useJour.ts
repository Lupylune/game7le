import { useEffect, useState } from 'react';
import { prochainTirage, todayStr } from './rng';

/**
 * Jour courant (AAAA-MM-JJ, Europe/Paris) qui bascule de lui-même à minuit :
 * une page laissée ouverte la nuit passe au défi du lendemain sans
 * rechargement, au lieu de rester figée sur la date de son montage.
 *
 * Le minuteur est replanifié après chaque bascule, et le jour est revérifié au
 * retour sur l'onglet : les minuteurs des onglets en arrière-plan sont bridés,
 * donc on ne peut pas compter sur un `setTimeout` de plusieurs heures pour
 * tomber juste.
 */
export function useJourCourant(): string {
  const [jour, setJour] = useState(todayStr);

  useEffect(() => {
    let id = 0;
    const planifie = () => {
      // +50 ms de marge : on veut se réveiller *après* minuit, pas pile dessus.
      const reste = prochainTirage() - Date.now() + 50;
      id = window.setTimeout(() => {
        setJour(todayStr());
        planifie();
      }, Math.max(50, reste));
    };
    planifie();
    // Même valeur = React ne re-rend pas : appel sans risque à chaque réveil.
    const reveil = () => setJour(todayStr());
    document.addEventListener('visibilitychange', reveil);
    return () => {
      clearTimeout(id);
      document.removeEventListener('visibilitychange', reveil);
    };
  }, []);

  return jour;
}
