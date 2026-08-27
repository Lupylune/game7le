/** Formate des millisecondes en `M:SS.cc` (ou `+/-Xs` pour un ajustement). */
export function formatMs(ms: number): string {
  const neg = ms < 0;
  const abs = Math.abs(ms);
  const totalS = Math.floor(abs / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  const cs = Math.floor((abs % 1000) / 10);
  return `${neg ? '-' : ''}${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/* Les unités sont collées à leur nombre par une espace insécable : l'unité ne
   part jamais seule à la ligne, et dans les contextes en fonte à chasse fixe
   (tuiles, tableaux) la CSS resserre en plus cette espace, très large en mono. */

/** Formate un ajustement en secondes signées : `−15 s` / `+90 s`. */
export function formatAdjust(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  return `${ms < 0 ? '−' : '+'}${s}\u00a0s`;
}

/** Durée en secondes décimales, sans unité : « 22,7 » — pour les colonnes de
 *  tableau dont l'en-tête porte déjà l'unité. */
export function formatSecNu(ms: number): string {
  return (ms / 1000).toFixed(1).replace('.', ',');
}

/** Formate une durée en secondes décimales : « 22,7 s ». */
export function formatSec(ms: number): string {
  return `${formatSecNu(ms)}\u00a0s`;
}

/** Formate une durée lisible : « 10 min 27 s ». */
export function formatLong(ms: number): string {
  const totalS = Math.round(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  if (m === 0) return `${s}\u00a0s`;
  return `${m}\u00a0min ${String(s).padStart(2, '0')}\u00a0s`;
}

export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Jour de la semaine capitalisé d'une date AAAA-MM-JJ (arithmétique en UTC). */
export function nomJour(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const jour = JOURS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
  return jour.charAt(0).toUpperCase() + jour.slice(1);
}

/** Date française lisible : « dimanche 13 juillet 2026 ». */
export function formatDateFr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Compte à rebours lisible, du plus grand palier utile au plus petit :
 * « 3 j 04 h 12 min », « 6 h 12 min 04 s », « 12 min 04 s », « 47 s ». Les
 * secondes disparaissent au-delà de 24 h, où elles ne veulent plus rien dire.
 */
export function formatCompteARebours(ms: number): string {
  // Arrondi au plafond : la dernière seconde s'affiche « 1 s », pas « 0 s » —
  // un compte à rebours n'annonce zéro qu'une fois l'échéance passée.
  const totalS = Math.max(0, Math.ceil(ms / 1000));
  const j = Math.floor(totalS / 86400);
  const h = Math.floor((totalS % 86400) / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const p2 = (n: number) => String(n).padStart(2, '0');
  if (j > 0) return `${j}\u00a0j ${p2(h)}\u00a0h ${p2(m)}\u00a0min`;
  if (h > 0) return `${h}\u00a0h ${p2(m)}\u00a0min ${p2(s)}\u00a0s`;
  if (m > 0) return `${m}\u00a0min ${p2(s)}\u00a0s`;
  return `${s}\u00a0s`;
}

/** Date française sans l'année : « jeudi 27 août ». */
export function formatDateCourte(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
