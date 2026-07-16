/** Logotype « Game7le » avec dégradé braise, repris du site original. */
export default function Logo({ height = 90 }: { height?: number }) {
  return (
    <svg
      viewBox="0 0 600 190"
      role="img"
      aria-label="Game7le"
      style={{ height, margin: '0 auto', overflow: 'visible' }}
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
        x="50%"
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
        x="50%"
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
