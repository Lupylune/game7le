import { useEffect, useState } from 'react';
import { formatMs } from '../lib/time';

/**
 * Durée qui défile de 0 jusqu'à sa valeur (ease-out), après `delaiMs` : les
 * temps d'un tirage se « posent » au lieu d'apparaître figés. Sous
 * `prefers-reduced-motion`, la valeur finale s'affiche d'emblée.
 */
export default function CompteurMs({
  ms,
  delaiMs = 0,
  dureeMs = 900,
}: {
  ms: number;
  delaiMs?: number;
  dureeMs?: number;
}) {
  const [v, setV] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? ms : 0,
  );

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setV(ms);
      return;
    }
    const t0 = performance.now() + delaiMs;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - t0) / dureeMs));
      setV(ms * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ms, delaiMs, dureeMs]);

  return <>{formatMs(v)}</>;
}
