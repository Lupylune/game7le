import { supabase } from './supabase';
import { loadDefis, loadRuns, type GameLine } from './storage';
import { estEnDirect } from './stats';

/**
 * Statistiques agrégées sur *tous* les runs enregistrés (page `/statistiques`),
 * par opposition aux stats personnelles du profil. Source : les runs joués en
 * direct de la table Supabase `runs` — donc tous les joueurs ; à défaut de
 * backend, repli sur l'historique local du navigateur (`reel: false`).
 */

/** Un run brut, tel qu'il alimente les agrégats. */
export interface RunGlobal {
  pseudo: string;
  date: string;
  totalMs: number;
  flawless: boolean;
  lines: GameLine[];
}

/** Un temps remarquable, avec son auteur et son jour. */
export interface Marque {
  ms: number;
  pseudo: string;
  date: string;
}

/** Nombre de parties minimum pour prétendre au titre de « spécialiste » d'une épreuve. */
export const MIN_PARTIES_SPECIALISTE = 3;

export interface StatsJeuGlobal {
  id: string;
  nom: string;
  /** Nombre de fois où l'épreuve a été jouée (toutes issues confondues). */
  parties: number;
  reussies: number;
  passees: number;
  echouees: number;
  /** Parties dont la durée est connue (`GameLine.ms`, absent des vieux runs). */
  mesures: number;
  moyenneMs: number | null;
  meilleur: Marque | null;
  pire: Marque | null;
  /** Ajustement moyen (bonus/malus) laissé par l'épreuve, en ms signés. */
  ajustMoyenMs: number;
  /** Meilleure moyenne d'un joueur (≥ `MIN_PARTIES_SPECIALISTE` parties chronométrées). */
  specialiste: { pseudo: string; ms: number; parties: number } | null;
  /** Les mêmes chiffres pour le pseudo courant. */
  moi: { parties: number; moyenneMs: number | null; meilleurMs: number | null };
}

/** Une barre de l'histogramme : les runs dont le temps tombe dans `[debut, fin[`. */
export interface Tranche {
  debut: number;
  fin: number;
  n: number;
}

/**
 * Un point de la courbe de distribution : l'effectif *attendu* autour de ce
 * temps, exprimé dans la même unité que les tranches (« runs par tranche »),
 * pour que la courbe lissée et le tableau des tranches se lisent sur la même
 * échelle.
 */
export interface PointDensite {
  ms: number;
  n: number;
}

/** Un point de série temporelle : la moyenne du jour, et votre temps ce jour-là. */
export interface PointJour {
  date: string;
  /** Moyenne de la communauté ce jour-là (ms). */
  ms: number;
  /** Nombre de mesures derrière la moyenne. */
  n: number;
  /** Votre temps ce jour-là, `null` si vous n'avez pas joué. */
  moiMs: number | null;
}

export interface StatsGlobales {
  /** `true` = agrégat de tous les joueurs (Supabase) ; `false` = repli local. */
  reel: boolean;
  runs: number;
  joueurs: number;
  /** Premier et dernier jour couverts par les données. */
  depuis: string | null;
  jusqua: string | null;
  moyenneRunMs: number;
  medianeRunMs: number;
  meilleurRun: Marque | null;
  pireRun: Marque | null;
  flawless: number;
  /** Temps de jeu cumulé (somme des temps finaux). */
  tempsTotalMs: number;
  epreuves: number;
  moyenneEpreuveMs: number | null;
  tauxReussiteP: number;
  tauxPasseP: number;
  tauxEchecP: number;
  /** Temps gagné en bonus / perdu en pénalités, sur l'ensemble des runs. */
  bonusMs: number;
  malusMs: number;
  /** Journées les plus rapides / les plus dures (moyenne du jour, ≥ 2 runs). */
  jourFacile: { date: string; ms: number; runs: number } | null;
  jourDur: { date: string; ms: number; runs: number } | null;
  jeux: StatsJeuGlobal[];
  /** Votre temps de run moyen, pour vous situer dans la distribution. */
  moiMoyenneRunMs: number | null;
  /**
   * Distribution des temps de run : la courbe lissée qui est tracée, et les
   * tranches brutes qui la sous-tendent (infobulle et tableau de données).
   */
  distribution: { pas: number; tranches: Tranche[]; courbe: PointDensite[] };
  /** Part des runs plus lents que votre moyenne (%), pour vous situer. */
  moiPercentileP: number | null;
  /** Temps de run moyen jour après jour (communauté + vous). */
  serieRuns: PointJour[];
  /** Idem par mini-jeu (`id` → série), sur les seules épreuves réussies. */
  serieParJeu: Record<string, PointJour[]>;
}

