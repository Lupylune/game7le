/**
 * Pictogrammes SVG des mini-jeux, dessinés dans le langage graphique du site
 * (trait currentColor, bouts arrondis) — remplacent les émojis.
 */

/** Couronne pleine (reine posée sur la grille). */
export function SymCouronne({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="sym">
      <path d="M4.5 15.5 L3.5 7 L8 10.5 L12 5 L16 10.5 L20.5 7 L19.5 15.5 Z" fill="currentColor" />
      <rect x="5" y="17.2" width="14" height="2.6" rx="1.3" fill="currentColor" />
    </svg>
  );
}

/** Mine (démineur). */
export function SymMine({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="sym">
      <circle cx="12" cy="12" r="5.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 4.2 V7 M12 17 V19.8 M4.2 12 H7 M17 12 H19.8 M6.5 6.5 L8.4 8.4 M15.6 15.6 L17.5 17.5 M17.5 6.5 L15.6 8.4 M8.4 15.6 L6.5 17.5" />
      </g>
      <circle cx="10.3" cy="10.3" r="1.3" fill="var(--bg)" />
    </svg>
  );
}

/** Drapeau (démineur). */
export function SymDrapeau({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="sym">
      <path d="M8 3.5 L18 8 L8 12.5 Z" fill="var(--error)" />
      <path d="M8 3.5 V20.5 M5 20.5 H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Flamme (série de jours). Teintes braise du logotype. */
export function SymFlamme({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="sym">
      <path
        d="M12 2.5 C12.5 6 16.5 8 17.5 11.5 C18.7 15.7 16 20.5 12 20.5 C8 20.5 5.3 15.7 6.5 11.5 C7.1 9.4 8.8 8 9.5 6 C10.3 7.2 10.6 8.3 10.4 9.8 C11.5 8 12.3 5.5 12 2.5 Z"
        fill="#f29028"
      />
      <path
        d="M12 20.5 C9.8 20.5 8.6 18.3 9.3 16.2 C9.9 14.5 11.3 13.7 12 12 C12.7 13.7 14.1 14.5 14.7 16.2 C15.4 18.3 14.2 20.5 12 20.5 Z"
        fill="#fcd040"
      />
    </svg>
  );
}

/** Étincelles (sans-faute). */
export function SymEtincelle({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="sym">
      <path
        d="M10 3 C10.8 7 12 8.2 16 9 C12 9.8 10.8 11 10 15 C9.2 11 8 9.8 4 9 C8 8.2 9.2 7 10 3 Z"
        fill="#fcd040"
      />
      <path
        d="M17.5 12.5 C17.9 14.6 18.6 15.3 20.5 15.7 C18.6 16.1 17.9 16.8 17.5 19 C17.1 16.8 16.4 16.1 14.5 15.7 C16.4 15.3 17.1 14.6 17.5 12.5 Z"
        fill="#f29028"
      />
      <circle cx="15.5" cy="4.8" r="1.2" fill="#fcd040" />
    </svg>
  );
}

/** Étoile (badge des joueurs simulés du classement). */
export function SymEtoile({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="sym">
      <path
        d="M12 3 L14.23 8.93 L20.56 9.22 L15.61 13.17 L17.29 19.28 L12 15.8 L6.71 19.28 L8.39 13.17 L3.44 9.22 L9.77 8.93 Z"
        fill="#fcd040"
      />
    </svg>
  );
}

/** Pioche (mode creuser du démineur). */
export function SymPioche({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className="sym"
    >
      <path d="M4.5 19.5 L14 10" />
      <path d="M9.5 5 C13 4.2 17.5 6 19.5 10" />
    </svg>
  );
}
export default function GameIcon({ id, size = 20 }: { id: string; size?: number }) {
  const common = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'gicon',
    'aria-hidden': true,
  };
  switch (id) {
    case 'lemot': // trois cases de lettres, celle du centre trouvée
      return (
        <svg {...common}>
          <rect x="2.8" y="9.2" width="5.4" height="5.6" rx="1" />
          <rect x="9.3" y="9.2" width="5.4" height="5.6" rx="1" fill="currentColor" stroke="none" />
          <rect x="15.8" y="9.2" width="5.4" height="5.6" rx="1" />
        </svg>
      );
    case 'croises': // croix de mots croisés
      return (
        <svg {...common}>
          <rect x="9.2" y="3" width="5.6" height="5.6" rx="1" />
          <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1" />
          <rect x="9.2" y="15.4" width="5.6" height="5.6" rx="1" />
          <rect x="3" y="9.2" width="5.6" height="5.6" rx="1" />
          <rect x="15.4" y="9.2" width="5.6" height="5.6" rx="1" />
        </svg>
      );
    case 'paire': // étoile et cercle
      return (
        <svg {...common}>
          <path d="M7.5 7.5 L8.8 10.4 L11.8 10.7 L9.6 12.8 L10.2 15.8 L7.5 14.3 L4.8 15.8 L5.4 12.8 L3.2 10.7 L6.2 10.4 Z" />
          <circle cx="17" cy="12" r="3.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'sudoku': // grille 3×3, case centrale remplie
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
          <path d="M9.2 3.5 V20.5 M14.8 3.5 V20.5 M3.5 9.2 H20.5 M3.5 14.8 H20.5" />
          <rect x="10.4" y="10.4" width="3.2" height="3.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'reines': // couronne
      return (
        <svg {...common}>
          <path d="M4.5 16.5 L3.5 7.5 L8 11 L12 5.5 L16 11 L20.5 7.5 L19.5 16.5 Z" />
          <path d="M5.5 19.5 H18.5" />
        </svg>
      );
    case 'demineur': // mine
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="4.6" fill="currentColor" stroke="none" />
          <path d="M12 5.5 V8 M12 18 V20.5 M4.5 13 H7 M17 13 H19.5 M6.7 7.7 L8.5 9.5 M15.5 16.5 L17.3 18.3 M17.3 7.7 L15.5 9.5 M8.5 16.5 L6.7 18.3" />
        </svg>
      );
    case 'nonogramme': // damier partiellement rempli
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
          <path d="M12 3.5 V20.5 M3.5 12 H20.5" />
          <path d="M5.5 5.5 h4.5 v4.5 h-4.5 Z M14 14 h4.5 v4.5 h-4.5 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'ratiole': // forme coupée par une droite
      return (
        <svg {...common}>
          <path d="M12 3.5 L19.5 8.5 L17.5 18 L6.5 18 L4.5 8.5 Z" />
          <path d="M3 19.5 L21 6" strokeDasharray="3 2.4" />
        </svg>
      );
    case 'melimelo': // flèches croisées (mélange)
      return (
        <svg {...common}>
          <path d="M3.5 7 H7.5 C11 7 13 17 16.5 17 H19" />
          <path d="M3.5 17 H7.5 C11 17 13 7 16.5 7 H19" />
          <path d="M17 4.8 L19.8 7 L17 9.2 M17 14.8 L19.8 17 L17 19.2" />
        </svg>
      );
    case 'chromal': // œil (perception)
      return (
        <svg {...common}>
          <path d="M2.5 12 C5.5 6.8 9 4.8 12 4.8 C15 4.8 18.5 6.8 21.5 12 C18.5 17.2 15 19.2 12 19.2 C9 19.2 5.5 17.2 2.5 12 Z" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'trace': // crayon et trait
      return (
        <svg {...common}>
          <path d="M14.5 5 L19 9.5 L9.5 19 L4.5 19.5 L5 14.5 Z" />
          <path d="M3.5 22 C7 20.5 10 22.5 13.5 21" />
        </svg>
      );
    case 'dactylo': // clavier
      return (
        <svg {...common}>
          <rect x="2.5" y="7" width="19" height="11" rx="2" />
          <path d="M5.5 10.2 H5.6 M9 10.2 H9.1 M12.5 10.2 H12.6 M16 10.2 H16.1 M19 10.2 H19.1 M5.5 13 H5.6 M9 13 H9.1 M12.5 13 H12.6 M16 13 H16.1 M19 13 H19.1" strokeWidth="2.1" />
          <path d="M8 15.7 H16" />
        </svg>
      );
    case 'echecs': // pion
      return (
        <svg {...common}>
          <circle cx="12" cy="7.2" r="3.2" />
          <path d="M10.2 10.2 C10.2 12.8 9.2 14.6 7.8 16 L16.2 16 C14.8 14.6 13.8 12.8 13.8 10.2" />
          <path d="M6 19.5 C7.5 17.8 16.5 17.8 18 19.5 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}
