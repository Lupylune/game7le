import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { SymEtincelle, SymFlamme } from '../components/GameIcon';
import BalleDeFoin from '../components/BalleDeFoin';
import LigneClassement from '../components/LigneClassement';
import { classementJour, type Board } from '../lib/classement';
import { seededRng, todayStr, pick } from '../lib/rng';
import { formatLong, formatMs } from '../lib/time';
import { calculeStreak, joursEnDirect } from '../lib/stats';
import { useHistorique } from '../lib/useHistorique';
import { usePseudo } from '../lib/usePseudo';

const TAGLINES = [
  'Merci le C',
  'ゲーム、セット、スタート。',
  'Regardez 86.',
  'Mieux que TFT (peut-être pas)',
  'Le temps que le rer b arrive',
  'Mieux que GD (peut-être pas)',
  'SCS ?',
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
          <BalleDeFoin />
        ) : board ? (
          <>
            <ol>
              {board.entries.map((e, i) => (
                <LigneClassement key={e.pseudo} e={e} rank={i + 1} />
              ))}
            </ol>
            <p className="global-avg">
              Moyenne du jour : {formatLong(board.avgMs)} sur{' '}
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
