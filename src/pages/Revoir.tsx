import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { JEU_PAR_ID } from '../games';
import LecteurRun from '../components/LecteurRun';
import { estEnregistrement, loadEnregistrement, type Enregistrement } from '../lib/enregistrement';
import { lundiStr, todayStr } from '../lib/rng';
import { fetchEnregistrement } from '../lib/sync';
import { formatDateFr, formatMs } from '../lib/time';
import { useHistorique, useHistoriqueDefis } from '../lib/useHistorique';
import { usePseudo } from '../lib/usePseudo';

/**
 * Revoir un run : `/revoir/:date?pseudo=…&defi=1`. Sans pseudo (ou avec le
 * sien), l'enregistrement local d'abord ; sinon celui du serveur, qui ne garde
 * que les runs en direct. Le défi en cours (jour, ou semaine pour le défi
 * difficile) reste sous verrou tant qu'on ne l'a pas soi-même terminé :
 * revoir un run, c'est voir la solution.
 */
export default function Revoir() {
  const { date = '' } = useParams();
  const [params] = useSearchParams();
  const defi = params.get('defi') === '1';
  const monPseudo = usePseudo();
  const pseudo = params.get('pseudo') || monPseudo;
  const moi = pseudo === monPseudo;

  const runs = useHistorique(monPseudo);
  const defis = useHistoriqueDefis(monPseudo);
  const enCours = defi ? date === lundiStr() : date === todayStr();
  const fait = (defi ? defis : runs).some((r) => r.date === date);
  const verrouille = enCours && !fait && !moi;

  // undefined : chargement ; null : aucun enregistrement
  const [enr, setEnr] = useState<Enregistrement | null | undefined>(undefined);
  useEffect(() => {
    if (verrouille) return;
    let vivant = true;
    setEnr(undefined);
    const local = moi ? loadEnregistrement(date, defi) : null;
    const connu = (id: string) => JEU_PAR_ID.has(id);
    (local ? Promise.resolve(local) : fetchEnregistrement(pseudo, date, defi)).then((e) => {
      if (!vivant) return;
      setEnr(estEnregistrement(e, connu) && e.date === date && e.defi === defi ? e : null);
    });
    return () => {
      vivant = false;
    };
  }, [verrouille, moi, pseudo, date, defi]);

  const titre = defi ? `Défi difficile — semaine du ${formatDateFr(date)}` : formatDateFr(date);

  if (verrouille) {
    return (
      <div className="interstitial">
        <h2>Run de {pseudo}</h2>
        <p className="muted mt-4">{titre}</p>
        <p className="mt-4">
          Terminez {defi ? 'le défi difficile' : 'le défi du jour'} pour revoir le run des autres :
          il dévoile les solutions.
        </p>
        <Link className="btn btn-primary mt-6" to={defi ? '/defi' : '/jouer'}>
          Jouer
        </Link>
      </div>
    );
  }

  return (
    <div className="revoir">
      <div className="revoir-titre">
        <h1>Run de {pseudo}</h1>
        <p className="muted">
          {titre}
          {enr && <> · {formatMs(enr.totalMs)}</>}
        </p>
      </div>
      {enr === undefined ? (
        <p className="muted revoir-etat">Chargement de l'enregistrement…</p>
      ) : enr === null ? (
        <p className="muted revoir-etat">
          Pas d'enregistrement pour ce run : seuls les runs en direct joués depuis l'arrivée de la
          relecture sont gardés, et au-delà d'un mois, seulement ceux du top 10 du jour.
        </p>
      ) : (
        <LecteurRun key={`${pseudo}-${date}-${defi}`} enr={enr} />
      )}
    </div>
  );
}
