import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shuffle, type RNG } from '../lib/rng';
import type { GameProps } from './types';

/**
 * Tempo — cinq durées à reproduire de mémoire (d'après le jeu « Time » de
 * dialed.gg). Une pulsation dure exactement la durée cible, sans aucun
 * décompte : il faut la ressentir, puis la rejouer en maintenant l'appui.
 * Le score d'une manche suit une gaussienne sur l'écart *relatif* (log-ratio) :
 * 200 ms de trop coûtent cher sur une durée d'une seconde, beaucoup moins sur six.
 */

const MANCHES = 5;
const PAUSE_MS = 700; // respiration avant que la pulsation ne démarre
const MIN_APPUI_MS = 200; // appui trop bref : on laisse retenter
const RESULTAT_MS = 1300; // verdict de la manche avant la suivante
const FIN_MS = 1500; // bilan avant de rendre la main au chrono
// Rétraction du cercle une fois la durée écoulée (doit valoir l'animation
// `tempo-sortie` de styles.css). L'expansion, elle, démarre pile au début de la
// durée cible et la rétraction pile à sa fin : la fenêtre perçue reste juste.
const SORTIE_MS = 280;

type Phase = 'attente' | 'pulsation' | 'pret' | 'appui' | 'resultat' | 'fin';

interface Manche {
  cible: number;
  tenu: number;
  points: number;
}

/** Le score est calculé au centième de seconde près, comme l'affichage. */
const arrondi = (ms: number) => Math.round(ms / 10) * 10;

/** 0 à 10 points : gaussienne sur |ln(tenu / cible)|, plus sévère au défi. */
export function points(cible: number, tenu: number, difficile = false): number {
  if (cible <= 0 || tenu <= 0) return 0;
  const k = difficile ? 16 : 12;
  const ecart = Math.abs(Math.log(arrondi(tenu) / arrondi(cible)));
  return Math.max(0, Math.min(10, 10 * Math.exp(-k * ecart * ecart)));
}

/**
 * Les cinq durées cibles. Au quotidien : uniformes entre 1 s et 3,5 s. Au défi
 * difficile : de 0,5 s à 6 s, tirées une par tranche (une courte, puis un
 * palier chacune) pour couvrir tout l'éventail, puis mélangées.
 */
export function durees(rng: RNG, difficile = false): number[] {
  const [min, max] = difficile ? [500, 6000] : [1000, 3500];
  if (!difficile) return Array.from({ length: MANCHES }, () => min + rng() * (max - min));
  const pas = (max - 1200) / (MANCHES - 1);
  const d = [min + rng() * (1200 - min)];
  for (let i = 0; i < MANCHES - 1; i++) d.push(1200 + (i + rng()) * pas);
  return shuffle(rng, d);
}

const fmt = (ms: number) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
const fmtPts = (p: number) => p.toFixed(1).replace('.', ',');

