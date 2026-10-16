import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Logotype « Game7le » avec dégradé braise, repris du site original.
 *
 * Centré (par défaut), le mot flotte au milieu d'un cadre de 600 × 190 qui lui
 * laisse de l'air de chaque côté. Aligné à gauche (`centre={false}`), ces
 * marges décaleraient le mot par rapport au texte qui l'accompagne : le cadre
 * est alors recadré sur le mot lui-même (mesuré une fois la police chargée),
 * et `height` devient la hauteur des lettres. Le halo déborde (`overflow`).
 */
export default function Logo({ height = 90, centre = true }: { height?: number; centre?: boolean }) {
  const motRef = useRef<SVGTextElement>(null);
  const [cadre, setCadre] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (centre) return;
    let vivant = true;
    const mesure = () => {
      const t = motRef.current;
      if (vivant && t) setCadre(t.getBBox());
    };
    mesure();
    // la police d'affichage arrive après le premier rendu : on remesure
    document.fonts?.ready.then(mesure);
    return () => {
      vivant = false;
    };
  }, [centre]);

  const recadre = !centre && cadre && cadre.width > 0;
  return (
    <svg
      viewBox={recadre ? `${cadre.x} ${cadre.y} ${cadre.width} ${cadre.height}` : '0 0 600 190'}
      role="img"
      aria-label="Game7le"
      style={{
        height,
        // Aligné à gauche : largeur à la mesure du dessin, sans marge auto
        ...(centre
          ? { margin: '0 auto' }
          : { width: 'auto', aspectRatio: recadre ? `${cadre.width} / ${cadre.height}` : '600 / 190' }),
        overflow: 'visible',
      }}
    >
      <defs>
        <linearGradient id="braise" x1="0" y1="170" x2="0" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9a1808" />
          <stop offset="28%" stopColor="#d44418" />
          <stop offset="58%" stopColor="#f29028" />
          <stop offset="85%" stopColor="#fcd040" />
          <stop offset="100%" stopColor="#fff5a0" />
        </linearGradient>
        <filter id="halo" x="-15%" y="-60%" width="130%" height="220%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
      </defs>
      <text
        x="300"
        y="150"
        textAnchor="middle"
        fill="url(#braise)"
        filter="url(#halo)"
        opacity="0.7"
        style={{ fontFamily: 'var(--font-display)', fontSize: 92 }}
      >
        Game7le
      </text>
      <text
        ref={motRef}
        x="300"
        y="150"
        textAnchor="middle"
        fill="url(#braise)"
        style={{ fontFamily: 'var(--font-display)', fontSize: 92 }}
      >
        Game7le
      </text>
    </svg>
  );
}
