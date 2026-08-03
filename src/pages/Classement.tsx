import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  classementDefi,
  classementJour,
  classementSemaine,
  datesSemaine,
  type Board,
  type Entry,
} from '../lib/classement';
import { lundiStr, todayStr } from '../lib/rng';
import { estEnDirect } from '../lib/stats';
import { loadSettings } from '../lib/storage';
import { useHistorique, useHistoriqueDefis } from '../lib/useHistorique';
import { useBadgesJoueurs } from '../lib/useBadges';
import { usePodiumSemaine } from '../lib/useChampion';
import { usePseudo } from '../lib/usePseudo';
import BalleDeFoin from '../components/BalleDeFoin';
import LigneClassement from '../components/LigneClassement';

type Onglet = 'jour' | 'semaine' | 'defi';

const ONGLETS: { id: Onglet; label: string; titre: string }[] = [
  { id: 'jour', label: 'Défi du jour', titre: 'Classement du jour' },
  { id: 'semaine', label: 'Semaine', titre: 'Classement de la semaine' },
  { id: 'defi', label: 'Défi difficile', titre: 'Classement du défi difficile' },
];

export default function Classement() {
  const date = todayStr();
  const lundi = lundiStr();
  const pseudo = usePseudo();
  const [params, setParams] = useSearchParams();
  const p = params.get('onglet');
  const onglet: Onglet = p === 'defi' ? 'defi' : p === 'semaine' ? 'semaine' : 'jour';
  const semaine = useMemo(() => datesSemaine(date), [date]);
  // Seul le run en direct (première tentative du jour / de la semaine) compte.
  const historique = useHistorique(pseudo);
  const myRunJour = historique.find((r) => r.date === date && estEnDirect(r));
  const myDefi = useHistoriqueDefis(pseudo).find((r) => r.date === lundi && estEnDirect(r));
  const mesRunsSemaine = historique.filter((r) => estEnDirect(r) && semaine.includes(r.date));
  const myRun = onglet === 'defi' ? myDefi : myRunJour;
  const aCouru = onglet === 'semaine' ? mesRunsSemaine.length > 0 : !!myRun;
  const [board, setBoard] = useState<Board | null>(null);
  const badges = useBadgesJoueurs(board ? board.entries.map((e) => e.pseudo) : []);
  const podium = usePodiumSemaine();
  const monBadge = loadSettings().badge;

  useEffect(() => {
    let vivant = true;
    setBoard(null);
    const promesse =
      onglet === 'defi'
        ? classementDefi(lundi, 100)
        : onglet === 'semaine'
          ? classementSemaine(date, 100)
          : classementJour(date, 100);
    promesse.then((b) => vivant && setBoard(b));
    return () => {
      vivant = false;
    };
  }, [date, lundi, onglet]);

  const titre = ONGLETS.find((o) => o.id === onglet)!.titre;

  const onglets = (
    <div className="lb-tabs" role="tablist">
      {ONGLETS.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={onglet === o.id}
          className={`lb-tab${onglet === o.id ? ' actif' : ''}`}
          onClick={() => setParams(o.id === 'jour' ? {} : { onglet: o.id }, { replace: true })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  if (!board) {
    return (
      <div className="lb" style={{ marginTop: 0 }}>
        <h2>{titre}</h2>
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
  // Supabase absente/échouée), on l'ajoute depuis son historique local — pour
  // la semaine, en agrégeant ses runs comme le fait `classementSemaine()`.
  const monEntree: Entry | null =
    onglet === 'semaine'
      ? mesRunsSemaine.length > 0
        ? {
            pseudo,
            ms: mesRunsSemaine.reduce((s, r) => s + r.totalMs, 0) / mesRunsSemaine.length,
            jours: mesRunsSemaine.length,
            flawless: mesRunsSemaine.every((r) => r.flawless),
            me: true,
          }
        : null
      : myRun
        ? { pseudo, ms: myRun.totalMs, flawless: myRun.flawless, lines: myRun.lines, me: true }
        : null;
  if (monEntree && !all.some((e) => e.me)) {
    all = [...all, monEntree].sort(
      onglet === 'semaine'
        ? (x, y) => (y.jours ?? 0) - (x.jours ?? 0) || x.ms - y.ms
        : (x, y) => x.ms - y.ms,
    );
  }

  return (
    <div className="lb" style={{ marginTop: 0 }}>
      <h2>{titre}</h2>
      {onglets}
      {!aCouru && (
        <p className="note">
          {onglet === 'defi' ? (
            <>
              Vous n'avez pas encore relevé le défi de la semaine.{' '}
              <Link to="/defi">C'est par ici →</Link>
            </>
          ) : onglet === 'semaine' ? (
            <>
              Vous n'avez couru aucun jour de cette semaine.{' '}
              <Link to="/jouer">C'est par ici →</Link>
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
            deverrouille={aCouru}
            podium={podium}
            messageVerrou={
              onglet === 'defi'
                ? 'Terminez le défi difficile pour voir le détail des temps.'
                : 'Terminez le défi du jour pour voir le détail des temps.'
            }
          />
        ))}
      </ol>
      {(!board.reel || all.length > 0) && (
        <p className="note">
          {board.reel
            ? onglet === 'defi'
              ? 'Classement basé sur les runs réels du défi de la semaine.'
              : onglet === 'semaine'
                ? 'Classement basé sur les runs réels de la semaine.'
                : 'Classement basé sur les runs réels du jour.'
            : "Version démo hors-ligne : les autres joueurs sont simulés (déterministes). Seul votre temps est réel."}
        </p>
      )}
    </div>
  );
}
