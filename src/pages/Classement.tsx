import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { classementJour, classementSimule, type Board, type Entry } from '../lib/classement';
import { todayStr } from '../lib/rng';
import { formatMs } from '../lib/time';
import { loadRuns, loadSettings } from '../lib/storage';

export default function Classement() {
  const date = todayStr();
  const pseudo = loadSettings().pseudo;
  const myRun = loadRuns()[date];
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    let vivant = true;
    classementJour(date, 100).then((b) => vivant && setBoard(b));
    return () => {
      vivant = false;
    };
  }, [date]);

  const b = board ?? { ...classementSimule(date, 15), reel: false };
  let all: Entry[] = b.entries.map((e) => ({ ...e, me: e.pseudo === pseudo }));
  // En simulation (pas de backend, ou personne n'a encore couru aujourd'hui), le
  // classement réel ne contient jamais l'utilisateur : on l'ajoute depuis le local.
  if (!b.reel && myRun && !all.some((e) => e.me)) {
    all = [...all, { pseudo, ms: myRun.totalMs, flawless: myRun.flawless, me: true }].sort(
      (x, y) => x.ms - y.ms,
    );
  }

  return (
    <div className="lb" style={{ marginTop: 0 }}>
      <h2>Classement du jour</h2>
      {!myRun && (
        <p className="note">
          Vous n'avez pas encore couru aujourd'hui. <Link to="/jouer">C'est par ici →</Link>
        </p>
      )}
      <ol className="mt-4">
        {all.map((e, i) => (
          <li className={`row${e.me ? ' me' : ''}`} key={`${e.pseudo}-${i}`}>
            <span className="rank">{i + 1}</span>
            <span className="name">
              {e.pseudo} {e.badge}
              {e.me && ' (vous)'}
            </span>
            <span className="time">{formatMs(e.ms)}</span>
            <span>{e.flawless ? '✨' : ''}</span>
          </li>
        ))}
      </ol>
      <p className="note">
        {b.reel
          ? 'Classement basé sur les runs réels du jour.'
          : "Version démo hors-ligne : les autres joueurs sont simulés (déterministes par jour). Seul votre temps est réel."}
      </p>
    </div>
  );
}