export default function Tempo({ rng, difficile, onDone }: GameProps) {
  // Tirées une fois pour toutes : mêmes durées pour tous les joueurs du jour
  const cibles = useMemo(() => durees(rng, difficile), [rng, difficile]);
  const [manche, setManche] = useState(0);
  const [phase, setPhase] = useState<Phase>('attente');
  const [faites, setFaites] = useState<Manche[]>([]);
  const [tenu, setTenu] = useState(0); // compteur vivant pendant l'appui
  const debutRef = useRef(0);
  const phaseRef = useRef<Phase>('attente');
  const doneRef = useRef(false);
  phaseRef.current = phase;

  // Au défi difficile, l'appui se fait à l'aveugle : aucun compteur pour se recaler
  const compteur = !difficile;

  // Déroulé d'une manche : courte pause, pulsation de la durée exacte, à vous
  useEffect(() => {
    if (manche >= MANCHES) return;
    setPhase('attente');
    const t1 = setTimeout(() => setPhase('pulsation'), PAUSE_MS);
    const t2 = setTimeout(() => setPhase('pret'), PAUSE_MS + cibles[manche]);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [manche, cibles]);

  const total = faites.reduce((s, m) => s + m.points, 0);

  const terminer = useCallback(
    (manches: Manche[]) => {
      if (doneRef.current) return;
      doneRef.current = true;
      const pct = (manches.reduce((s, m) => s + m.points, 0) / (MANCHES * 10)) * 100;
      // Neutre vers 60 % (~20 % d'erreur moyenne), jusqu'à −30 s si tout est juste
      const adjustMs = Math.round(45 - 0.75 * pct) * 1000;
      setPhase('fin');
      setTimeout(
        () =>
          onDone({
            adjustMs,
            detail: `précision ${pct.toFixed(0)} %`,
            status: adjustMs <= 0 ? 'success' : 'fail',
          }),
        FIN_MS,
      );
    },
    [onDone],
  );

  const presser = useCallback(() => {
    if (phaseRef.current !== 'pret') return;
    debutRef.current = performance.now();
    setTenu(0);
    setPhase('appui');
  }, []);

  const relacher = useCallback(() => {
    if (phaseRef.current !== 'appui') return;
    const ms = performance.now() - debutRef.current;
    if (ms < MIN_APPUI_MS) {
      setPhase('pret'); // simple clic : on ne compte pas
      return;
    }
    const cur = cibles[manche];
    const suite = [...faites, { cible: cur, tenu: ms, points: points(cur, ms, difficile) }];
    setFaites(suite);
    setPhase('resultat');
    setTimeout(() => {
      if (suite.length >= MANCHES) terminer(suite);
      else setManche((m) => m + 1);
    }, RESULTAT_MS);
  }, [cibles, manche, faites, difficile, terminer]);

  // Relâcher hors de la zone compte quand même ; la barre d'espace fait office d'appui
  useEffect(() => {
    const up = () => relacher();
    const keydown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      presser();
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      relacher();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [presser, relacher]);

  // Compteur vivant pendant l'appui (relu sur l'horloge, jamais incrémenté)
  useEffect(() => {
    if (phase !== 'appui' || !compteur) return;
    let raf = 0;
    const tick = () => {
      setTenu(performance.now() - debutRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, compteur]);

  const derniere = faites[faites.length - 1];
  const actif = phase === 'pulsation' || phase === 'appui';

  // Le cercle se rétracte après coup : la classe `sortie` survit à la fin de la
  // pulsation le temps de l'animation (sa couleur avec, pour ne pas virer au
  // bleu quand c'est l'appui du joueur qui s'achève).
  const [sortie, setSortie] = useState<'cible' | 'mien' | null>(null);
  const actifRef = useRef<'cible' | 'mien' | null>(null);
  useEffect(() => {
    if (actif) {
      actifRef.current = phase === 'appui' ? 'mien' : 'cible';
      setSortie(null);
      return;
    }
    if (!actifRef.current) return;
    setSortie(actifRef.current);
    actifRef.current = null;
    const t = setTimeout(() => setSortie(null), SORTIE_MS);
    return () => clearTimeout(t);
  }, [actif, phase]);

  return (
    <div className="game-area">
      <p className="tempo-manche">
        Manche {Math.min(manche + 1, MANCHES)} / {MANCHES} · {fmtPts(total)} / {MANCHES * 10} pts
      </p>
      <div
        className={`tempo-scene${actif ? ' actif' : ''}${sortie ? ' sortie' : ''}${
          phase === 'appui' || sortie === 'mien' ? ' mien' : ''
        }`}
        onPointerDown={(e) => {
          e.preventDefault();
          presser();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Maintenez pour reproduire la durée"
      >
        <span className="tempo-pulse" aria-hidden />
        <span className="tempo-texte">
          {phase === 'pulsation' && 'mémorisez…'}
          {phase === 'pret' && (
            <>
              à vous
              <span className="tempo-hint">maintenez</span>
            </>
          )}
          {phase === 'appui' && (compteur ? fmt(tenu) : 'appui…')}
          {phase === 'resultat' && derniere && (
            <>
              {fmtPts(derniere.points)} / 10
              <span className="tempo-hint">
                cible {fmt(derniere.cible)} · vous {fmt(derniere.tenu)}
              </span>
            </>
          )}
          {phase === 'fin' && (
            <>
              {fmtPts(total)} / {MANCHES * 10}
              <span className="tempo-hint">
                précision {((total / (MANCHES * 10)) * 100).toFixed(0)} %
              </span>
            </>
          )}
        </span>
      </div>
      <div className="tempo-jauges">
        {cibles.map((_, i) => {
          const m = faites[i];
          return (
            <span
              key={i}
              className={`tempo-jauge${m ? ' faite' : ''}${i === manche && !m ? ' encours' : ''}`}
              style={m ? { opacity: 0.4 + (m.points / 10) * 0.6 } : undefined}
            >
              {m ? fmtPts(m.points) : i + 1}
            </span>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        {phase === 'attente' || phase === 'pulsation'
          ? 'Ressentez la durée de la pulsation — aucun décompte.'
          : phase === 'pret' || phase === 'appui'
            ? `Maintenez le clic (ou la barre d’espace) exactement aussi longtemps${
                compteur ? '.' : ', à l’aveugle.'
              }`
            : 'Plus votre durée est proche de la cible, plus la manche rapporte.'}
      </p>
    </div>
  );
}
