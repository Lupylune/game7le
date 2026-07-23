import { useState } from 'react';
import { Link } from 'react-router-dom';
import GameIcon, { SymCouronne } from './GameIcon';
import BadgeIcon from './BadgeIcon';

/**
 * Icône « Nouveautés » de la barre du haut : ouvre un popin mettant en avant les
 * dernières fonctionnalités (champion de la semaine, Atlas, Pokédle, badges).
 * Une pastille signale les nouveautés non encore vues ; l'ouverture du popin
 * marque la version comme vue (mémorisée en localStorage). Bumper `VERSION`
 * réaffiche la pastille après l'ajout d'autres nouveautés.
 */
const VERSION = 'champion-atlas-badges-pokedle';
const CLE = 'game7le:nouveautes-vues';

function dejaVu(): boolean {
  try {
    return localStorage.getItem(CLE) === VERSION;
  } catch {
    return true;
  }
}

export default function Nouveautes() {
  const [ouvert, setOuvert] = useState(false);
  const [vu, setVu] = useState(dejaVu);

  const ouvrir = () => {
    setOuvert(true);
    if (!vu) {
      try {
        localStorage.setItem(CLE, VERSION);
      } catch {
        /* stockage indisponible : la pastille disparaît quand même pour la session */
      }
      setVu(true);
    }
  };

  return (
    <>
      <button
        className="icon-btn nouveautes-btn"
        aria-label="Nouveautés"
        title="Nouveautés"
        onClick={ouvrir}
      >
        {/* Bulle de chat : contour en un seul tracé continu (aucun croisement)
            + points en formes pleines séparées, pour éviter que des traits
            semi-transparents se superposent et foncent par endroits. */}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="10" r="1.1" fill="currentColor" />
          <circle cx="12" cy="10" r="1.1" fill="currentColor" />
          <circle cx="16" cy="10" r="1.1" fill="currentColor" />
        </svg>
        {!vu && <span className="nouveautes-dot" aria-hidden="true" />}
      </button>

      {ouvert && (
        <div className="modal-overlay" onClick={() => setOuvert(false)}>
          <div
            className="nouveautes-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Nouveautés"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nouveautes-head">
              <h2>Nouveautés</h2>
              <button className="nouveautes-close" aria-label="Fermer" title="Fermer" onClick={() => setOuvert(false)}>
                ✕
              </button>
            </div>
            <div className="nouveautes-liste">
              <Link to="/classement" className="nouveaute-item" onClick={() => setOuvert(false)}>
                <span className="nouveaute-ico">
                  <SymCouronne size={26} />
                </span>
                <span className="nouveaute-txt">
                  <strong>Champion de la semaine</strong>
                  <span className="muted">
                    Le n°1 de la semaine passée a le droit à un ramen et un reflet doré sur son pseudo, jusqu'à
                    être détrôné.
                  </span>
                </span>
              </Link>
              <Link to="/entrainement/atlas" className="nouveaute-item" onClick={() => setOuvert(false)}>
                <span className="nouveaute-ico">
                  <GameIcon id="atlas" size={26} />
                </span>
                <span className="nouveaute-txt">
                  <strong>Atlas</strong>
                  <span className="muted">
                    Un nouveau mini-jeu : un panorama 360° du monde, devinez où vous êtes.
                  </span>
                </span>
              </Link>
              <Link to="/entrainement/pokedle" className="nouveaute-item" onClick={() => setOuvert(false)}>
                <span className="nouveaute-ico">
                  <GameIcon id="pokedle" size={26} />
                </span>
                <span className="nouveaute-txt">
                  <strong>Pokédle</strong>
                  <span className="muted">Un nouveau mini-jeu : devinez le Pokémon du jour.</span>
                </span>
              </Link>
              <Link to="/profil" className="nouveaute-item" onClick={() => setOuvert(false)}>
                <span className="nouveaute-ico">
                  <BadgeIcon id="sans-faute" niveau="or" size={26} />
                </span>
                <span className="nouveaute-txt">
                  <strong>Badges</strong>
                  <span className="muted">Débloquez des badges et épinglez-en un à votre pseudo.</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
