import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { SymEtincelle, SymFlamme } from '../components/GameIcon';
import BalleDeFoin from '../components/BalleDeFoin';
import LigneClassement from '../components/LigneClassement';
import { classementJour, classementSemaine, type Board, type Entry } from '../lib/classement';
import { lundiStr, seededRng, todayStr, pick } from '../lib/rng';
import { formatLong, formatMs } from '../lib/time';
import { calculeStreak, estEnDirect, joursEnDirect } from '../lib/stats';
import { loadDefis, loadSettings } from '../lib/storage';
import { useHistorique } from '../lib/useHistorique';
import { useBadgesJoueurs } from '../lib/useBadges';
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
  const [semaine, setSemaine] = useState<Board | null>(null);
  useEffect(() => {
    let vivant = true;
    classementJour(date, 5).then((b) => vivant && setBoard(b));
    classementSemaine(date, 5).then((b) => vivant && setSemaine(b));
    return () => {
      vivant = false;
    };
  }, [date]);
  const pseudo = usePseudo();
  const runs = useHistorique(pseudo);
  const badges = useBadgesJoueurs([
    ...(board?.entries ?? []),
    ...(semaine?.entries ?? []),
  ].map((e) => e.pseudo));
  const monBadge = loadSettings().badge;
  const avecBadge = (e: Entry): Entry => ({
    ...e,
    badge: e.pseudo === pseudo ? monBadge || undefined : badges[e.pseudo] ?? e.badge,
  });
  // Le temps « officiel » du jour est celui de la première tentative (en
  // direct) — les rejeux du jour même sont des runs d'archive.
  const myRun = runs.find((r) => r.date === date && estEnDirect(r));
  const streak = calculeStreak(joursEnDirect(runs), date);
  const tagline = pick(seededRng(`tagline:${date}`), TAGLINES);
  // Défi difficile de la semaine : temps officiel local (première tentative)
  const lundi = lundiStr();
  const myDefi = loadDefis().find((r) => r.date === lundi && r.enDirect);

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
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'Europe/Paris',
            })}
            {streak > 0 && (
              <>
                {' · '}
                <SymFlamme /> série de {streak} jour{streak > 1 ? 's' : ''}
              </>
            )}
          </span>
          {myDefi ? (
            <div className="done-card">
              <span className="muted">Votre défi difficile de la semaine</span>
              <span className="time">
                {formatMs(myDefi.totalMs)} {myDefi.flawless && <SymEtincelle size={18} />}
              </span>
              <Link to="/classement?onglet=defi">Voir le classement →</Link>
            </div>
          ) : (
            <Link to="/defi" className="btn btn-defi">
              <SymFlamme size={18} /> Défi difficile <SymFlamme size={18} />
            </Link>
          )}
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
                <LigneClassement
                  key={e.pseudo}
                  e={avecBadge(e)}
                  rank={i + 1}
                  deverrouille={!!myRun}
                  messageVerrou="Terminez le défi du jour pour voir le détail des temps."
                />
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

      <section className="lb" aria-label="Top 5 de la semaine">
        <h2>Le top 5 de la semaine</h2>
        {semaine && semaine.entries.length === 0 ? (
          <BalleDeFoin />
        ) : semaine ? (
          <>
            <ol>
              {semaine.entries.map((e, i) => (
                <LigneClassement
                  key={e.pseudo}
                  e={avecBadge(e)}
                  rank={i + 1}
                  deverrouille={!!myRun}
                  messageVerrou="Terminez le défi du jour pour voir le détail des temps."
                />
              ))}
            </ol>
            <p className="global-avg">
              Cumul des temps de la semaine (lundi→dimanche), classé par régularité.
            </p>
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
