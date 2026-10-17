import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import HauteurFluide from '../components/HauteurFluide';
import GameIcon, { SymChrono, SymEtincelle, SymFlamme } from '../components/GameIcon';
import BalleDeFoin from '../components/BalleDeFoin';
import CompteARebours from '../components/CompteARebours';
import CompteurMs from '../components/CompteurMs';
import LigneClassement from '../components/LigneClassement';
import Solutions from '../components/Solutions';
import { jeuxDefiSemaine, jeuxDuJour, jeuxDuPool, JEUX_PAR_JOUR } from '../games';
import { classementJour, classementSemaine, type Board, type Entry } from '../lib/classement';
import { ajouteJours, lundiStr, minuitParis, prochainTirage, seededRng, pick } from '../lib/rng';
import { formatAdjust, formatDateCourte, formatDateJourMois, formatLong, formatMs } from '../lib/time';
import { VERDICTS } from '../lib/verdicts';
import { calculeStreak, estEnDirect, joursEnDirect } from '../lib/stats';
import { loadEnCours } from '../lib/storage';
import { useHistorique, useHistoriqueDefis } from '../lib/useHistorique';
import { useBadgeEpingle, useBadgesJoueurs } from '../lib/useBadges';
import { usePodiumSemaine } from '../lib/useChampion';
import { useJourCourant } from '../lib/useJour';
import { usePseudo } from '../lib/usePseudo';
import { lienRevoir, useRevoyables } from '../lib/useRevoyables';

