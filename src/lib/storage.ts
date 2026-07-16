export interface GameLine {
  id: string;
  nom: string;
  adjustMs: number;
  detail: string;
  status: 'success' | 'fail' | 'skip';
}

export interface RunRecord {
  date: string; // YYYY-MM-DD
  totalMs: number;
  rawMs: number;
  flawless: boolean;
  lines: GameLine[];
  finishedAt: number;
}

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  pseudo: string;
}

const K_RUNS = 'game7le:runs';
const K_SETTINGS = 'game7le:settings';

export function loadRuns(): Record<string, RunRecord> {
  try {
    return JSON.parse(localStorage.getItem(K_RUNS) || '{}');
  } catch {
    return {};
  }
}

export function saveRun(run: RunRecord): void {
  const runs = loadRuns();
  // On garde le meilleur temps si le jour a déjà été couru (via les archives).
  const prev = runs[run.date];
  if (!prev || run.totalMs < prev.totalMs) {
    runs[run.date] = run;
    localStorage.setItem(K_RUNS, JSON.stringify(runs));
  }
}

export function loadSettings(): Settings {
  let s: Partial<Settings> = {};
  try {
    s = JSON.parse(localStorage.getItem(K_SETTINGS) || '{}');
  } catch {
    /* défauts */
  }
  return { theme: s.theme ?? 'dark', pseudo: s.pseudo ?? 'Vous' };
}

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
}

export function resetAll(): void {
  localStorage.removeItem(K_RUNS);
  localStorage.removeItem(K_SETTINGS);
  localStorage.removeItem('game7le:theme');
}
