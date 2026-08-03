import { useEffect, useState } from 'react';

/**
 * Compte à rebours de `delaiS` secondes depuis le montage du composant : renvoie
 * les secondes restantes, 0 une fois écoulé. Sert à verrouiller « Vérifier » en
 * début de partie, pour empêcher de sonder la solution dès la première case.
 */
export function useVerrou(delaiS: number): number {
  const [restant, setRestant] = useState(delaiS);
  useEffect(() => {
    const fin = Date.now() + delaiS * 1000;
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
      setRestant(s);
      if (s === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [delaiS]);
  return restant;
}
