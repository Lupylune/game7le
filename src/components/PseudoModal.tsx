import { useState } from 'react';
import { loadSettings, saveSettings } from '../lib/storage';
import Logo from './Logo';

/**
 * Popup de première visite : choix du pseudo. Le « compte » est local, sans
 * mot de passe — il s'affiche tant qu'aucun réglage n'a été enregistré.
 */
export default function PseudoModal() {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem('game7le:settings') === null;
    } catch {
      return false;
    }
  });
  const [pseudo, setPseudo] = useState('');

  if (!visible) return null;

  const valider = () => {
    const p = pseudo.trim();
    if (p.length < 2) return;
    saveSettings({ ...loadSettings(), pseudo: p });
    setVisible(false);
  };

  return (
    <div className="modal-overlay">
      <div className="pseudo-modal" role="dialog" aria-modal="true" aria-label="Choisir un pseudo">
        <Logo height={56} />
        <h2>Bienvenue !</h2>
        <p className="muted">
          Choisissez un pseudo pour suivre vos stats — sans compte ni mot de passe, tout reste dans
          ce navigateur.
        </p>
        <input
          type="text"
          value={pseudo}
          maxLength={20}
          placeholder="Votre pseudo…"
          autoFocus
          onChange={(e) => setPseudo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && valider()}
        />
        <button className="btn btn-primary" disabled={pseudo.trim().length < 2} onClick={valider}>
          C'est parti
        </button>
      </div>
    </div>
  );
}
