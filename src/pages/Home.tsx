import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { SymEtincelle, SymEtoile, SymFlamme } from '../components/GameIcon';
import { classementJour, type Board } from '../lib/classement';
import { seededRng, todayStr, pick } from '../lib/rng';
import { formatLong, formatMs } from '../lib/time';
import { calculeStreak, joursEnDirect } from '../lib/stats';
import { useHistorique } from '../lib/useHistorique';
import { usePseudo } from '../lib/usePseudo';

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
  const [board, setBoard] = useState<Board | null>(null);
  useEffect(() => {
    let vivant = true;
    classementJour(date, 5).then((b) => vivant && setBoard(b));
    return () => {
      vivant = false;
    };
  }, [date]);
  const parDate = useHistorique(usePseudo());
  const myRun = parDate[date];
  const streak = calculeStreak(joursEnDirect(Object.values(parDate)), date);
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
                {formatMs(myRun.totalMs)} {myRun.flawless && <SymEtincelle size={18} />}
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
            {streak > 0 && (
              <>
                {' · '}
                <SymFlamme /> série de {streak} jour{streak > 1 ? 's' : ''}
              </>
            )}
          </span>
        </div>
      </section>

      <section className="lb" aria-label="Top 5 du jour">
        <h2>Le top 5 du jour</h2>
        {board && board.entries.length === 0 ? (
          <p className="global-avg">
            Personne n'a encore couru aujourd'hui. Soyez la première ou le premier !
          </p>
        ) : board ? (
          <>
            <ol>
              {board.entries.map((e, i) => (
                <li className="row" key={e.pseudo} style={{ '--i': i } as CSSProperties}>
                  <span className="rank">{i + 1}</span>
                  <span className="name">
                    {e.pseudo} {e.badge && <SymEtoile />}
                  </span>
                  <span className="time">{formatMs(e.ms)}</span>
                  <span>{e.flawless && <SymEtincelle />}</span>
                </li>
              ))}
            </ol>
            <p className="global-avg">
              Moyenne mondiale du jour : {formatLong(board.avgMs)} sur{' '}
              {board.runs.toLocaleString('fr-FR')} runs.
            </p>
            <Link to="/classement" className="see-more">
              Voir le classement complet →
            </Link>
          </>
        ) : (
          <ol aria-hidden className="lb-skeleton">
            {Array.from({ length: 5 }, (_, i) => (
              <li className="row" key={i} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
