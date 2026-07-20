import { Link } from 'react-router-dom';
import { loadSettings, saveSettings } from '../lib/storage';
import { syncBadge } from '../lib/sync';
import { useBadgeChoisi } from '../lib/usePseudo';
import { useBadges } from '../lib/useBadges';
import { NIVEAUX, tokenBadge, type EtatBadge, type Niveau } from '../lib/badges';
import BadgeIcon, { couleurNiveau } from './BadgeIcon';

/** Trois pastilles bronze/argent/or, allumées jusqu'au niveau atteint. */
function Paliers({ e }: { e: EtatBadge }) {
  if (!e.def.paliers) return null;
  const rang = e.niveau ? NIVEAUX.indexOf(e.niveau) : -1;
  return (
    <span className="badge-paliers" aria-hidden>
      {e.def.paliers.map((p, i) => (
        <span
          key={p.niveau}
          className="pip"
          style={{ background: i <= rang ? couleurNiveau(p.niveau) : 'var(--border)' }}
          title={`${p.niveau} · ${p.seuil}`}
        />
      ))}
    </span>
  );
}

function progression(e: EtatBadge): string {
  const { def, valeur, prochainSeuil, niveau } = e;
  if (def.sens === 'min') {
    if (!Number.isFinite(valeur)) return 'Pas encore atteint';
    return `Meilleur : ${valeur}${def.unite ?? ''}`;
  }
  if (prochainSeuil == null) return niveau ? 'Palier maximal atteint' : 'Débloqué';
  return `${valeur} / ${prochainSeuil}${def.unite ? ` ${def.unite}` : ''}`;
}

/**
 * Grille des badges (achievements) d'un pseudo : débloqués/verrouillés, avec
 * progression. Cliquer un badge débloqué l'épingle comme picto affiché à
 * gauche du pseudo (re-clic pour le retirer).
 */
export default function BadgesGrille({ pseudo }: { pseudo: string }) {
  const etats = useBadges(pseudo);
  const choix = useBadgeChoisi();
  const nbDebloques = etats.filter((e) => e.debloque).length;

  function choisir(e: EtatBadge) {
    if (!e.debloque) return;
    const token = tokenBadge(e.def.id, e.niveau);
    const prochain = choix === token ? '' : token; // re-clic = retirer le picto
    saveSettings({ ...loadSettings(), badge: prochain });
    syncBadge(pseudo, prochain);
  }

  return (
    <>
      <h2>Badges ({nbDebloques}/{etats.length})</h2>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Cliquez un badge débloqué pour l'épingler à gauche de votre pseudo dans le classement.
      </p>
      <ul className="badges-grid">
        {etats.map((e) => {
          const token = tokenBadge(e.def.id, e.niveau);
          const epingle = e.debloque && choix === token;
          return (
            <li
              key={e.def.id}
              className={`badge-carte${e.debloque ? '' : ' verrou'}${epingle ? ' epingle' : ''}`}
            >
              <button
                type="button"
                className="badge-carte-btn"
                onClick={() => choisir(e)}
                disabled={!e.debloque}
                aria-pressed={epingle}
                title={e.debloque ? (epingle ? 'Retirer le picto' : 'Épingler ce picto') : 'Verrouillé'}
              >
                <span className="badge-vignette">
                  <BadgeIcon id={e.def.id} niveau={e.niveau as Niveau | null} size={40} />
                </span>
                <span className="badge-nom">
                  {e.def.nom}
                  {epingle && <span className="badge-epingle-tag">épinglé</span>}
                </span>
                <span className="badge-desc">{e.def.desc}</span>
                <span className="badge-progres">
                  <Paliers e={e} />
                  <span className="muted">{progression(e)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Numéro 1 se débloque d'après le classement réel — indisponible hors connexion.{' '}
        <Link to="/classement">Voir le classement →</Link>
      </p>
    </>
  );
}
