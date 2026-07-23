import { useEffect, useState } from 'react';
import { classementSemaine } from './classement';
import { todayStr } from './rng';

/** Une date de la semaine précédente (7 jours avant), en UTC (indép. du fuseau). */
function semainePrecedente(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
}

/**
 * Pseudo du·de la « champion·ne en titre » : le·la n°1 du classement
 * hebdomadaire (moyenne des runs) de la **semaine précédente**. Il·elle
 * conserve un effet spécial sur son pseudo, partout où il apparaît, pendant
 * TOUTE la semaine en cours — jusqu'à être détrôné·e par le·la vainqueur de
 * cette semaine, qui recevra le privilège la semaine suivante.
 *
 * `null` tant que rien n'est chargé (ou semaine passée sans runs). Best-effort :
 * une petite requête au montage, comme les badges du classement.
 */
export function useChampionSemaine(): string | null {
  const [champion, setChampion] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    classementSemaine(semainePrecedente(todayStr()), 1).then(
      (b) => vivant && setChampion(b.entries[0]?.pseudo ?? null),
    );
    return () => {
      vivant = false;
    };
  }, []);
  return champion;
}
