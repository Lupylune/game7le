import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadRuns, loadSettings } from '../lib/storage';
import { calculeStats, formatHeures, formatDateCourte, type RunPourStats } from '../lib/stats';
import { fetchRunsParPseudo } from '../lib/sync';
import { formatMs } from '../lib/time';
import { todayStr } from '../lib/rng';

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
  const [historique, setHistorique] = useState<RunPourStats[] | null>(null);

  useEffect(() => {
    let vivant = true;
    fetchRunsParPseudo(pseudo).then((r) => vivant && setHistorique(r));
    return () => {
      vivant = false;
    };
  }, [pseudo]);

  // Repli sur l'historique local si le backend est absent, injoignable, ou en cours de chargement.
  const source = historique ?? Object.values(loadRuns());
  const s = calculeStats(source, todayStr());

  return (
    <div className="prose" style={{ maxWidth: 640 }}>
      <h1>{pseudo}</h1>
      <p className="muted">
        Compte sans mot de passe, identifié par pseudo — les stats sont synchronisées depuis vos
        runs enregistrés sous ce pseudo (ou depuis ce navigateur si le backend est indisponible).
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
