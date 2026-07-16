import { Link } from 'react-router-dom';
import { classementSimule, type Entry } from '../lib/classement';
import { todayStr } from '../lib/rng';
import { formatMs } from '../lib/time';
import { loadRuns, loadSettings } from '../lib/storage';

export default function Classement() {
  const date = todayStr();
  const { entries } = classementSimule(date, 15);
  const myRun = loadRuns()[date];
  const pseudo = loadSettings().pseudo;

  const all: Entry[] = [...entries];
  if (myRun) {
    all.push({ pseudo, ms: myRun.totalMs, flawless: myRun.flawless, me: true });
    all.sort((a, b) => a.ms - b.ms);
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
        Version démo hors-ligne : les autres joueurs sont simulés (déterministes par jour). Seul
        votre temps est réel, stocké dans votre navigateur.
      </p>
    </div>
  );
}
