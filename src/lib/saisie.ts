import { useEffect, useRef, type FormEvent } from 'react';

/**
 * Capture de texte fiable avec un clavier virtuel mobile. GBoard, iOS et
 * surtout le clavier Samsung ne frappent pas « une touche = un caractère » :
 * ils composent et réécrivent la valeur du champ. Le clavier Samsung va plus
 * loin — à chaque touche il vide la zone de composition puis re-commet le mot
 * entier, en deux événements `input` successifs. Lus un par un, ces
 * événements ressemblent à « tout supprimer puis retaper », d'où des lettres
 * fantômes.
 *
 * On ne lit donc jamais un événement isolé : on regroupe la rafale sur une
 * frame et on diffe la valeur *finale* du champ avec le texte déjà transmis.
 * Seuls les caractères réellement ajoutés sont émis ; une réécriture à
 * l'identique n'émet rien et une suppression appelle `onEfface`.
 */
export function useSaisieTexte(onChar: (ch: string) => void, onEfface?: () => void) {
  // texte déjà transmis pour le contenu courant du champ
  const emisRef = useRef('');
  const elRef = useRef<HTMLInputElement | null>(null);
  const frameRef = useRef(0);
  // rappels toujours frais : le traitement est différé d'une frame
  const cbRef = useRef({ onChar, onEfface });
  cbRef.current = { onChar, onEfface };

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  return function onInput(e: FormEvent<HTMLInputElement>) {
    elRef.current = e.currentTarget;
    // une rafale est déjà planifiée : on ne traitera que l'état final
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const el = elRef.current;
      if (!el) return;
      const v = el.value;
      const prev = emisRef.current;
      let i = 0;
      while (i < prev.length && i < v.length && prev[i] === v[i]) i++;
      emisRef.current = v;
      // caractères retirés en fin de valeur → autant d'effacements
      for (let k = i; k < prev.length; k++) cbRef.current.onEfface?.();
      //   : certains claviers insèrent une espace insécable
      for (const ch of v.slice(i)) cbRef.current.onChar(ch === ' ' ? ' ' : ch);
      // On repart de zéro à la frontière de mot (la composition du clavier y est
      // déjà validée) ou au-delà d'une taille limite ; vider le champ pendant
      // une composition en cours ferait re-commettre les mêmes caractères.
      if (v.endsWith(' ') || v.length > 80) {
        el.value = '';
        emisRef.current = '';
      }
    });
  };
}
