import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Conteneur dont la hauteur suit son contenu en transition, au lieu de sauter
 * quand ce contenu change (une carte remplacée par une autre plus haute). La
 * hauteur mesurée est posée en pixels — `auto` ne s'anime pas — et rafraîchie
 * par un ResizeObserver ; la CSS (`.hauteur-fluide`) porte la transition.
 */
export default function HauteurFluide({ children, className = '' }: { children: ReactNode; className?: string }) {
  const interieurRef = useRef<HTMLDivElement>(null);
  const [hauteur, setHauteur] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = interieurRef.current!;
    const mesure = () => setHauteur(el.offsetHeight);
    mesure();
    const ro = new ResizeObserver(mesure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`hauteur-fluide ${className}`} style={hauteur == null ? undefined : { height: hauteur }}>
      <div ref={interieurRef} className="hauteur-fluide-interieur">
        {children}
      </div>
    </div>
  );
}
