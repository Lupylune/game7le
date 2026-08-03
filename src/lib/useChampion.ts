import { useEffect, useState } from 'react';
import { classementSemaine } from './classement';
import { todayStr } from './rng';

/** Une date de la semaine précédente (7 jours avant), en UTC (indép. du fuseau). */
function semainePrecedente(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
}

/** Classes d'effet sur le pseudo, dans l'ordre du podium : or, argent, bronze. */
const CLASSES = ['lb-champion', 'lb-champion-argent', 'lb-champion-bronze'];

/**
 * Podium de la **semaine précédente** : les pseudos des 3 premiers du
 * classement hebdomadaire (moyenne des runs), dans l'ordre. Chacun conserve un
 * effet spécial sur son pseudo, partout où il apparaît, pendant TOUTE la
 * semaine en cours — jusqu'à être détrôné par le podium de cette semaine, qui
 * recevra le privilège la semaine suivante.
 *
 * Tableau vide tant que rien n'est chargé (ou semaine passée sans runs).
 * Best-effort : une petite requête au montage, comme les badges du classement.
 */
export function usePodiumSemaine(): string[] {
  const [podium, setPodium] = useState<string[]>([]);
  useEffect(() => {
    let vivant = true;
    classementSemaine(semainePrecedente(todayStr()), 3).then(
      (b) => vivant && setPodium(b.entries.slice(0, 3).map((e) => e.pseudo)),
    );
    return () => {
      vivant = false;
    };
  }, []);
  return podium;
}

/**
 * Classe CSS de l'effet podium pour un pseudo — `undefined` s'il n'y figure
 * pas. Le n°1 garde le reflet doré, les n°2 et n°3 un reflet argent et bronze.
 */
export function classePodium(podium: string[], pseudo: string): string | undefined {
  const i = podium.indexOf(pseudo);
  return i === -1 ? undefined : CLASSES[i];
}
