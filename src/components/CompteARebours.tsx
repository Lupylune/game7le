import { useEffect, useState } from 'react';
import { formatCompteARebours } from '../lib/time';

/**
 * Compte à rebours vers un instant donné (epoch ms). Composant à part pour que
 * son battement à la seconde ne fasse re-rendre que lui, et non la page qui
 * l'accueille — l'accueil relit son historique et son classement à chaque
 * rendu. Le réveil est recalé sur l'horloge à chaque tic (délai jusqu'à la
 * prochaine frontière de seconde) : ni dérive, ni seconde sautée.
 */
export default function CompteARebours({
  cible,
  libelle,
}: {
  cible: number;
  libelle: string;
}) {
  const [reste, setReste] = useState(() => Math.max(0, cible - Date.now()));

  useEffect(() => {
    let id = 0;
    const tick = () => {
      const r = Math.max(0, cible - Date.now());
      setReste(r);
      // À zéro on s'arrête : c'est `useJourCourant` qui prend le relais et
      // fournit la cible suivante (nouveau `cible` → cet effet repart).
      if (r > 0) id = window.setTimeout(tick, Math.max(50, r % 1000));
    };
    const initial = Math.max(0, cible - Date.now());
    if (initial > 0) id = window.setTimeout(tick, Math.max(50, initial % 1000));
    return () => clearTimeout(id);
  }, [cible]);

  return (
    <span className="compte-a-rebours">
      {libelle} <strong>{formatCompteARebours(reste)}</strong>
    </span>
  );
}
