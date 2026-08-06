import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import GameIcon, { SymEtincelle } from '../components/GameIcon';
import BalleDeFoin from '../components/BalleDeFoin';
import { CourbeDistribution, CourbeJours } from '../components/Graphes';
import {
  MIN_PARTIES_SPECIALISTE,
  statsGlobales,
  type StatsGlobales,
  type StatsJeuGlobal,
} from '../lib/statsGlobales';
import { formatDateCourte, formatHeures } from '../lib/stats';
import { formatAdjust, formatMs, formatSec } from '../lib/time';
import { usePseudo } from '../lib/usePseudo';

type Onglet = 'quotidien' | 'defi';
type Tri = 'nom' | 'moyenne' | 'record' | 'parties';

function Tuile({
  label,
  valeur,
  sous,
}: {
  label: string;
  valeur: React.ReactNode;
  sous?: React.ReactNode;
}) {
  return (
    <div className="stat-tile">
      <span className="label">{label}</span>
      <span className="valeur">{valeur}</span>
      {sous && <span className="sous">{sous}</span>}
    </div>
  );
}

/** Bilan bonus/malus cumulé, signé et compact : « +1h 15m », « −12m ». */
function formatBilan(ms: number): string {
  return `${ms < 0 ? '−' : '+'}${formatHeures(Math.abs(ms))}`;
}

/** Marque (temps + auteur) : le pseudo en sous-titre de la tuile. */
function sousMarque(m: { pseudo: string; date: string } | null): React.ReactNode {
  return m ? `${m.pseudo} · ${formatDateCourte(m.date)}` : undefined;
}

/** Répartition réussies / passées / ratées d'une épreuve, en barre empilée. */
function BarreIssues({ j }: { j: StatsJeuGlobal }) {
  const parts: { cle: string; n: number; classe: string; label: string }[] = [
    { cle: 'ok', n: j.reussies, classe: 'ok', label: 'réussies' },
    { cle: 'skip', n: j.passees, classe: 'skip', label: 'passées' },
    { cle: 'ko', n: j.echouees, classe: 'ko', label: 'ratées' },
  ];
  return (
    <span
      className="issues"
      title={parts.map((p) => `${p.n} ${p.label}`).join(' · ')}
      aria-label={parts.map((p) => `${p.n} ${p.label}`).join(', ')}
    >
      {parts
        .filter((p) => p.n > 0)
        .map((p) => (
          <span key={p.cle} className={p.classe} style={{ flexGrow: p.n }} />
        ))}
    </span>
  );
}

/** Ordre des épreuves : les valeurs manquantes finissent toujours en bas. */
function comparateur(tri: Tri): (a: StatsJeuGlobal, b: StatsJeuGlobal) => number {
  const parTemps = (x: number | null, y: number | null) =>
    x == null ? 1 : y == null ? -1 : x - y;
  if (tri === 'moyenne') return (a, b) => parTemps(a.moyenneMs, b.moyenneMs);
  if (tri === 'record') return (a, b) => parTemps(a.meilleur?.ms ?? null, b.meilleur?.ms ?? null);
  if (tri === 'parties') return (a, b) => b.parties - a.parties;
  return (a, b) => a.nom.localeCompare(b.nom, 'fr');
}