const VIDE: StatsGlobales = {
  reel: false,
  runs: 0,
  joueurs: 0,
  depuis: null,
  jusqua: null,
  moyenneRunMs: 0,
  medianeRunMs: 0,
  meilleurRun: null,
  pireRun: null,
  flawless: 0,
  tempsTotalMs: 0,
  epreuves: 0,
  moyenneEpreuveMs: null,
  tauxReussiteP: 0,
  tauxPasseP: 0,
  tauxEchecP: 0,
  bonusMs: 0,
  malusMs: 0,
  jourFacile: null,
  jourDur: null,
  jeux: [],
  moiMoyenneRunMs: null,
  moiPercentileP: null,
  distribution: { pas: 0, tranches: [], courbe: [] },
  serieRuns: [],
  serieParJeu: {},
};

/**
 * Pas possibles des tranches de la distribution : des paliers que l'œil lit
 * vite, la minute étant le plus fin — en dessous, un temps de run se compte en
 * miettes et chaque tranche ne pèse plus qu'un run ou deux.
 */
const PAS_TRANCHES = [60e3, 120e3, 180e3, 300e3, 600e3, 900e3];
/**
 * Nombre de tranches visé. Calibré pour que l'étendue habituelle des runs
 * quotidiens (quelques minutes à ~25 min) tombe sur la tranche d'une minute ;
 * les épreuves beaucoup plus longues (défi difficile) montent d'un palier
 * plutôt que d'émietter la courbe — le sous-titre annonce toujours le pas.
 */
const TRANCHES_CIBLE = 26;

/** Points de la courbe lissée : assez pour un tracé fluide, sans excès de calcul. */
const POINTS_COURBE = 120;

/**
 * Estimation de densité par noyau gaussien (largeur de bande de Silverman,
 * plancher à un demi-pas pour ne pas obtenir une courbe en peigne sur peu de
 * données). Le résultat est mis à l'échelle des tranches : `n` se lit « nombre
 * de runs attendu par tranche de `pas` », donc la courbe et l'histogramme
 * qu'elle remplace partagent le même axe.
 */
function lisse(valeurs: number[], pas: number): PointDensite[] {
  const n = valeurs.length;
  if (n === 0 || pas <= 0) return [];
  const tries = [...valeurs].sort((a, b) => a - b);
  const min = tries[0];
  const max = tries[n - 1];
  const moyenne = tries.reduce((s, v) => s + v, 0) / n;
  const ecart = Math.sqrt(tries.reduce((s, v) => s + (v - moyenne) ** 2, 0) / Math.max(1, n - 1));
  const q = (p: number) => tries[Math.min(n - 1, Math.floor(p * n))];
  const iqr = q(0.75) - q(0.25);
  // Silverman : 0,9 × min(σ, IQR/1,34) × n^(-1/5)
  const disp = Math.min(ecart || Infinity, iqr > 0 ? iqr / 1.34 : Infinity);
  const h = Math.max(pas / 2, Number.isFinite(disp) ? 0.9 * disp * Math.pow(n, -0.2) : pas);
  const debut = Math.max(0, min - h);
  const fin = max + h;
  const norme = pas / (h * Math.sqrt(2 * Math.PI));
  return Array.from({ length: POINTS_COURBE }, (_, i) => {
    const ms = debut + ((fin - debut) * i) / (POINTS_COURBE - 1);
    let somme = 0;
    for (const v of tries) {
      const z = (ms - v) / h;
      if (z > -4 && z < 4) somme += Math.exp(-0.5 * z * z); // au-delà, la contribution est nulle
    }
    return { ms, n: somme * norme };
  });
}

