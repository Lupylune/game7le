import { todayStr } from './rng';

export interface GameLine {
  id: string;
  nom: string;
  adjustMs: number;
  detail: string;
  status: 'success' | 'fail' | 'skip';
  /** Durée brute passée sur l'épreuve (hors transitions). Absente des anciens runs. */
  ms?: number;
}

export interface RunRecord {
  date: string; // YYYY-MM-DD
  totalMs: number;
  rawMs: number;
  flawless: boolean;
  lines: GameLine[];
  finishedAt: number;
  /** Joué le jour même (`false` : rejoué via les archives). Absent des anciens
   *  runs — reclassé au chargement d'après `finishedAt`. */
  enDirect?: boolean;
}

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  pseudo: string;
  /** Badge choisi comme picto affiché à gauche du pseudo. Token `id` ou
   *  `id:niveau` (voir `lib/badges`). Vide = aucun. */
  badge: string;
}

const K_RUNS = 'game7le:runs';
const K_DEFIS = 'game7le:defis';
const K_SETTINGS = 'game7le:settings';

/** Clé de stockage : une entrée par jour ET par type (direct / archive), pour
 *  qu'un meilleur temps rejoué en archive n'écrase jamais le run du jour même. */
function cleRun(run: RunRecord): string {
  return run.enDirect ? run.date : `${run.date}#archive`;
}

function chargeRuns(): Record<string, RunRecord> {
  let brut: Record<string, RunRecord> = {};
  try {
    brut = JSON.parse(localStorage.getItem(K_RUNS) || '{}');
  } catch {
    return {};
  }
  // Migration des anciens enregistrements (une entrée par jour, sans enDirect) :
  // reclassement d'après finishedAt, comme l'ancienne heuristique des stats.
  let migre = false;
  const runs: Record<string, RunRecord> = {};
  for (const [k, r] of Object.entries(brut)) {
    if (r.enDirect == null) {
      r.enDirect = r.finishedAt == null || todayStr(new Date(r.finishedAt)) === r.date;
      migre = true;
    }
    const key = cleRun(r);
    if (key !== k) migre = true;
    if (!runs[key] || r.totalMs < runs[key].totalMs) runs[key] = r;
  }
  if (migre) localStorage.setItem(K_RUNS, JSON.stringify(runs));
  return runs;
}

export function loadRuns(): RunRecord[] {
  return Object.values(chargeRuns());
}

/** Y a-t-il déjà un run joué en direct pour cette date ? (Seule la première
 *  tentative du jour compte en direct — les rejeux partent en archive.) */
export function aRunEnDirect(date: string): boolean {
  return chargeRuns()[date] != null;
}

export function saveRun(run: RunRecord): void {
  const runs = chargeRuns();
  // On garde le meilleur temps par jour et par type (direct / archive).
  const key = cleRun(run);
  const prev = runs[key];
  if (!prev || run.totalMs < prev.totalMs) {
    runs[key] = run;
    localStorage.setItem(K_RUNS, JSON.stringify(runs));
  }
}

/* ===== Défi hebdomadaire difficile — stockage séparé des runs quotidiens.
   `date` est le lundi de la semaine ; mêmes règles direct/archive. ===== */

function chargeDefis(): Record<string, RunRecord> {
  try {
    return JSON.parse(localStorage.getItem(K_DEFIS) || '{}');
  } catch {
    return {};
  }
}

export function loadDefis(): RunRecord[] {
  return Object.values(chargeDefis());
}

/** Y a-t-il déjà un défi joué en direct pour cette semaine (lundi) ? */
export function aDefiEnDirect(lundi: string): boolean {
  return chargeDefis()[lundi] != null;
}

export function saveDefi(run: RunRecord): void {
  const defis = chargeDefis();
  const key = cleRun(run);
  const prev = defis[key];
  if (!prev || run.totalMs < prev.totalMs) {
    defis[key] = run;
    localStorage.setItem(K_DEFIS, JSON.stringify(defis));
  }
}

export function loadSettings(): Settings {
  let s: Partial<Settings> = {};
  try {
    s = JSON.parse(localStorage.getItem(K_SETTINGS) || '{}');
  } catch {
    /* défauts */
  }
  return { theme: s.theme ?? 'dark', pseudo: s.pseudo ?? 'Vous', badge: s.badge ?? '' };
}

/** Émis à chaque enregistrement des réglages, pour que les pages déjà montées
 *  (ex. l'accueil derrière la popup pseudo) se mettent à jour sans rechargement. */
export const EV_SETTINGS = 'game7le:settings-change';

export function saveSettings(s: Settings): void {
  localStorage.setItem(K_SETTINGS, JSON.stringify(s));
  localStorage.setItem('game7le:theme', s.theme);
  const base =
    s.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : s.theme;
  document.documentElement.dataset.theme = base;
  window.dispatchEvent(new Event(EV_SETTINGS));
}

export function resetAll(): void {
  localStorage.removeItem(K_RUNS);
  localStorage.removeItem(K_DEFIS);
  localStorage.removeItem(K_SETTINGS);
  localStorage.removeItem('game7le:theme');
}
