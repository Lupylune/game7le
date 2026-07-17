import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { calculeStats, estEnDirect, statsParJeu, formatHeures, formatDateCourte } from '../lib/stats';
import { rangsReels } from '../lib/classement';
import { useHistorique } from '../lib/useHistorique';
import { usePseudo } from '../lib/usePseudo';
import GameIcon, { SymFlamme } from '../components/GameIcon';
import { formatMs, formatSec } from '../lib/time';
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
  const pseudo = usePseudo();
  // Seuls les runs joués le jour même comptent — pas les archives rejouées.
  const runsLive = useHistorique(pseudo).filter(estEnDirect);
  const s = calculeStats(runsLive, todayStr());
  const parJeu = statsParJeu(runsLive);

  // Rangs réels (Supabase) par date jouée ; null tant que non chargés ou sans backend.
  const [rangs, setRangs] = useState<Record<string, { rang: number; total: number }> | null>(null);
  const datesKey = runsLive
    .map((r) => r.date)
    .sort()
    .join(',');
  useEffect(() => {
    let vivant = true;
    rangsReels(pseudo, datesKey ? datesKey.split(',') : []).then((r) => vivant && setRangs(r));
    return () => {
      vivant = false;
    };
  }, [pseudo, datesKey]);

  // Meilleur rang : réel si le backend a répondu, sinon l'estimation locale.
  let meilleurRang: { rang: number; date: string; estime: boolean } | null =
    s.meilleurRang && { ...s.meilleurRang, estime: true };
  const rangsConnus = Object.entries(rangs ?? {});
  if (rangsConnus.length > 0) {
    const [date, v] = rangsConnus.reduce((a, b) => (b[1].rang < a[1].rang ? b : a));
    meilleurRang = { rang: v.rang, date, estime: false };
  }

  const runsTries = [...runsLive].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="prose" style={{ maxWidth: 640 }}>
      <h1>{pseudo}</h1>
      <p className="muted">
        Compte sans mot de passe, identifié par pseudo — les stats sont synchronisées depuis vos
        runs enregistrés sous ce pseudo.
      </p>
      {s.runs === 0 ? (
        <div className="center mt-6">
          <p className="muted">Aucun run pour l'instant.</p>
          <Link className="btn btn-primary mt-4" to="/jouer" style={{ marginTop: 'var(--sp-4)' }}>
            Lancer le Game7le du jour
          </Link>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <Tuile label="Runs" valeur={s.runs} />
            <Tuile label="Sans-faute" valeur={s.flawless} />
            <Tuile label="Série" valeur={<>{s.streak} <SymFlamme size={20} /></>} />
            <Tuile label="Run moyen" valeur={formatMs(s.moyenneMs)} />
            <Tuile
              label="Meilleur temps"
              valeur={formatMs(s.meilleur!.ms)}
              sous={formatDateCourte(s.meilleur!.date)}
            />
            <Tuile
              label="Meilleur rang"
              valeur={`#${meilleurRang!.rang}`}
              sous={`${formatDateCourte(meilleurRang!.date)}${meilleurRang!.estime ? ' · estimation' : ''}`}
            />
            <Tuile label="Taux de passe" valeur={`${s.tauxPasseP} %`} />
            <Tuile label="Temps total" valeur={formatHeures(s.totalMs)} />
          </div>

          <h2>Temps moyen par épreuve</h2>
          <ul className="stats-jeux">
            {parJeu.map((j) => (
              <li key={j.id}>
                <span className="nom">
                  <GameIcon id={j.id} size={18} /> {j.nom}
                </span>
                <span className="temps">{j.moyenneMs != null ? formatSec(j.moyenneMs) : '—'}</span>
                <span className="muted">
                  {j.joues}/{s.runs} runs
                </span>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            Temps brut passé sur chaque épreuve, hors bonus/malus.
          </p>

          <h2>Runs ({s.runs})</h2>
          <ul className="runs-liste">
            {runsTries.map((r) => (
              <li key={r.date}>
                <span className="date">{formatDateCourte(r.date)}</span>
                <span className="time">{formatMs(r.totalMs)}</span>
                <span className="rang">{rangs?.[r.date] ? `#${rangs[r.date].rang}` : ''}</span>
                <Link to={`/jouer/${r.date}`} aria-label={`Rejouer le ${formatDateCourte(r.date)}`}>
                  →
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted mt-6" style={{ fontSize: 'var(--text-sm)' }}>
        Changer de pseudo ? Direction les <Link to="/parametres">paramètres</Link>.
      </p>
    </div>
  );
}
