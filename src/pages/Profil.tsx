import { Link } from 'react-router-dom';
import { loadSettings } from '../lib/storage';
import { calculeStats, formatHeures, formatDateCourte } from '../lib/stats';
import { formatMs } from '../lib/time';

function Tuile({ label, valeur, sous }: { label: string; valeur: React.ReactNode; sous?: string }) {
  return (
    <div className="stat-tile">
      <span className="label">{label}</span>
      <span className="valeur">{valeur}</span>
      {sous && <span className="sous">{sous}</span>}
    </div>
  );
}

export default function Profil() {
  const { pseudo } = loadSettings();
  const s = calculeStats();

  return (
    <div className="prose" style={{ maxWidth: 640 }}>
      <h1>{pseudo}</h1>
      <p className="muted">
        Compte local sans mot de passe — les stats sont calculées depuis vos runs enregistrés dans
        ce navigateur.
      </p>
      {s.runs === 0 ? (
        <div className="center mt-6">
          <p className="muted">Aucun run pour l'instant.</p>
          <Link className="btn btn-primary mt-4" to="/jouer" style={{ marginTop: 'var(--sp-4)' }}>
            Lancer le Game7le du jour
          </Link>
        </div>
      ) : (
        <div className="stats-grid">
          <Tuile label="Runs" valeur={s.runs} />
          <Tuile label="Sans-faute" valeur={s.flawless} />
          <Tuile label="Série" valeur={<>{s.streak} 🔥</>} />
          <Tuile label="Run moyen" valeur={formatMs(s.moyenneMs)} />
          <Tuile
            label="Meilleur temps"
            valeur={formatMs(s.meilleur!.ms)}
            sous={formatDateCourte(s.meilleur!.date)}
          />
          <Tuile
            label="Meilleur rang"
            valeur={`#${s.meilleurRang!.rang}`}
            sous={formatDateCourte(s.meilleurRang!.date)}
          />
          <Tuile label="Taux de passe" valeur={`${s.tauxPasseP} %`} />
          <Tuile label="Temps total" valeur={formatHeures(s.totalMs)} />
        </div>
      )}
      <p className="muted mt-6" style={{ fontSize: 'var(--text-sm)' }}>
        Changer de pseudo ? Direction les <Link to="/parametres">paramètres</Link>. Le rang est
        estimé face au peloton simulé du jour.
      </p>
    </div>
  );
}
