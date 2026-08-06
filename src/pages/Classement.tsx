import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  classementDefi,
  classementGeneral,
  classementJour,
  classementMois,
  classementSemaine,
  compareAgrege,
  datesSemaine,
  DETAIL_MAX,
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

type Onglet = 'jour' | 'semaine' | 'mois' | 'general' | 'defi';

const ONGLETS: {
  id: Onglet;
  label: string;
  titre: string;
  /** Fin de la phrase « Classement basé sur les runs réels … ». */
  source: string;
  /** Invitation affichée quand on n'a pas encore couru la période. */
  invite: string;
  lien: string;
}[] = [
  {
    id: 'jour',
    label: 'Défi du jour',
    titre: 'Classement du jour',
    source: 'du jour',
    invite: "Vous n'avez pas encore couru aujourd'hui.",
    lien: '/jouer',
  },
  {
    id: 'semaine',
    label: 'Semaine',
    titre: 'Classement de la semaine',
    source: 'de la semaine',
    invite: "Vous n'avez couru aucun jour de cette semaine.",
    lien: '/jouer',
  },
  {
    id: 'mois',
    label: 'Mois',
    titre: 'Classement du mois',
    source: 'du mois',
    invite: "Vous n'avez couru aucun jour de ce mois.",
    lien: '/jouer',
  },
  {
    id: 'general',
    label: 'Général',
    titre: 'Classement général',
    source: 'depuis le lancement',
    invite: "Vous n'avez encore jamais couru.",
    lien: '/jouer',
  },
  {
    id: 'defi',
    label: 'Défi difficile',
    titre: 'Classement du défi difficile',
    source: 'du défi de la semaine',
    invite: "Vous n'avez pas encore relevé le défi de la semaine.",
    lien: '/defi',
  },
];

export default function Classement() {
  const date = todayStr();
  const lundi = lundiStr();
  const pseudo = usePseudo();
  const [params, setParams] = useSearchParams();
  const p = params.get('onglet');
  const onglet: Onglet = ONGLETS.some((o) => o.id === p) ? (p as Onglet) : 'jour';
  // Semaine, mois et général agrègent plusieurs jours : même règle de tri
  // (régularité puis temps moyen) et même détail dépliable côté « moi ».
  const agregat = onglet === 'semaine' || onglet === 'mois' || onglet === 'general';
  const semaine = useMemo(() => datesSemaine(date), [date]);
  // Seul le run en direct (première tentative du jour / de la semaine) compte.
  const historique = useHistorique(pseudo);
  const myRunJour = historique.find((r) => r.date === date && estEnDirect(r));
  const myDefi = useHistoriqueDefis(pseudo).find((r) => r.date === lundi && estEnDirect(r));
  const mesRunsAgreges = useMemo(() => {
    if (!agregat) return [];
    const direct = historique.filter(estEnDirect);
    if (onglet === 'semaine') return direct.filter((r) => semaine.includes(r.date));
    if (onglet === 'mois') return direct.filter((r) => r.date.slice(0, 7) === date.slice(0, 7));
    return direct;
  }, [agregat, historique, onglet, semaine, date]);
  const myRun = onglet === 'defi' ? myDefi : myRunJour;
  const aCouru = agregat ? mesRunsAgreges.length > 0 : !!myRun;
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
          : onglet === 'mois'
            ? classementMois(date, 100)
            : onglet === 'general'
              ? classementGeneral(100)
              : classementJour(date, 100);
    promesse.then((b) => vivant && setBoard(b));
    return () => {
      vivant = false;
    };
  }, [date, lundi, onglet]);

  const infos = ONGLETS.find((o) => o.id === onglet)!;

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
        <h2>{infos.titre}</h2>
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
  // les périodes, en agrégeant ses runs comme le font les classements agrégés.
  const monEntree: Entry | null = agregat
    ? mesRunsAgreges.length > 0
      ? {
          pseudo,
          ms: mesRunsAgreges.reduce((s, r) => s + r.totalMs, 0) / mesRunsAgreges.length,
          jours: mesRunsAgreges.length,
          flawless: mesRunsAgreges.every((r) => r.flawless),
          ...(onglet === 'semaine'
            ? {
                semaine: [...mesRunsAgreges]
                  .sort((x, y) => x.date.localeCompare(y.date))
                  .map((r) => ({ date: r.date, ms: r.totalMs, flawless: r.flawless })),
              }
            : {
                periode: [...mesRunsAgreges]
                  .sort((x, y) => x.totalMs - y.totalMs)
                  .slice(0, DETAIL_MAX)
                  .map((r) => ({ date: r.date, ms: r.totalMs, flawless: r.flawless })),
              }),
          me: true,
        }
      : null
    : myRun
      ? { pseudo, ms: myRun.totalMs, flawless: myRun.flawless, lines: myRun.lines, me: true }
      : null;
  if (monEntree && !all.some((e) => e.me)) {
    all = [...all, monEntree].sort(agregat ? compareAgrege : (x, y) => x.ms - y.ms);
  }

  return (
    <div className="lb" style={{ marginTop: 0 }}>
      <h2>{infos.titre}</h2>
      {onglets}
      {!aCouru && (
        <p className="note">
          {infos.invite} <Link to={infos.lien}>C'est par ici →</Link>
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
            ? `Classement basé sur les runs réels ${infos.source}.`
            : "Version démo hors-ligne : les autres joueurs sont simulés (déterministes). Seul votre temps est réel."}
        </p>
      )}
    </div>
  );
}
