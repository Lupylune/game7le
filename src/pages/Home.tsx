import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { classementSimule } from '../lib/classement';
import { seededRng, todayStr, pick } from '../lib/rng';
import { formatLong, formatMs } from '../lib/time';
import { computeStreak, loadRuns } from '../lib/storage';

const TAGLINES = [
  'Le Game7le nouveau est arrivé.',
  'Sept casse-têtes, zéro pitié.',
  'Votre cerveau vous remerciera. Ou pas.',
  'Plus rapide que la file à la boulangerie.',
  'Chronométré, comme le métro. En mieux.',
  'Aujourd’hui encore, personne ne vous a obligé·e.',
];

export default function Home() {
  const date = todayStr();
  const { entries, avgMs, runs } = classementSimule(date);
  const myRun = loadRuns()[date];
  const streak = computeStreak(date);
  const tagline = pick(seededRng(`tagline:${date}`), TAGLINES);

  return (
    <div>
      <section className="hero">
        <Logo height={100} />
        <p className="tagline">{tagline}</p>
        <div className="hero-cta">
          {myRun ? (
            <div className="done-card">
              <span className="muted">Votre temps du jour</span>
              <span className="time">
                {formatMs(myRun.totalMs)} {myRun.flawless && '✨'}
              </span>
              <Link to="/classement">Voir le classement →</Link>
            </div>
          ) : (
            <Link to="/jouer" className="btn btn-primary btn-lg">
              Lancer le Game7le du jour
            </Link>
          )}
          <span className="hero-date">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {streak > 0 && ` · 🔥 série de ${streak} jour${streak > 1 ? 's' : ''}`}
          </span>
        </div>
      </section>

      <section className="lb" aria-label="Top 5 du jour">
        <h2>Le top 5 du jour</h2>
        <ol>
          {entries.map((e, i) => (
            <li className="row" key={e.pseudo}>
              <span className="rank">{i + 1}</span>
              <span className="name">
                {e.pseudo} {e.badge}
              </span>
              <span className="time">{formatMs(e.ms)}</span>
              <span>{e.flawless ? '✨' : ''}</span>
            </li>
          ))}
        </ol>
        <p className="global-avg">
          Moyenne mondiale du jour : {formatLong(avgMs)} sur {runs.toLocaleString('fr-FR')} runs.
        </p>
        <Link to="/classement" className="see-more">
          Voir le classement complet →
        </Link>
      </section>
    </div>
  );
}
