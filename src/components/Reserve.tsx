import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatAdjust } from '../lib/time';

/** Temps laissé pour lire l'apport avant qu'il ne se verse, puis durée du versement. */
const DELAI_MS = 600;
const DUREE_MS = 900;
/** Sous `prefers-reduced-motion` : l'apport reste affiché, puis bascule d'un coup. */
const BASCULE_MS = 900;

/**
 * Réserve de bonus/malus, à droite du chrono. Un nouvel ajustement apparaît
 * au-dessus d'elle avec son motif, puis s'y verse : l'apport se vide pendant
 * que la réserve glisse vers son nouveau total — le même geste que l'écran de
 * résultats, où la réserve se vide dans le temps final. Plusieurs ajustements
 * rapprochés s'additionnent dans le même apport.
 */
export default function Reserve({ ms, motif }: { ms: number; motif: string }) {
  const [affiche, setAffiche] = useState(ms);
  const afficheRef = useRef(ms);
  // Écart au début du versement en cours : l'apport s'efface à mesure qu'il se vide
  const ecartRef = useRef(0);

  useEffect(() => {
    const depart = afficheRef.current;
    if (depart === ms) return;
    ecartRef.current = ms - depart;
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const e = now - t0;
      const p = reduit ? (e >= BASCULE_MS ? 1 : 0) : Math.max(0, Math.min(1, (e - DELAI_MS) / DUREE_MS));
      const v = depart + (ms - depart) * (1 - Math.pow(1 - p, 3)); // ease-out cubique
      afficheRef.current = v;
      setAffiche(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ms]);

  const apport = ms - affiche;
  // formatAdjust arrondit à la seconde : sous 0,5 s il n'y a plus rien à lire
  const enCours = Math.abs(apport) >= 500;
  const visible = Math.abs(affiche) >= 500;
  const reste = ecartRef.current ? Math.min(1, Math.abs(apport / ecartRef.current)) : 0;

  return (
    <span className="reserve">
      {enCours && (
        <span
          className={`reserve-apport ${apport < 0 ? 'bonus' : 'malus'}`}
          style={{ '--reste': reste } as CSSProperties}
        >
          {formatAdjust(apport)}
          {motif && <small>{motif}</small>}
        </span>
      )}
      {visible && (
        <span className={`adj ${affiche < 0 ? 'bonus' : affiche > 0 ? 'malus' : ''}`}>
          {formatAdjust(affiche)}
        </span>
      )}
    </span>
  );
}
