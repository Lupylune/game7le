import { useRef, type FormEvent } from 'react';

/**
 * Capture de texte fiable avec un clavier virtuel mobile. GBoard/iOS ne
 * frappent pas « une touche = un caractère » : ils composent et réécrivent la
 * valeur du champ (l'autocorrection re-commet tout le mot au moment de
 * l'espace). On diffe donc la valeur avec la précédente et on n'émet que les
 * caractères réellement ajoutés ; une réécriture à l'identique n'émet rien et
 * une suppression appelle `onEfface`.
 */
export function useSaisieTexte(onChar: (ch: string) => void, onEfface?: () => void) {
  const prevRef = useRef('');
  return function onInput(e: FormEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const v = el.value;
    const prev = prevRef.current;
    let i = 0;
    while (i < prev.length && i < v.length && prev[i] === v[i]) i++;
    const ajout = v.slice(i);
    prevRef.current = v;
    if (!ajout && v.length < prev.length) {
      onEfface?.();
      return;
    }
    //   : certains claviers insèrent une espace insécable
    for (const ch of ajout) onChar(ch === ' ' ? ' ' : ch);
    // On repart de zéro à la frontière de mot (la composition du clavier y est
    // déjà validée) ou au-delà d'une taille limite ; vider le champ pendant
    // une composition en cours ferait re-commettre les mêmes caractères.
    if (v.endsWith(' ') || v.length > 80) {
      el.value = '';
      prevRef.current = '';
    }
  };
}
