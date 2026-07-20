import { useSyncExternalStore } from 'react';
import { EV_SETTINGS, loadSettings } from './storage';

function abonne(cb: () => void) {
  window.addEventListener(EV_SETTINGS, cb);
  return () => window.removeEventListener(EV_SETTINGS, cb);
}

/**
 * Pseudo courant, réactif : se met à jour dès que les réglages sont
 * enregistrés (popup de première visite, page Paramètres), sans rechargement.
 * À préférer à `loadSettings().pseudo` dans les composants.
 */
export function usePseudo(): string {
  return useSyncExternalStore(abonne, () => loadSettings().pseudo);
}

/** Badge épinglé courant (token), réactif comme `usePseudo`. */
export function useBadgeChoisi(): string {
  return useSyncExternalStore(abonne, () => loadSettings().badge);
}
