import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { classementJour, type Board, type Entry } from '../lib/classement';
import { todayStr } from '../lib/rng';
import { useHistorique } from '../lib/useHistorique';
import { usePseudo } from '../lib/usePseudo';
import BalleDeFoin from '../components/BalleDeFoin';
import LigneClassement from '../components/LigneClassement';

export default function Classement() {
  const date = todayStr();
  const pseudo = usePseudo();
  const myRun = useHistorique(pseudo).find((r) => r.date === date);
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    let vivant = true;
    classementJour(date, 100).then((b) => vivant && setBoard(b));
    return () => {
      vivant = false;
    };
  }, [date]);

  if (!board) {
    return (
      <div className="lb" style={{ marginTop: 0 }}>
        <h2>Classement du jour</h2>
        <ol aria-hidden className="lb-skeleton mt-4">
          {Array.from({ length: 8 }, (_, i) => (
            <li className="row" key={i} />
          ))}
        </ol>
      </div>
    );
  }

  let all: Entry[] = board.entries.map((e) => ({ ...e, me: e.pseudo === pseudo }));
  // Si l'utilisateur a couru mais n'apparaît pas (peloton simulé, ou sync
  // Supabase absente/échouée), on l'ajoute depuis son historique local.
  if (myRun && !all.some((e) => e.me)) {
    all = [
      ...all,
      { pseudo, ms: myRun.totalMs, flawless: myRun.flawless, lines: myRun.lines, me: true },
    ].sort((x, y) => x.ms - y.ms);
  }

  return (
    <div className="lb" style={{ marginTop: 0 }}>
      <h2>Classement du jour</h2>
      {!myRun && (
        <p className="note">
          Vous n'avez pas encore couru aujourd'hui. <Link to="/jouer">C'est par ici →</Link>
        </p>
      )}
      {all.length === 0 && <BalleDeFoin />}
      <ol className="mt-4">
        {all.map((e, i) => (
          <LigneClassement key={`${e.pseudo}-${i}`} e={e} rank={i + 1} />
        ))}
      </ol>
      {(!board.reel || all.length > 0) && (
        <p className="note">
          {board.reel
            ? 'Classement basé sur les runs réels du jour.'
            : "Version démo hors-ligne : les autres joueurs sont simulés (déterministes par jour). Seul votre temps est réel."}
        </p>
      )}
    </div>
  );
}