export default function Statistiques() {
  const pseudo = usePseudo();
  const [params, setParams] = useSearchParams();
  const onglet: Onglet = params.get('onglet') === 'defi' ? 'defi' : 'quotidien';
  const [tri, setTri] = useState<Tri>('moyenne');
  const [s, setS] = useState<StatsGlobales | null>(null);
  // Dimension de la courbe : le run entier, ou une épreuve en particulier
  const [courbe, setCourbe] = useState<string>('run');

  useEffect(() => {
    let vivant = true;
    setS(null);
    statsGlobales(pseudo, onglet === 'defi').then((r) => vivant && setS(r));
    return () => {
      vivant = false;
    };
  }, [pseudo, onglet]);

  const jeuxTries = useMemo(() => (s ? [...s.jeux].sort(comparateur(tri)) : []), [s, tri]);
  const specialistes = useMemo(
    () => jeuxTries.filter((j) => j.specialiste).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [jeuxTries],
  );

  const onglets = (
    <div className="lb-tabs" role="tablist">
      {(
        [
          { id: 'quotidien', label: 'Défi du jour' },
          { id: 'defi', label: 'Défi difficile' },
        ] as const
      ).map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={onglet === o.id}
          className={`lb-tab${onglet === o.id ? ' actif' : ''}`}
          onClick={() => setParams(o.id === 'quotidien' ? {} : { onglet: o.id }, { replace: true })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  if (!s) {
    return (
      <div className="prose" style={{ maxWidth: 760 }}>
        <h1>Statistiques</h1>
        {onglets}
        <ol aria-hidden className="lb lb-skeleton mt-4">
          {Array.from({ length: 8 }, (_, i) => (
            <li className="row" key={i} />
          ))}
        </ol>
      </div>
    );
  }

  if (s.runs === 0) {
    return (
      <div className="prose" style={{ maxWidth: 760 }}>
        <h1>Statistiques</h1>
        {onglets}
        <BalleDeFoin />
        <p className="muted center">
          Aucun run enregistré pour l'instant.{' '}
          <Link to={onglet === 'defi' ? '/defi' : '/jouer'}>Ouvrez le bal →</Link>
        </p>
      </div>
    );
  }

  const trieur = (cle: Tri, label: string) => (
    <button
      className={`tri${tri === cle ? ' actif' : ''}`}
      onClick={() => setTri(cle)}
      aria-pressed={tri === cle}
    >
      {label}
    </button>
  );

  return (
    <div className="prose" style={{ maxWidth: 760 }}>
      <h1>Statistiques</h1>
      {onglets}
      <p className="muted">
        {s.reel
          ? `Sur les ${s.runs} runs enregistrés${
              s.depuis ? ` du ${formatDateCourte(s.depuis)} à aujourd'hui` : ''
            }, tous joueurs confondus — premières tentatives uniquement (les archives rejouées ne comptent pas).`
          : 'Backend absent : ces statistiques ne portent que sur vos runs enregistrés dans ce navigateur.'}
      </p>

      <h2>Vue d'ensemble</h2>
      <div className="stats-grid">
        <Tuile label="Runs" valeur={s.runs} sous={`${s.joueurs} joueur${s.joueurs > 1 ? 's' : ''}`} />
        <Tuile label="Run moyen" valeur={formatMs(s.moyenneRunMs)} sous={`médiane ${formatMs(s.medianeRunMs)}`} />
        <Tuile
          label="Meilleur run"
          valeur={formatMs(s.meilleurRun!.ms)}
          sous={sousMarque(s.meilleurRun)}
        />
        <Tuile label="Run le plus lent" valeur={formatMs(s.pireRun!.ms)} sous={sousMarque(s.pireRun)} />
        <Tuile
          label="Sans-faute"
          valeur={
            <>
              {s.flawless} <SymEtincelle size={18} />
            </>
          }
          sous={`${Math.round((s.flawless / s.runs) * 100)} % des runs`}
        />
        <Tuile
          label="Épreuve moyenne"
          valeur={s.moyenneEpreuveMs != null ? formatSec(s.moyenneEpreuveMs) : '—'}
          sous={`${s.epreuves} épreuves jouées`}
        />
        <Tuile
          label="Issues"
          valeur={`${s.tauxReussiteP} %`}
          sous={`réussite · ${s.tauxPasseP} % passées · ${s.tauxEchecP} % ratées`}
        />
        <Tuile
          label="Bilan bonus / malus"
          valeur={formatBilan(s.bonusMs + s.malusMs)}
          sous={`${formatBilan(s.bonusMs)} gagnés · ${formatBilan(s.malusMs)} perdus`}
        />
        <Tuile label="Temps de jeu cumulé" valeur={formatHeures(s.tempsTotalMs)} />
        {s.jourFacile && (
          <Tuile
            label="Journée la plus rapide"
            valeur={formatMs(s.jourFacile.ms)}
            sous={`${formatDateCourte(s.jourFacile.date)} · ${s.jourFacile.runs} runs`}
          />
        )}
        {s.jourDur && (
          <Tuile
            label="Journée la plus dure"
            valeur={formatMs(s.jourDur.ms)}
            sous={`${formatDateCourte(s.jourDur.date)} · ${s.jourDur.runs} runs`}
          />
        )}
      </div>

      <h2>Distribution</h2>
      <CourbeDistribution
        tranches={s.distribution.tranches}
        courbe={s.distribution.courbe}
        pas={s.distribution.pas}
        medianeMs={s.medianeRunMs}
        moiMs={s.moiMoyenneRunMs}
        moiPercentileP={s.moiPercentileP}
        pseudo={pseudo}
      />

      <h2>Jour après jour</h2>
      <div className="g-choix">
        <label htmlFor="courbe-jeu">Ce que suit la courbe :</label>
        <select
          id="courbe-jeu"
          value={courbe}
          onChange={(e) => setCourbe(e.target.value)}
        >
          <option value="run">Temps du run entier</option>
          {[...s.jeux]
            .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
            .map((j) => (
              <option key={j.id} value={j.id}>
                {j.nom}
              </option>
            ))}
        </select>
      </div>
      {(() => {
        const jeu = s.jeux.find((j) => j.id === courbe);
        const points = jeu ? s.serieParJeu[jeu.id] ?? [] : s.serieRuns;
        if (points.length === 0)
          return <p className="muted">Pas encore de temps enregistré sur cette épreuve.</p>;
        return (
          <CourbeJours
            key={courbe}
            points={points}
            titre={jeu ? `${jeu.nom} — temps moyen par jour` : 'Temps de run moyen par jour'}
            sousTitre={
              jeu
                ? 'Moyenne du jour sur les tentatives réussies, et votre temps quand vous avez joué.'
                : 'Moyenne des runs du jour (bonus et pénalités compris), et votre run quand vous avez joué.'
            }
            pseudo={pseudo}
          />
        );
      })()}

      <h2>Par épreuve</h2>
      <div className="tris">
        <span className="muted">Trier :</span>
        {trieur('moyenne', 'Moyenne')}
        {trieur('record', 'Record')}
        {trieur('parties', 'Parties')}
        {trieur('nom', 'Nom')}
      </div>
      <div className="table-scroll">
        <table className="stats-table par-jeu">
          <thead>
            <tr>
              <th>Épreuve</th>
              <th>Moyenne</th>
              <th>Record</th>
              <th className="opt">Pire</th>
              <th>Vous</th>
              <th className="opt">Issues</th>
            </tr>
          </thead>
          <tbody>
            {jeuxTries.map((j) => (
              <tr key={j.id}>
                <th scope="row">
                  <span className="nom">
                    <GameIcon id={j.id} size={18} /> {j.nom}
                  </span>
                  <span className="sous">
                    {j.parties} partie{j.parties > 1 ? 's' : ''}
                    {j.ajustMoyenMs !== 0 && <> · {formatAdjust(j.ajustMoyenMs)} en moyenne</>}
                  </span>
                </th>
                <td>{j.moyenneMs != null ? formatSec(j.moyenneMs) : '—'}</td>
                <td>
                  {j.meilleur ? (
                    <>
                      {formatSec(j.meilleur.ms)}
                      <span className="sous">{j.meilleur.pseudo}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="opt">
                  {j.pire ? (
                    <>
                      {formatSec(j.pire.ms)}
                      <span className="sous">{j.pire.pseudo}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={j.moi.moyenneMs != null ? 'moi' : ''}>
                  {j.moi.moyenneMs != null ? (
                    <>
                      {formatSec(j.moi.moyenneMs)}
                      <span className="sous">record {formatSec(j.moi.meilleurMs!)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="opt">
                  <BarreIssues j={j} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Temps brut passé sur l'épreuve, hors bonus/malus, et seulement quand elle a été réussie —
        une épreuve passée ou ratée n'entre ni dans les moyennes ni dans les records. « Vous » =
        votre moyenne et votre record sous le pseudo {pseudo}.
      </p>

      {specialistes.length > 0 && (
        <>
          <h2>Les spécialistes</h2>
          <p className="muted">
            Meilleure moyenne par épreuve, à partir de {MIN_PARTIES_SPECIALISTE} parties réussies.
          </p>
          <ul className="stats-jeux">
            {specialistes.map((j) => (
              <li key={j.id}>
                <span className="nom">
                  <GameIcon id={j.id} size={18} /> {j.nom}
                </span>
                <span className={`temps${j.specialiste!.pseudo === pseudo ? ' moi' : ''}`}>
                  {j.specialiste!.pseudo}
                </span>
                <span className="temps">{formatSec(j.specialiste!.ms)}</span>
                <span className="muted opt">{j.specialiste!.parties} parties</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="muted mt-6" style={{ fontSize: 'var(--text-sm)' }}>
        Vos stats à vous : <Link to="/profil">votre profil</Link>. Qui est devant ?{' '}
        <Link to="/classement">le classement</Link>.
      </p>
    </div>
  );
}
