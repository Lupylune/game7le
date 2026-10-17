import { useEffect, useState } from 'react';
import { loadEnregistrement } from './enregistrement';
import { fetchPseudosRevoyables } from './sync';

/**
 * Pseudos dont le run en direct d'un jour (ou d'un lundi de défi) peut être
 * revu : ceux qui ont un enregistrement côté serveur, plus soi-même si
 * l'enregistrement est gardé en local (envoi échoué, backend absent). Sert à
 * n'afficher l'icône « revoir » du classement que là où elle mène quelque part.
 * `date` à `null` : classement sans relecture (périodes agrégées), ensemble vide.
 */
export function useRevoyables(date: string | null, defi: boolean, pseudo: string): Set<string> {
  const [serveur, setServeur] = useState<Set<string>>(new Set());
  useEffect(() => {
    let vivant = true;
    setServeur(new Set());
    if (!date) return;
    fetchPseudosRevoyables(date, defi).then((s) => vivant && s && setServeur(s));
    return () => {
      vivant = false;
    };
  }, [date, defi]);
  if (!date || !pseudo || serveur.has(pseudo) || !loadEnregistrement(date, defi)) return serveur;
  return new Set([...serveur, pseudo]);
}

/** Lien vers la relecture du run d'un pseudo. */
export function lienRevoir(date: string, defi: boolean, pseudo: string): string {
  return `/revoir/${date}?pseudo=${encodeURIComponent(pseudo)}${defi ? '&defi=1' : ''}`;
}
