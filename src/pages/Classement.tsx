import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { classementDefi, classementJour, type Board, type Entry } from '../lib/classement';
import { lundiStr, todayStr } from '../lib/rng';
import { estEnDirect } from '../lib/stats';
import { loadDefis, loadSettings } from '../lib/storage';
import { useHistorique } from '../lib/useHistorique';
import { useBadgesJoueurs } from '../lib/useBadges';
import { usePseudo } from '../lib/usePseudo';
import BalleDeFoin from '../components/BalleDeFoin';
import LigneClassement from '../components/LigneClassement';

export default function Classement() {
  const date = todayStr();
  const lundi = lundiStr();
  const pseudo = usePseudo();
  const [params, setParams] = useSearchParams();
  const ongletDefi = params.get('onglet') === 'defi';
  // Seul le run en direct (première tentative du jour / de la semaine) compte.
  const myRunJour = useHistorique(pseudo).find((r) => r.date === date && estEnDirect(r));
  const myDefi = loadDefis().find((r) => r.date === lundi && r.enDirect);
  const myRun = ongletDefi ? myDefi : myRunJour;
  const [board, setBoard] = useState<Board | null>(null);
  const badges = useBadgesJoueurs(board ? board.entries.map((e) => e.pseudo) : []);
  const monBadge = loadSettings().badge;

  useEffect(() => {
    let vivant = true;
    setBoard(null);
    const promesse = ongletDefi ? classementDefi(lundi, 100) : classementJour(date, 100);
    promesse.then((b) => vivant && setBoard(b));
    return () => {
      vivant = false;
    };
  }, [date, lundi, ongletDefi]);

  const onglets = (
    <div className="lb-tabs" role="tablist">
      <button
        role="tab"
        aria-selected={!ongletDefi}
        className={`lb-tab${!ongletDefi ? ' actif' : ''}`}
        onClick={() => setParams({}, { replace: true })}
      >
        Défi du jour
      </button>
      <button
        role="tab"
        aria-selected={ongletDefi}
        className={`lb-tab${ongletDefi ? ' actif' : ''}`}
        onClick={() => setParams({ onglet: 'defi' }, { replace: true })}
      >
        Défi difficile
      </button>
    </div>
  );

  if (!board) {
    return (
      <div className="lb" style={{ marginTop: 0 }}>
        <h2>{ongletDefi ? 'Classement du défi difficile' : 'Classement du jour'}</h2>
        {onglets}
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
      <h2>{ongletDefi ? 'Classement du défi difficile' : 'Classement du jour'}</h2>
      {onglets}
      {!myRun && (
        <p className="note">
          {ongletDefi ? (
            <>
              Vous n'avez pas encore relevé le défi de la semaine.{' '}
              <Link to="/defi">C'est par ici →</Link>
            </>
          ) : (
            <>
              Vous n'avez pas encore couru aujourd'hui. <Link to="/jouer">C'est par ici →</Link>
            </>
          )}
        </p>
      )}
      {all.length === 0 && <BalleDeFoin />}
      <ol className="mt-4">
        {all.map((e, i) => (
          <LigneClassement
            key={`${e.pseudo}-${i}`}
            e={{ ...e, badge: e.me ? monBadge || undefined : badges[e.pseudo] ?? e.badge }}
            rank={i + 1}
            deverrouille={!!myRun}
            messageVerrou={
              ongletDefi
                ? 'Terminez le défi difficile pour voir le détail des temps.'
                : 'Terminez le défi du jour pour voir le détail des temps.'
            }
          />
        ))}
      </ol>
      {(!board.reel || all.length > 0) && (
        <p className="note">
          {board.reel
            ? ongletDefi
              ? 'Classement basé sur les runs réels du défi de la semaine.'
              : 'Classement basé sur les runs réels du jour.'
            : "Version démo hors-ligne : les autres joueurs sont simulés (déterministes). Seul votre temps est réel."}
        </p>
      )}
    </div>
  );
}