/** Décalage entre deux cases du tirage dans leur apparition en cascade (cf. CSS). */
const CASCADE_MS = 70;

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
  const revoyables = useRevoyables(date, false, pseudo);
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
  // Solutions, réservées à qui a terminé son run en direct (comme à l'écran de
  // résultats) : celles du jour prennent la place du tirage dans sa carte,
  // celles du défi se déplient dans son bandeau. La page ne bouge pas : sans
  // ça, le navigateur compenserait le changement de hauteur en faisant
  // défiler jusqu'au bloc suivant.
  const [solJour, setSolJour] = useState(false);
  const [solDefi, setSolDefi] = useState(false);
  const defilementRef = useRef<number | null>(null);
  // Fondu d'entrée sur ce qui vient d'apparaître — pas au chargement de la page
  const [bascule, setBascule] = useState(false);
  const garde = (f: () => void) => () => {
    defilementRef.current = window.scrollY;
    setBascule(true);
    f();
  };
  const entree = bascule ? ' fondu-entree' : '';
  useLayoutEffect(() => {
    if (defilementRef.current == null) return;
    window.scrollTo(0, defilementRef.current);
    defilementRef.current = null;
  }, [solJour, solDefi]);

  // Tirage du jour : les cases se dévoilent une fois les épreuves jouées
  // (run fini, ou run en cours pour celles déjà bouclées) — jamais avant.
  const tailleTirage = jeuxDuPool(date).length;
  const jouees = myRun?.lines ?? enCours?.lines ?? [];

  return (
    <div>
      <section className="accueil-hero">
        <div className="accueil-intro">
          <Logo height={56} centre={false} />
          <p className="tagline">{tagline}</p>
          {myRun ? (
            <div className="accueil-fait">
              <span className="muted">Votre temps du jour</span>
              <span className="time">
                {formatMs(myRun.totalMs)} {myRun.flawless && <SymEtincelle size={22} />}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-accueil"
                aria-expanded={solJour}
                onClick={garde(() => setSolJour((v) => !v))}
              >
                {solJour ? 'Revoir le tirage' : 'Voir les solutions'}
              </button>
            </div>
          ) : (
            <div className="accueil-actions">
              <Link to="/jouer" className="btn btn-primary btn-accueil">
                {enCours ? 'Reprendre le Game7le du jour' : 'Lancer le Game7le du jour'}
              </Link>
              <Link to="/comment-jouer" className="btn btn-contour btn-accueil">
                Comment jouer
              </Link>
            </div>
          )}
          <p className="hero-date">
            {formatDateCourte(date)}
            {streak > 0 && (
              <>
                {' · '}
                <SymFlamme /> série de {streak} jour{streak > 1 ? 's' : ''}
              </>
            )}
            {myRun && (
              <>
                {' · '}
                <CompteARebours cible={prochainJour} libelle="prochain dans" />
              </>
            )}
          </p>
        </div>

        <HauteurFluide className="accueil-tirage">
          {solJour && myRun ? (
            <div className={`tirage-carte${entree}`}>
              <div className="tirage-entete">
                <span>Solutions du {formatDateJourMois(date)}</span>
              </div>
              <Solutions date={date} ids={jeuxDuJour(date).map((j) => j.id)} onglets />
            </div>
          ) : (
            <div className={`tirage-carte${entree}`}>
              <div className="tirage-entete">
                <span>Tirage du {formatDateJourMois(date)}</span>
                <span>
                  {JEUX_PAR_JOUR} / {tailleTirage}
                </span>
              </div>
              <ol className="tirage-grille">
                {Array.from({ length: JEUX_PAR_JOUR }, (_, i) => {
                  const l = jouees[i];
                  return (
                    <li
                      key={i}
                      className={`tirage-case${l ? ` jouee ${l.status}` : ''}`}
                      style={{ '--i': i } as CSSProperties}
                      title={l ? `${l.nom} — ${VERDICTS[l.status].label}` : undefined}
                    >
                      {l ? (
                        <>
                          <GameIcon id={l.id} size={20} />
                          {l.ms != null && (
                            <span className="tirage-temps">
                              <CompteurMs ms={l.ms} delaiMs={CASCADE_MS * i + 200} dureeMs={800} />
                            </span>
                          )}
                          <span className="tirage-ajust">
                            {l.adjustMs === 0 ? '—' : formatAdjust(l.adjustMs)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="tirage-mystere" aria-hidden>
                            ?
                          </span>
                          <span className="tirage-num">{i + 1}</span>
                        </>
                      )}
                    </li>
                  );
                })}
                <li
                  className={`tirage-case tirage-chrono${myRun ? ' fini' : ''}`}
                  style={{ '--i': JEUX_PAR_JOUR } as CSSProperties}
                >
                  <SymChrono size={18} />
                  <span>
                    <CompteurMs
                      ms={myRun?.totalMs ?? 0}
                      delaiMs={CASCADE_MS * JEUX_PAR_JOUR + 200}
                      dureeMs={1100}
                    />
                  </span>
                </li>
              </ol>
              {!myRun && (
                <p className="tirage-legende">
                  Les épreuves se révèlent une à une, chrono lancé. Bonus et pénalités s’ajoutent au
                  temps total.
                </p>
              )}
            </div>
          )}
        </HauteurFluide>
      </section>

      <section className="accueil-defi" aria-label="Défi difficile de la semaine">
        <div className="accueil-defi-ligne">
          <SymFlamme size={26} />
          <div className="accueil-defi-texte">
            <h2>Défi difficile de la semaine</h2>
            <p>
              {myDefi ? (
                <>
                  Votre temps :{' '}
                  <strong className="accueil-defi-temps">
                    {formatMs(myDefi.totalMs)} {myDefi.flawless && <SymEtincelle size={14} />}
                  </strong>
                </>
              ) : (
                <>
                  {JEUX_PAR_JOUR} épreuves en variante corsée, même tirage jusqu'à lundi. Seuil
                  SANS-FAUTE à 8 min.
                </>
              )}
            </p>
          </div>
          <div className="accueil-defi-echeance">
            <span>Nouveau défi dans</span>
            <CompteARebours cible={prochainDefi} libelle="" court />
          </div>
          {myDefi ? (
            <button
              type="button"
              className="btn btn-defi-contour"
              aria-expanded={solDefi}
              onClick={garde(() => setSolDefi((v) => !v))}
            >
              {solDefi ? 'Masquer les solutions' : 'Solutions'}
            </button>
          ) : (
            <Link to="/defi" className="btn btn-defi-contour">
              {enCoursDefi ? 'Reprendre le défi' : 'Relever le défi'}
            </Link>
          )}
        </div>
        <HauteurFluide>
          {solDefi && myDefi && (
            <div className={`accueil-defi-solutions${entree}`}>
              <Solutions date={lundi} ids={jeuxDefiSemaine(lundi).map((j) => j.id)} defi onglets />
            </div>
          )}
        </HauteurFluide>
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
                  profil={board.reel || e.pseudo === pseudo}
                  revoir={revoyables.has(e.pseudo) ? lienRevoir(date, false, e.pseudo) : false}
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
                  profil={semaine.reel || e.pseudo === pseudo}
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
