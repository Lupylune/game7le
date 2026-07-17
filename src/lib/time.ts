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

/** Formate un ajustement en secondes signées : `−15 s` / `+90 s`. */
export function formatAdjust(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  return `${ms < 0 ? '−' : '+'}${s} s`;
}

/** Formate une durée en secondes décimales : « 22,7 s ». */
export function formatSec(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/** Formate une durée lisible : « 10 min 27 s ». */
export function formatLong(ms: number): string {
  const totalS = Math.round(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  if (m === 0) return `${s} s`;
  return `${m} min ${String(s).padStart(2, '0')} s`;
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
