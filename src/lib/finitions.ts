import { useEffect, useLayoutEffect, type RefObject } from 'react';

/**
 * Finitions de l'interface, posées une fois par le Layout : la révélation des
 * blocs au défilement, la lueur qui suit le pointeur sur les cartes, et l'état
 * « page défilée » de la barre du haut. Tout est décor — rien ici ne touche
 * l'état d'un jeu, et rien ne s'applique dans un plateau : un `transform` en
 * cours sur un ancêtre décalerait les gestes que l'enregistreur rapporte à la
 * boîte des éléments, et ferait de lui le bloc englobant des pièces glissées.
 */

/** Blocs qui se dévoilent en entrant dans la fenêtre. */
const SELECTEUR_REVELATION = [
  '.accueil-defi',
  '.lb',
  '.rule-card',
  '.stat-tile',
  '.game-card',
  '.badge-carte',
  '.graphe',
  '.solution-card',
  '.etat-vide',
  '.archive-list > li',
  '.stats-jeux > li',
  '.runs-liste > li',
].join(',');

/**
 * Jamais sous ces conteneurs : les plateaux, la relecture d'un run, et les
 * solutions à onglets — qui remplacent leur carte à chaque onglet et ont déjà
 * leur fondu.
 */
const EXCLUS = '.game-area, .zone-epreuve, .lecteur, .solutions-a-onglets';

/** Cartes qui portent la lueur au survol — garder aligné avec styles.css. */
const SELECTEUR_LUEUR =
  '.tirage-carte, .accueil-defi, .rule-card, .stat-tile, .game-card, .badge-carte, .nouveaute-item';

/** Au-delà, les blocs entrés ensemble arrivent tous au même retard. */
const DECALAGE_MAX = 8;

const mouvementReduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Révèle au défilement les blocs de contenu sous `racine`. Un bloc pas encore
 * vu reçoit `data-rv="attente"` (transparent, un peu bas) avant d'être peint —
 * effet de mise en page, puis MutationObserver pour ce qui arrive plus tard
 * (classements chargés du serveur, onglets) ; l'IntersectionObserver le passe
 * à `"on"` à son entrée dans la fenêtre, puis l'attribut est retiré une fois la
 * transition finie. Un attribut et non une classe : React réécrit `className`
 * au moindre changement d'état d'une carte, il ne touche pas aux attributs
 * qu'il ne gère pas.
 *
 * `cle` (le pathname) relance le balayage à chaque navigation.
 */
export function useRevelations(racine: RefObject<HTMLElement | null>, cle: string) {
  useLayoutEffect(() => {
    const el = racine.current;
    if (!el || typeof IntersectionObserver === 'undefined' || mouvementReduit()) return;

    const io = new IntersectionObserver(
      (entrees) => {
        let rang = 0;
        for (const e of entrees) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          devoile(e.target as HTMLElement, Math.min(rang++, DECALAGE_MAX));
        }
      },
      // Un bloc se révèle quand il a vraiment commencé à entrer, pas dès qu'un
      // pixel affleure en bas de l'écran. La zone s'étend à perte de vue vers
      // le haut : un bloc sauté d'un coup (touche Fin, ancre) passe de « sous
      // l'écran » à « au-dessus », ce qui compte comme une entrée — sans ça il
      // resterait invisible, faute d'avoir jamais croisé la fenêtre.
      { rootMargin: '100000px 0px -6% 0px', threshold: 0.06 },
    );
    const arme = (n: Element) => {
      if (n.hasAttribute('data-rv') || n.closest(EXCLUS)) return;
      n.setAttribute('data-rv', 'attente');
      io.observe(n);
    };
    const balaie = (n: Element) => {
      if (n.matches(SELECTEUR_REVELATION)) arme(n);
      n.querySelectorAll(SELECTEUR_REVELATION).forEach(arme);
    };

    balaie(el);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach((n) => n instanceof Element && balaie(n));
    });
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      // Un bloc encore en attente ne doit pas rester invisible si le balayage
      // suivant ne le reprend pas (double montage du StrictMode en dev).
      el.querySelectorAll('[data-rv="attente"]').forEach((n) => n.removeAttribute('data-rv'));
    };
  }, [racine, cle]);
}

function devoile(n: HTMLElement, rang: number) {
  n.style.setProperty('--rv-i', String(rang));
  n.setAttribute('data-rv', 'on');
  let fini = false;
  const fin = (ev?: TransitionEvent) => {
    // les transitions des descendants remontent jusqu'ici : seule compte la sienne
    if (fini || (ev && (ev.target !== n || ev.propertyName !== 'opacity'))) return;
    fini = true;
    n.removeEventListener('transitionend', fin);
    n.removeAttribute('data-rv');
    n.style.removeProperty('--rv-i');
  };
  n.addEventListener('transitionend', fin);
  // filet : une transition interrompue (onglet masqué…) n'émet pas toujours sa fin
  window.setTimeout(fin, 700 + rang * 70 + 400);
}

/**
 * Lueur au survol des cartes : pose `--mx`/`--my` (position du pointeur dans
 * la carte, en px) sur la carte survolée, une fois par image au plus. Souris
 * seulement — au doigt, il n'y a pas de survol à suivre.
 */
export function useLueur() {
  useEffect(() => {
    let cible: HTMLElement | null = null;
    let x = 0;
    let y = 0;
    let image = 0;
    const peint = () => {
      image = 0;
      if (!cible) return;
      const r = cible.getBoundingClientRect();
      cible.style.setProperty('--mx', `${Math.round(x - r.left)}px`);
      cible.style.setProperty('--my', `${Math.round(y - r.top)}px`);
    };
    const bouge = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      cible = e.target instanceof Element ? e.target.closest<HTMLElement>(SELECTEUR_LUEUR) : null;
      if (!cible || cible.closest('.game-area')) return;
      x = e.clientX;
      y = e.clientY;
      if (!image) image = requestAnimationFrame(peint);
    };
    window.addEventListener('pointermove', bouge, { passive: true });
    return () => {
      window.removeEventListener('pointermove', bouge);
      cancelAnimationFrame(image);
    };
  }, []);
}

/**
 * Marque la barre du haut `data-defile` dès que la page a quitté son sommet :
 * c'est là qu'elle prend son verre dépoli. Posé directement sur le nœud, sans
 * état React — le Layout n'a pas à se re-rendre à chaque défilement.
 */
export function useEnteteDefilee(entete: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = entete.current;
    if (!el) return;
    let image = 0;
    const maj = () => {
      image = 0;
      el.toggleAttribute('data-defile', window.scrollY > 4);
    };
    const defile = () => {
      if (!image) image = requestAnimationFrame(maj);
    };
    maj();
    window.addEventListener('scroll', defile, { passive: true });
    return () => {
      window.removeEventListener('scroll', defile);
      cancelAnimationFrame(image);
    };
  }, [entete]);
}