/** Découpe des temps en tranches régulières, alignées sur un pas rond. */
function distribue(valeurs: number[]): { pas: number; tranches: Tranche[]; courbe: PointDensite[] } {
  if (valeurs.length === 0) return { pas: 0, tranches: [], courbe: [] };
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const brut = (max - min) / TRANCHES_CIBLE || 1;
  const pas = PAS_TRANCHES.find((p) => p >= brut) ?? PAS_TRANCHES[PAS_TRANCHES.length - 1];
  const debut = Math.floor(min / pas) * pas;
  const n = Math.max(1, Math.floor((max - debut) / pas) + 1);
  const tranches: Tranche[] = Array.from({ length: n }, (_, i) => ({
    debut: debut + i * pas,
    fin: debut + (i + 1) * pas,
    n: 0,
  }));
  for (const v of valeurs) tranches[Math.min(n - 1, Math.floor((v - debut) / pas))].n++;
  return { pas, tranches, courbe: lisse(valeurs, pas) };
}

/** Série temporelle depuis un cumul par date, triée par date croissante. */
function serie(parJour: Map<string, { total: number; n: number; moi: number | null }>): PointJour[] {
  return [...parJour.entries()]
    .map(([date, v]) => ({ date, ms: v.total / v.n, n: v.n, moiMs: v.moi }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

interface AccJeu {
  nom: string;
  parties: number;
  reussies: number;
  passees: number;
  echouees: number;
  mesures: number;
  totalMs: number;
  ajustTotalMs: number;
  meilleur: Marque | null;
  pire: Marque | null;
  /** Par joueur : cumul des parties chronométrées, pour le « spécialiste ». */
  parJoueur: Map<string, { total: number; parties: number }>;
  /** Meilleur temps du pseudo courant sur l'épreuve. */
  moiMeilleurMs: number | null;
  /** Par date : moyenne de l'épreuve ce jour-là, et votre temps (courbe). */
  parJour: Map<string, { total: number; n: number; moi: number | null }>;
}

/** Agrégat de tous les runs fournis. Pur : aucune I/O, testable tel quel. */
export function calculeStatsGlobales(
  runs: RunGlobal[],
  pseudo: string,
  reel: boolean,
): StatsGlobales {
  if (runs.length === 0) return { ...VIDE, reel };

  const jeux = new Map<string, AccJeu>();
  const joueurs = new Set<string>();
  const parJour = new Map<string, { total: number; n: number; moi: number | null }>();
  let tempsTotalMs = 0;
  let flawless = 0;
  let epreuves = 0;
  let reussies = 0;
  let passees = 0;
  let echouees = 0;
  let bonusMs = 0;
  let malusMs = 0;
  let meilleurRun: Marque | null = null;
  let pireRun: Marque | null = null;

  for (const r of runs) {
    joueurs.add(r.pseudo);
    tempsTotalMs += r.totalMs;
    if (r.flawless) flawless++;
    if (!meilleurRun || r.totalMs < meilleurRun.ms)
      meilleurRun = { ms: r.totalMs, pseudo: r.pseudo, date: r.date };
    if (!pireRun || r.totalMs > pireRun.ms)
      pireRun = { ms: r.totalMs, pseudo: r.pseudo, date: r.date };
    const j = parJour.get(r.date) ?? { total: 0, n: 0, moi: null };
    j.total += r.totalMs;
    j.n++;
    if (r.pseudo === pseudo) j.moi = r.totalMs;
    parJour.set(r.date, j);

    for (const l of r.lines ?? []) {
      epreuves++;
      if (l.status === 'success') reussies++;
      else if (l.status === 'skip') passees++;
      else echouees++;
      if (l.adjustMs < 0) bonusMs += l.adjustMs;
      else malusMs += l.adjustMs;

      const a: AccJeu =
        jeux.get(l.id) ??
        {
          nom: l.nom,
          parties: 0,
          reussies: 0,
          passees: 0,
          echouees: 0,
          mesures: 0,
          totalMs: 0,
          ajustTotalMs: 0,
          meilleur: null,
          pire: null,
          parJoueur: new Map(),
          moiMeilleurMs: null,
          parJour: new Map(),
        };
      a.parties++;
      if (l.status === 'success') a.reussies++;
      else if (l.status === 'skip') a.passees++;
      else a.echouees++;
      a.ajustTotalMs += l.adjustMs;
      // Records et moyennes : uniquement sur les épreuves réellement résolues.
      // Une épreuve passée ou ratée n'est pas une performance chronométrable.
      if (l.ms != null && l.status === 'success') {
        a.mesures++;
        a.totalMs += l.ms;
        if (!a.meilleur || l.ms < a.meilleur.ms)
          a.meilleur = { ms: l.ms, pseudo: r.pseudo, date: r.date };
        if (!a.pire || l.ms > a.pire.ms) a.pire = { ms: l.ms, pseudo: r.pseudo, date: r.date };
        const p = a.parJoueur.get(r.pseudo) ?? { total: 0, parties: 0 };
        p.total += l.ms;
        p.parties++;
        a.parJoueur.set(r.pseudo, p);
        if (r.pseudo === pseudo && (a.moiMeilleurMs == null || l.ms < a.moiMeilleurMs))
          a.moiMeilleurMs = l.ms;
        const jour = a.parJour.get(r.date) ?? { total: 0, n: 0, moi: null };
        jour.total += l.ms;
        jour.n++;
        if (r.pseudo === pseudo) jour.moi = l.ms;
        a.parJour.set(r.date, jour);
      }
      jeux.set(l.id, a);
    }
  }

  const tries = runs.map((r) => r.totalMs).sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);
  const medianeRunMs =
    tries.length % 2 === 1 ? tries[milieu] : (tries[milieu - 1] + tries[milieu]) / 2;

  // Journées extrêmes : au moins 2 runs, sinon la « moyenne du jour » est un run isolé.
  const jours = [...parJour.entries()]
    .filter(([, v]) => v.n >= 2)
    .map(([date, v]) => ({ date, ms: v.total / v.n, runs: v.n }));
  const jourFacile = jours.length > 0 ? jours.reduce((a, b) => (b.ms < a.ms ? b : a)) : null;
  const jourDur = jours.length > 0 ? jours.reduce((a, b) => (b.ms > a.ms ? b : a)) : null;

  const dates = runs.map((r) => r.date).sort();
  const mesuresTotal = [...jeux.values()].reduce((s, a) => s + a.mesures, 0);
  const sommeMesures = [...jeux.values()].reduce((s, a) => s + a.totalMs, 0);
  const mesRuns = runs.filter((r) => r.pseudo === pseudo);
  const moiMoyenne =
    mesRuns.length > 0 ? mesRuns.reduce((s, r) => s + r.totalMs, 0) / mesRuns.length : null;

  return {
    reel,
    runs: runs.length,
    joueurs: joueurs.size,
    depuis: dates[0] ?? null,
    jusqua: dates[dates.length - 1] ?? null,
    moyenneRunMs: tempsTotalMs / runs.length,
    medianeRunMs,
    meilleurRun,
    pireRun,
    flawless,
    tempsTotalMs,
    epreuves,
    moyenneEpreuveMs: mesuresTotal > 0 ? sommeMesures / mesuresTotal : null,
    tauxReussiteP: epreuves > 0 ? Math.round((reussies / epreuves) * 100) : 0,
    tauxPasseP: epreuves > 0 ? Math.round((passees / epreuves) * 100) : 0,
    tauxEchecP: epreuves > 0 ? Math.round((echouees / epreuves) * 100) : 0,
    bonusMs,
    malusMs,
    jourFacile,
    jourDur,
    moiMoyenneRunMs: moiMoyenne,
    // « Plus rapide que X % des runs » : part des runs strictement plus lents
    // que votre moyenne, sur l'ensemble des runs enregistrés.
    moiPercentileP:
      moiMoyenne != null
        ? Math.round((tries.filter((t) => t > moiMoyenne).length / tries.length) * 100)
        : null,
    distribution: distribue(tries),
    serieRuns: serie(parJour),
    serieParJeu: Object.fromEntries([...jeux.entries()].map(([id, a]) => [id, serie(a.parJour)])),
    jeux: [...jeux.entries()]
      .map(([id, a]) => {
        const eligibles = [...a.parJoueur.entries()].filter(
          ([, p]) => p.parties >= MIN_PARTIES_SPECIALISTE,
        );
        const specialiste =
          eligibles.length > 0
            ? eligibles
                .map(([p, v]) => ({ pseudo: p, ms: v.total / v.parties, parties: v.parties }))
                .reduce((x, y) => (y.ms < x.ms ? y : x))
            : null;
        const moi = a.parJoueur.get(pseudo);
        return {
          id,
          nom: a.nom,
          parties: a.parties,
          reussies: a.reussies,
          passees: a.passees,
          echouees: a.echouees,
          mesures: a.mesures,
          moyenneMs: a.mesures > 0 ? a.totalMs / a.mesures : null,
          meilleur: a.meilleur,
          pire: a.pire,
          ajustMoyenMs: a.parties > 0 ? a.ajustTotalMs / a.parties : 0,
          specialiste,
          moi: {
            parties: moi?.parties ?? 0,
            moyenneMs: moi ? moi.total / moi.parties : null,
            meilleurMs: a.moiMeilleurMs,
          },
        } satisfies StatsJeuGlobal;
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  };
}

/**
 * Tous les runs joués en direct, avec leurs splits, paginés (une page de
 * PostgREST plafonne à 1000 lignes). `null` si le backend est absent/injoignable.
 */
async function fetchTousLesRuns(defi: boolean): Promise<RunGlobal[] | null> {
  if (!supabase) return null;
  const TAILLE = 1000;
  const PAGES_MAX = 20; // 20 000 runs : au-delà, l'agrégat côté client n'a plus de sens
  const out: RunGlobal[] = [];
  for (let page = 0; page < PAGES_MAX; page++) {
    const { data, error } = await supabase
      .from('runs')
      .select('pseudo, date, total_ms, flawless, lines')
      .eq('en_direct', true)
      .eq('defi', defi)
      // ordre total et stable : sinon la pagination saute ou duplique des lignes
      .order('date', { ascending: true })
      .order('pseudo', { ascending: true })
      .range(page * TAILLE, page * TAILLE + TAILLE - 1);
    if (error || !data) return null;
    for (const r of data as { pseudo: string; date: string; total_ms: number; flawless: boolean; lines: GameLine[] }[])
      out.push({
        pseudo: r.pseudo,
        date: r.date,
        totalMs: r.total_ms,
        flawless: r.flawless,
        lines: r.lines ?? [],
      });
    if (data.length < TAILLE) break;
  }
  return out;
}

/**
 * Stats de la communauté (ou, sans backend, des seuls runs de ce navigateur).
 * `pseudo` sert à isoler la colonne « vous » des tableaux par épreuve.
 */
export async function statsGlobales(pseudo: string, defi = false): Promise<StatsGlobales> {
  const rows = await fetchTousLesRuns(defi);
  if (rows) return calculeStatsGlobales(rows, pseudo, true);
  const locaux: RunGlobal[] = (defi ? loadDefis() : loadRuns())
    .filter(estEnDirect)
    .map((r) => ({
      pseudo,
      date: r.date,
      totalMs: r.totalMs,
      flawless: r.flawless,
      lines: r.lines,
    }));
  return calculeStatsGlobales(locaux, pseudo, false);
}
