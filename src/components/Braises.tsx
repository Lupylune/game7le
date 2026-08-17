import { useLocation } from 'react-router-dom';

/**
 * Petites braises qui remontent en fond de l'accueil (et seulement là : les
 * pages de jeu et de données restent nues). Purement décoratif : couche fixe
 * derrière le contenu, sans interaction, et masquée si l'utilisateur demande
 * moins d'animations (voir styles.css).
 *
 * Monté par le Layout donc jamais démonté : quitter l'accueil éteint les
 * braises une à une (chacune a son propre `fondu`) au lieu de les faire
 * disparaître d'un coup, et y revenir les rallume de la même façon. Les cycles
 * de montée continuent pendant ce temps, donc le feu n'est jamais « rejoué »
 * depuis le début.
 *
 * La liste est écrite en dur plutôt que tirée au sort : le décor doit être le
 * même à chaque chargement (et pour les captures des tests).
 */
type Braise = {
  /** diamètre en px */
  taille: number;
  /** position horizontale de départ, en % de la largeur */
  gauche: number;
  /** durée de la montée, en s */
  duree: number;
  /** décalage négatif : la scène est déjà « en cours » au chargement */
  retard: number;
  /** amplitude du balancement latéral, en px */
  derive: number;
  /** durée du scintillement, en s */
  scintille: number;
  /** retard d'allumage / d'extinction, en s (échelonne le fondu) */
  fondu: number;
  /** 1 = orange (accent), 2 = jaune (warning) */
  teinte: 1 | 2;
};

const BRAISES: Braise[] = [
  { taille: 4, gauche: 3, duree: 17, retard: -3, derive: 22, scintille: 0.9, fondu: 0.7, teinte: 1 },
  { taille: 7, gauche: 8, duree: 24, retard: -14, derive: -34, scintille: 1.4, fondu: 0, teinte: 2 },
  { taille: 3, gauche: 12, duree: 13, retard: -8, derive: 16, scintille: 0.7, fondu: 1.3, teinte: 1 },
  { taille: 5, gauche: 17, duree: 20, retard: -18, derive: -26, scintille: 1.1, fondu: 0.4, teinte: 1 },
  { taille: 2, gauche: 21, duree: 11, retard: -5, derive: 12, scintille: 0.6, fondu: 1.6, teinte: 2 },
  { taille: 6, gauche: 26, duree: 26, retard: -22, derive: 30, scintille: 1.3, fondu: 0.2, teinte: 1 },
  { taille: 3, gauche: 31, duree: 15, retard: -11, derive: -18, scintille: 0.8, fondu: 1, teinte: 2 },
  { taille: 8, gauche: 36, duree: 29, retard: -2, derive: 38, scintille: 1.6, fondu: 0.5, teinte: 1 },
  { taille: 4, gauche: 40, duree: 18, retard: -16, derive: -20, scintille: 1, fondu: 1.5, teinte: 1 },
  { taille: 2, gauche: 45, duree: 12, retard: -7, derive: 14, scintille: 0.5, fondu: 0.9, teinte: 2 },
  { taille: 5, gauche: 49, duree: 22, retard: -25, derive: -28, scintille: 1.2, fondu: 0.1, teinte: 1 },
  { taille: 3, gauche: 54, duree: 14, retard: -12, derive: 18, scintille: 0.75, fondu: 1.8, teinte: 1 },
  { taille: 7, gauche: 59, duree: 27, retard: -6, derive: -36, scintille: 1.5, fondu: 0.6, teinte: 2 },
  { taille: 4, gauche: 63, duree: 19, retard: -20, derive: 24, scintille: 0.95, fondu: 1.2, teinte: 1 },
  { taille: 2, gauche: 68, duree: 10, retard: -4, derive: -10, scintille: 0.55, fondu: 0.3, teinte: 1 },
  { taille: 6, gauche: 72, duree: 25, retard: -15, derive: 32, scintille: 1.25, fondu: 1.7, teinte: 2 },
  { taille: 3, gauche: 77, duree: 16, retard: -9, derive: -16, scintille: 0.85, fondu: 0.8, teinte: 1 },
  { taille: 5, gauche: 81, duree: 21, retard: -27, derive: 26, scintille: 1.15, fondu: 0.15, teinte: 1 },
  { taille: 2, gauche: 86, duree: 12, retard: -13, derive: -12, scintille: 0.65, fondu: 1.4, teinte: 2 },
  { taille: 7, gauche: 90, duree: 28, retard: -19, derive: 34, scintille: 1.45, fondu: 0.55, teinte: 1 },
  { taille: 4, gauche: 94, duree: 18, retard: -10, derive: -22, scintille: 1.05, fondu: 1.1, teinte: 1 },
  { taille: 3, gauche: 98, duree: 15, retard: -24, derive: 16, scintille: 0.8, fondu: 0.35, teinte: 2 },
];

export default function Braises() {
  const allume = useLocation().pathname === '/';
  return (
    <div className={`braises${allume ? ' braises-on' : ''}`} aria-hidden="true">
      {BRAISES.map((b, i) => (
        <span
          key={i}
          className="braise"
          style={{
            left: `${b.gauche}%`,
            width: `${b.taille}px`,
            height: `${b.taille}px`,
            animationDuration: `${b.duree}s`,
            animationDelay: `${b.retard}s`,
          }}
        >
          <span
            className={`braise-i braise-t${b.teinte}`}
            style={{
              // la dérive et le scintillement ne durent pas la montée entière :
              // les cycles se déphasent, le mouvement ne se répète pas visiblement
              animationDuration: `${(b.duree / 4).toFixed(1)}s, ${b.scintille}s`,
              animationDelay: `${b.retard}s, ${b.retard}s`,
              ['--derive' as string]: `${b.derive}px`,
              ['--fondu' as string]: `${b.fondu}s`,
            }}
          />
        </span>
      ))}
    </div>
  );
}
