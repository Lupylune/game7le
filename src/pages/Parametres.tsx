import { useState } from 'react';
import { loadSettings, resetAll, saveSettings, type Settings } from '../lib/storage';

export default function Parametres() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [confirm, setConfirm] = useState(false);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  return (
    <div className="prose" style={{ maxWidth: 560 }}>
      <h1>Paramètres</h1>
      <div className="settings-row">
        <label>
          Thème
          <span className="hint">Sombre par défaut, comme il se doit.</span>
        </label>
        <select
          value={settings.theme}
          onChange={(e) => update({ theme: e.target.value as Settings['theme'] })}
        >
          <option value="dark">Sombre</option>
          <option value="light">Clair</option>
          <option value="system">Système</option>
        </select>
      </div>
      <div className="settings-row">
        <label>
          Pseudo
          <span className="hint">Affiché dans le classement local.</span>
        </label>
        <input
          type="text"
          value={settings.pseudo}
          maxLength={20}
          onChange={(e) => update({ pseudo: e.target.value })}
        />
      </div>
      <div className="settings-row">
        <label>
          Effacer mes données
          <span className="hint">Temps, historique et réglages (localStorage uniquement).</span>
        </label>
        {confirm ? (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              resetAll();
              window.location.href = '/';
            }}
          >
            Confirmer la suppression
          </button>
        ) : (
          <button className="btn btn-sm" onClick={() => setConfirm(true)}>
            Tout effacer…
          </button>
        )}
      </div>
    </div>
  );
}
