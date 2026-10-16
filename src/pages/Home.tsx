import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import HauteurFluide from '../components/HauteurFluide';
import { SymEtincelle, SymFlamme } from '../components/GameIcon';
import BalleDeFoin from '../components/BalleDeFoin';
import CompteARebours from '../components/CompteARebours';
import LigneClassement from '../components/LigneClassement';
import Solutions from '../components/Solutions';
import { jeuxDefiSemaine, jeuxDuJour } from '../games';
import { classementJour, classementSemaine, type Board, type Entry } from '../lib/classement';
import { ajouteJours, lundiStr, minuitParis, prochainTirage, seededRng, pick } from '../lib/rng';
import { formatDateCourte, formatLong, formatMs } from '../lib/time';
import { calculeStreak, estEnDirect, joursEnDirect } from '../lib/stats';
import { loadEnCours } from '../lib/storage';
import { useHistorique, useHistoriqueDefis } from '../lib/useHistorique';
import { useBadgeEpingle, useBadgesJoueurs } from '../lib/useBadges';
import { usePodiumSemaine } from '../lib/useChampion';
import { useJourCourant } from '../lib/useJour';
import { usePseudo } from '../lib/usePseudo';

const TAGLINES = [
  'ゲーム、セット、スタート。',
];

export default function Home() {
  // Jour réactif : passé minuit, l'accueil bascule seul sur le nouveau tirage.
  const date = useJourCourant();
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
  const podium = usePodiumSemaine();
  const monBadge = useBadgeEpingle(pseudo);
  const avecBadge = (e: Entry): Entry => ({
    ...e,
    badge: e.pseudo === pseudo ? monBadge || undefined : badges[e.pseudo] ?? e.badge,
  });
  // Le temps « officiel » du jour est celui de la première tentative (en
  // direct) — les rejeux du jour même sont des runs d'archive.
  const myRun = runs.find((r) => r.date === date && estEnDirect(r));
  const streak = calculeStreak(joursEnDirect(runs), date);
  const tagline = pick(seededRng(`tagline:${date}`), TAGLINES);
  // Défi difficile de la semaine : temps officiel (première tentative)
  const lundi = lundiStr(date);
  const myDefi = useHistoriqueDefis(pseudo).find((r) => r.date === lundi && estEnDirect(r));
  // Run laissé en cours (page quittée en pleine partie) : l'appel à l'action le dit
  const enCours = loadEnCours(date, false);
  const enCoursDefi = loadEnCours(lundi, true);
  // Prochaines échéances : minuit pour le tirage du jour, lundi prochain pour le défi
  const prochainJour = prochainTirage(date);
  const prochainDefi = minuitParis(ajouteJours(lundi, 7));
  // Solutions dépliées depuis une carte « fini » : réservées à qui a terminé
  // son run en direct, comme à l'écran de résultats — les cartes n'existent pas
  // avant.
  const [solutions, setSolutionsBrut] = useState<'jour' | 'defi' | null>(null);
  // Les solutions prennent la place de la carte qui les a ouvertes ; « Masquer »
  // la fait revenir. La page ne bouge pas : sans ça, le navigateur compenserait
  // le changement de hauteur en faisant défiler jusqu'au bloc suivant.
  const defilementRef = useRef<number | null>(null);
  // Fondu d'entrée sur ce qui remplace la carte — pas au chargement de la page
  const [bascule, setBascule] = useState(false);
  const setSolutions = (s: 'jour' | 'defi' | null) => {
    defilementRef.current = window.scrollY;
    setBascule(true);
    setSolutionsBrut(s);
  };
  const entree = bascule ? ' fondu-entree' : '';
  useLayoutEffect(() => {
    if (defilementRef.current == null) return;
    window.scrollTo(0, defilementRef.current);
    defilementRef.current = null;
  }, [solutions]);
  const masquer = (
    <button type="button" className="btn btn-sm" onClick={() => setSolutions(null)}>
      Masquer les solutions
    </button>
  );

  return (
    <div>
      <section className="hero">
        <Logo height={100} />
        <p className="tagline">{tagline}</p>
        <div className="hero-cta">
          <HauteurFluide className="hero-emplacement">
          {solutions === 'jour' && myRun ? (
            <section className={`solutions-accueil${entree}`} aria-label="Solutions du jour">
              <h2>Les solutions du jour</h2>
              {masquer}
              <Solutions date={date} ids={jeuxDuJour(date).map((j) => j.id)} onglets />
            </section>
          ) : myRun ? (
            <div className={`done-card${entree}`}>
              <span className="muted">Votre temps du jour</span>
              <span className="time">
                {formatMs(myRun.totalMs)} {myRun.flawless && <SymEtincelle size={18} />}
              </span>
              <CompteARebours cible={prochainJour} libelle="Prochain dans" />
              <Link to="/classement">Voir le classement →</Link>
              <button type="button" className="btn btn-sm" onClick={() => setSolutions('jour')}>
                Voir les solutions
              </button>
            </div>
          ) : (
            <Link to="/jouer" className="btn btn-primary btn-lg">
              {enCours ? 'Reprendre le Game7le du jour' : 'Lancer le Game7le du jour'}
            </Link>
          )}
          </HauteurFluide>
          <span className="hero-date">
            {formatDateCourte(date)}
            {streak > 0 && (
              <>
                {' · '}
                <SymFlamme /> série de {streak} jour{streak > 1 ? 's' : ''}
              </>
            )}
          </span>
          <HauteurFluide className="hero-emplacement">
          {solutions === 'defi' && myDefi ? (
            <section className={`solutions-accueil${entree}`} aria-label="Solutions du défi de la semaine">
              <h2>Les solutions du défi de la semaine</h2>
              {masquer}
              <Solutions date={lundi} ids={jeuxDefiSemaine(lundi).map((j) => j.id)} defi onglets />
            </section>
          ) : myDefi ? (
            <div className={`done-card${entree}`}>
              <span className="muted">Votre défi difficile de la semaine</span>
              <span className="time">
                {formatMs(myDefi.totalMs)} {myDefi.flawless && <SymEtincelle size={18} />}
              </span>
              <CompteARebours cible={prochainDefi} libelle="Prochain dans" />
              <Link to="/classement?onglet=defi">Voir le classement →</Link>
              <button type="button" className="btn btn-sm" onClick={() => setSolutions('defi')}>
                Voir les solutions
              </button>
            </div>
          ) : (
            <Link to="/defi" className="btn btn-defi">
              <SymFlamme size={18} /> {enCoursDefi ? 'Reprendre le défi' : 'Défi difficile'}{' '}
              <SymFlamme size={18} />
            </Link>
          )}
          </HauteurFluide>
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
                  podium={podium}
                  messageVerrou="Terminez le défi du jour pour voir le détail des temps."
                />
              ))}
            </ol>
            <p className="global-avg">
              Moyenne du jour : {formatLong(board.avgMs)} sur{' '}
              {board.runs.toLocaleString('fr-FR')} run{board.runs > 1 ? 's' : ''}.
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
                  podium={podium}
                  messageVerrou="Terminez le défi du jour pour voir le détail des temps."
                />
              ))}
            </ol>
            <p className="global-avg">
              Moyenne de la semaine, classé par régularité.
            </p>
            <Link to="/classement?onglet=semaine" className="see-more">
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
