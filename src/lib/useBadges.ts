import { useEffect, useState, useSyncExternalStore } from 'react';
import { loadSettings, saveSettings } from './storage';
import { rangsReels } from './classement';
import { fetchBadges, syncBadge } from './sync';
import { estEnDirect } from './stats';
import { useHistorique, useHistoriqueDefis } from './useHistorique';
import { todayStr } from './rng';
import { calculeBadges, type CtxBadges, type EtatBadge } from './badges';

/**
 * État de tous les badges d'un pseudo, calculé depuis son historique (runs
 * quotidiens + défis + rangs réels). Le nombre de premières places est chargé
 * depuis Supabase quand il est disponible ; sinon le badge Numéro 1 reste
 * verrouillé (rangs réels inconnus).
 */
export function useBadges(pseudo: string): EtatBadge[] {
  const runs = useHistorique(pseudo);
  const runsLive = runs.filter(estEnDirect);
  const defis = useHistoriqueDefis(pseudo);
  const [nbNumeroUn, setNbNumeroUn] = useState(0);

  const datesKey = runsLive
    .map((r) => r.date)
    .sort()
    .join(',');

  useEffect(() => {
    let vivant = true;
    setNbNumeroUn(0);
    rangsReels(pseudo, datesKey ? datesKey.split(',') : []).then((r) => {
      if (!vivant || !r) return;
      setNbNumeroUn(Object.values(r).filter((v) => v.rang === 1).length);
    });
    return () => {
      vivant = false;
    };
  }, [pseudo, datesKey]);

  const ctx: CtxBadges = {
    runs,
    runsLive,
    defis,
    nbNumeroUn,
    today: todayStr(),
  };
  return calculeBadges(ctx);
}

/**
 * Badges (tokens) choisis par un ensemble de pseudos, pour les afficher dans un
 * classement. Best-effort : objet vide tant que rien n'est chargé ou si le
 * backend ne fournit pas les badges.
 */
export function useBadgesJoueurs(pseudos: string[]): Record<string, string> {
  const key = [...new Set(pseudos)].sort().join(',');
  const [badges, setBadges] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivant = true;
    fetchBadges(key ? key.split(',') : []).then((r) => {
      if (vivant && r) setBadges(r);
    });
    return () => {
      vivant = false;
    };
  }, [key]);
  return badges;
}

/* ===== Badge épinglé du joueur courant =====
 *
 * La source de vérité est `comptes.badge` côté Supabase : le badge est attaché
 * au pseudo, pas au navigateur, et suit donc le joueur d'un appareil à l'autre.
 * Les réglages locaux ne gardent qu'un *miroir* du dernier état connu, utilisé
 * comme cache d'affichage tant que le serveur n'a pas répondu — et comme seul
 * recours quand il n'y a pas de backend (`fetchBadges` renvoie `null`), auquel
 * cas l'app reste utilisable en local comme le reste des fonctionnalités.
 *
 * Un petit store module (`useSyncExternalStore`) porte l'état pour que toutes
 * les vues qui affichent mon badge (accueil, classement, profil, grille) se
 * mettent à jour ensemble, sans re-fetch ni rechargement.
 */

/** Pseudo pour lequel une lecture serveur a déjà été lancée. */
let pseudoCharge: string | null = null;
/** Token affiché, amorcé au miroir local le temps de la réponse serveur. */
let epingle = loadSettings().badge;
const abonnes = new Set<() => void>();

function abonneEpingle(cb: () => void): () => void {
  abonnes.add(cb);
  return () => {
    abonnes.delete(cb);
  };
}

function poseEpingle(token: string): void {
  if (token === epingle) return;
  epingle = token;
  for (const cb of [...abonnes]) cb();
}

/** Met à jour le miroir local (cache d'affichage, jamais la source de vérité). */
function miroir(token: string): void {
  const s = loadSettings();
  if (s.badge !== token) saveSettings({ ...s, badge: token });
}

function charge(pseudo: string): void {
  if (!pseudo || pseudo === 'Vous' || pseudo === pseudoCharge) return;
  // Changement de pseudo en cours de session : le miroir appartient à l'ancien
  // pseudo, on ne l'affiche pas sous le nouveau nom.
  if (pseudoCharge !== null) {
    poseEpingle('');
    miroir('');
  }
  pseudoCharge = pseudo;
  fetchBadges([pseudo]).then((r) => {
    if (!r || pseudoCharge !== pseudo) return; // backend absent : on garde le miroir
    const token = r[pseudo] ?? ''; // absent côté serveur = aucun badge épinglé
    poseEpingle(token);
    miroir(token);
  });
}

/**
 * Badge épinglé (token) du pseudo courant, lu depuis Supabase. Réactif : tout
 * composant monté avec ce hook déclenche/partage la même lecture et voit les
 * changements de choix immédiatement.
 */
export function useBadgeEpingle(pseudo: string): string {
  useEffect(() => {
    charge(pseudo);
  }, [pseudo]);
  return useSyncExternalStore(abonneEpingle, () => epingle);
}

/**
 * Épingle (ou retire, avec `''`) un badge pour un pseudo : écriture serveur via
 * `set_badge`, affichage mis à jour de façon optimiste et miroir local rafraîchi.
 * Si l'écriture échoue (backend absent/injoignable), le choix reste visible et
 * survit au rechargement grâce au miroir, jusqu'à ce que le serveur réponde.
 */
export function choisisBadge(pseudo: string, token: string): void {
  poseEpingle(token);
  miroir(token);
  syncBadge(pseudo, token);
}
