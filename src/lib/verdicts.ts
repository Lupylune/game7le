export type Verdict = 'success' | 'skip' | 'fail';

export const VERDICTS: Record<Verdict, { label: string; color: string }> = {
  success: { label: 'Victoire !', color: 'var(--success)' },
  skip: { label: 'Passé', color: 'var(--warning)' },
  fail: { label: 'Défaite', color: 'var(--error)' },
};
