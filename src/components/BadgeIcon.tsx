/**
 * Pictogrammes SVG des badges (achievements), dans le langage graphique du
 * site — formes pleines, bouts arrondis. La couleur suit le niveau atteint
 * (bronze / argent / or) ; `null` = verrouillé (teinte discrète).
 */
import { BADGE_PAR_ID, parseToken, type Niveau } from '../lib/badges';

const COULEURS: Record<Niveau, string> = {
  bronze: '#c17a3f',
  argent: '#aeb4bd',
  or: '#edc23a',
};

export function couleurNiveau(niveau: Niveau | null): string {
  // Verrouillé : gris OPAQUE (pas var(--text-muted), semi-transparent, qui
  // s'additionnerait aux recouvrements de formes). Le grisé vient de l'opacité
  // de la vignette, appliquée au groupe entier — donc homogène.
  return niveau ? COULEURS[niveau] : 'color-mix(in srgb, var(--text) 50%, var(--bg))';
}

function glyphe(id: string, c: string) {
  const trait = { stroke: c, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (id) {
    case 'premiers-pas': // germe (première pousse)
      return (
        <>
          <path d="M12 21 V12" {...trait} />
          <path d="M12 14 C8.5 14 6 11 6 7.5 C9.5 7.5 12 9.8 12 13.5 Z" fill={c} />
          <path d="M12 12.5 C15.5 12.5 18 9.5 18 6 C14.5 6 12 8.3 12 12 Z" fill={c} />
        </>
      );
    case 'sans-faute': // étincelle 4 branches
      return <path d="M12 2 L14 9 L21 12 L14 15 L12 22 L10 15 L3 12 L10 9 Z" fill={c} />;
    case 'en-feu': // flamme
      return (
        <path
          d="M12 2.5 C12.5 6 16.5 8 17.5 11.5 C18.7 15.7 16 21 12 21 C8 21 5.3 15.7 6.5 11.5 C7.1 9.4 8.8 8 9.5 6 C10.3 7.2 10.6 8.3 10.4 9.8 C11.5 8 12.3 5.5 12 2.5 Z"
          fill={c}
        />
      );
    case 'assidu': // trophée
      return (
        <>
          <path d="M6.5 4 H17.5 V7.5 C17.5 10.8 15.1 13 12 13 C8.9 13 6.5 10.8 6.5 7.5 Z" fill={c} />
          <path d="M6.5 5.5 H4.2 C4.2 8 5 9.2 6.9 9.7 M17.5 5.5 H19.8 C19.8 8 19 9.2 17.1 9.7" {...trait} />
          <path d="M12 13 V16.5" {...trait} />
          <rect x="8" y="16.5" width="8" height="2.4" rx="1.2" fill={c} />
        </>
      );
    case 'centurion': // médaille + ruban
      return (
        <>
          <path d="M9 14 L7.3 22 L12 19.3 L16.7 22 L15 14 Z" fill={c} />
          <circle cx="12" cy="9.5" r="6.2" fill={c} />
          <circle cx="12" cy="9.5" r="2.7" fill="var(--bg)" />
        </>
      );
    case 'bolide': // éclair
      return <path d="M13 2 L4 13.5 H10.5 L9 22 L20 9 H12 Z" fill={c} />;
    case 'numero-un': // étoile 5 branches
      return (
        <path
          d="M12 2.5 L14.6 8.9 L21.5 9.4 L16.2 13.9 L18 20.6 L12 16.8 L6 20.6 L7.8 13.9 L2.5 9.4 L9.4 8.9 Z"
          fill={c}
        />
      );
    case 'archiviste': // pile de livres
      return (
        <>
          <rect x="4" y="15" width="16" height="4" rx="1" fill={c} />
          <rect x="5" y="10.6" width="14" height="4" rx="1" fill={c} />
          <rect x="6" y="6.2" width="12" height="4" rx="1" fill={c} />
          <path d="M8.5 6.2 V10.2 M8 10.6 V14.6 M7.5 15 V19" stroke="var(--bg)" strokeWidth="1.1" />
        </>
      );
    case 'marathonien': // sablier
      return (
        <>
          <path d="M7 3.5 H17 L12 12 Z" fill={c} />
          <path d="M7 20.5 H17 L12 12 Z" fill={c} />
          <path d="M5.8 3.5 H18.2 M5.8 20.5 H18.2" {...trait} />
        </>
      );
    case 'costaud': // crâne
      return (
        <>
          <path
            d="M12 3 C7.5 3 4.5 6 4.5 10.5 C4.5 13 5.5 14.6 7 15.6 V18 H17 V15.6 C18.5 14.6 19.5 13 19.5 10.5 C19.5 6 16.5 3 12 3 Z"
            fill={c}
          />
          <circle cx="9" cy="10.5" r="1.9" fill="var(--bg)" />
          <circle cx="15" cy="10.5" r="1.9" fill="var(--bg)" />
          <path d="M12 12.5 L10.9 14.6 H13.1 Z" fill="var(--bg)" />
          <path d="M9.5 18 V20.4 M12 18 V20.8 M14.5 18 V20.4" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case 'elite': // éclat (explosion)
      return (
        <path
          d="M12 2 L14 8 L20 5 L16.2 10.4 L22 12 L16.2 13.6 L20 19 L14 16 L12 22 L10 16 L4 19 L7.8 13.6 L2 12 L7.8 10.4 L4 5 L10 8 Z"
          fill={c}
        />
      );
    default:
      return <circle cx="12" cy="12" r="7" fill={c} />;
  }
}

export default function BadgeIcon({
  id,
  niveau,
  size = 20,
}: {
  id: string;
  niveau: Niveau | null;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="badge-icon">
      {glyphe(id, couleurNiveau(niveau))}
    </svg>
  );
}

/**
 * Picto d'un badge à partir de son token (`id` ou `id:niveau`), tel que stocké
 * dans les réglages / synchronisé. Rien si le token est vide ou inconnu.
 */
export function BadgePicto({ token, size = 18 }: { token: string | undefined | null; size?: number }) {
  const b = parseToken(token);
  if (!b) return null;
  return (
    <span
      className="badge-picto"
      title={BADGE_PAR_ID[b.id]?.nom}
      aria-label={BADGE_PAR_ID[b.id]?.nom}
      role="img"
    >
      <BadgeIcon id={b.id} niveau={b.niveau ?? 'or'} size={size} />
    </span>
  );
}
