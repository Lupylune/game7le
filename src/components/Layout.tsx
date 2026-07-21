import { Link, Outlet } from 'react-router-dom';
import { loadSettings, saveSettings } from '../lib/storage';
import { usePseudo } from '../lib/usePseudo';
import { useRestaureBadge } from '../lib/useBadges';
import PseudoModal from './PseudoModal';

function toggleTheme() {
  const s = loadSettings();
  const cur = document.documentElement.dataset.theme ?? 'dark';
  saveSettings({ ...s, theme: cur === 'dark' ? 'light' : 'dark' });
}

export default function Layout() {
  // Restaure le badge épinglé au pseudo depuis le serveur (nouvel appareil).
  useRestaureBadge(usePseudo());
  return (
    <div className="page">
      <PseudoModal />
      <header className="top-bar">
        <Link to="/" style={{ fontFamily: 'var(--font-display)', textDecoration: 'none', color: 'var(--accent)', fontSize: '1.1rem' }}>
          G7
        </Link>
        <div className="top-right">
          <Link to="/profil" className="icon-btn" aria-label="Mon profil" title="Mon profil">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4.5 20.5 C5.5 16.5 8.5 14.5 12 14.5 C15.5 14.5 18.5 16.5 19.5 20.5" />
            </svg>
          </Link>
          <button className="icon-btn" aria-label="Changer de thème" title="Changer de thème" onClick={toggleTheme}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
          <Link to="/parametres" className="icon-btn" aria-label="Paramètres" title="Paramètres">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer">
        <Link to="/profil">Profil</Link>
        <Link to="/a-propos">À propos</Link>
        <Link to="/comment-jouer">Comment jouer</Link>
        <Link to="/entrainement">Entraînement</Link>
        <Link to="/archives">Archives</Link>
        <Link to="/classement">Classement</Link>
        <Link to="/parametres">Paramètres</Link>
      </footer>
    </div>
  );
}
