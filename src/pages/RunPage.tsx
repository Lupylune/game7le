import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { jeuxDefiSemaine, jeuxDuJour, JEUX_PAR_JOUR } from '../games';
import type { GameResult } from '../games/types';
import { lundiStr, seededRng, todayStr } from '../lib/rng';
import { formatAdjust, formatDateFr, formatMs } from '../lib/time';
import {
  aDefiEnDirect,
  aRunEnDirect,
  loadSettings,
  saveDefi,
  saveRun,
  type GameLine,
} from '../lib/storage';
import { syncRun } from '../lib/sync';
import GameIcon, { SymEtincelle } from '../components/GameIcon';
import { prewarmAtlas } from '../games/Atlas';
import Solutions from '../components/Solutions';
import SplitsRun from '../components/SplitsRun';

const FLAWLESS_MS = 5 * 60 * 1000;
// Épreuves corsées : le sans-faute du défi difficile laisse 8 minutes
const FLAWLESS_MS_DEFI = 8 * 60 * 1000;
// Défi difficile : passer une épreuve coûte 3 min (le quotidien garde le
// barème propre à chaque jeu, +90 s en général).
const PENALITE_SKIP_DEFI_S = 180;
const COUNTDOWN_S = 3;
const RECAP_MS = 2400; // durée de l'écran récap avant le compte à rebours

interface Toast {
  id: number;
  ms: number;
  label: string;
}

type Verdict = 'success' | 'skip' | 'fail';

/**
 * Transition entre épreuves, en deux temps :
 * `recap` — verdict de l'épreuve précédente (temps passé, gagné/perdu), puis
 * `countdown` — compte à rebours avant l'épreuve suivante.
 * Avant la toute première épreuve (verdict null) on passe directement au countdown.
 */
interface Transition {
  verdict: Verdict | null; // null avant la toute première épreuve
  line: GameLine | null;
  dureeMs: number; // temps passé sur l'épreuve précédente
  phase: 'recap' | 'countdown';
  count: number;
  final: boolean; // dernière épreuve : le récap débouche sur les résultats
}

export const VERDICTS: Record<Verdict, { label: string; color: string }> = {
  success: { label: 'Victoire !', color: 'var(--success)' },
  skip: { label: 'Passé', color: 'var(--warning)' },
  fail: { label: 'Défaite', color: 'var(--error)' },
};

function IconeAvance({ barre = false }: { barre?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden className="sym">
      <path d="M4 5.5 L11.5 12 L4 18.5 Z M12.5 5.5 L20 12 L12.5 18.5 Z" fill="currentColor" />
      {barre && (
        <path d="M3.5 20.5 L20.5 3.5" stroke="var(--error)" strokeWidth="2.4" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** Contrôle de passe : anneau de progression puis bouton, à la DA du site. */
function SkipControl({
  skip,
  elapsedS,
  paused,
  onSkip,
}: {
  skip: { apresS: number; penaliteS: number } | null;
  elapsedS: number;
  paused: boolean;
  onSkip: () => void;
}) {
  if (paused) {
    return (
      <span className="skip-pill">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden className="sym">
          <path d="M8 5 V19 M16 5 V19" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
        chrono en pause
      </span>
    );
  }
  if (!skip) {
    return (
      <span className="skip-pill">
        <IconeAvance barre />
        sans passe
      </span>
    );
  }
  const frac = Math.min(1, elapsedS / skip.apresS);
  if (frac >= 1) {
    return (
      <button className="skip-pill skip-ready" onClick={onSkip}>
        <IconeAvance />
        Passer
        <span className="skip-malus">+{skip.penaliteS} s</span>
      </button>
    );
  }
  const r = 7;
  const circ = 2 * Math.PI * r;
  return (
    <span className="skip-pill">
      <svg viewBox="0 0 18 18" width="15" height="15" aria-hidden className="sym">
        <circle cx="9" cy="9" r={r} fill="none" stroke="var(--border)" strokeWidth="2.6" />
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray={`${circ * frac} ${circ}`}
          transform="rotate(-90 9 9)"
        />
      </svg>
      <span className="skip-s">{Math.max(0, Math.ceil(skip.apresS - elapsedS))} s</span>
    </span>
  );
}

export default function RunPage({ defi = false }: { defi?: boolean }) {
  const params = useParams();
  // Défi hebdomadaire difficile : identifié par le lundi de la semaine en cours
  const date = defi ? lundiStr() : params.date ?? todayStr();
  const isToday = date === todayStr();

  // Les 7 épreuves, tirées au sort parmi les 13 du jour ou les 10 du défi
  // difficile (identiques pour tous)
  const jeux = useMemo(() => (defi ? jeuxDefiSemaine(date) : jeuxDuJour(date)), [date, defi]);

  const [phase, setPhase] = useState<'intro' | 'playing' | 'results'>('intro');
  const [index, setIndex] = useState(0);
  const [lines, setLines] = useState<GameLine[]>([]);
  const [adjustMs, setAdjustMs] = useState(0);
  const [rawMs, setRawMs] = useState(0);
  const [gameElapsedS, setGameElapsedS] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [trans, setTrans] = useState<Transition | null>(null);
  const [voirSolutions, setVoirSolutions] = useState(false);
  // Progression (0→1) du versement des ajustements dans le total, à l'écran final
  const [animP, setAnimP] = useState(0);
  const startRef = useRef(0);
  const gameStartRef = useRef(0);
  const adjustRef = useRef(0);
  // Le chrono est en pause pendant les transitions : temps de pause cumulé
  const pausedRef = useRef(0);
  const pauseStartRef = useRef(0);
  const toastId = useRef(0);
  const savedRef = useRef(false);

  const jeu = jeux[index];
  // Barème de passe effectif : 3 min fixes au défi difficile, sinon celui du jeu.
  const skipEff = useMemo(
    () => (jeu.skip ? { ...jeu.skip, penaliteS: defi ? PENALITE_SKIP_DEFI_S : jeu.skip.penaliteS } : null),
    [jeu, defi],
  );

  // Chrono (gelé pendant une transition)
  useEffect(() => {
    if (phase !== 'playing') return;
    const t = setInterval(() => {
      const now = performance.now();
      const paused = pausedRef.current + (trans ? now - pauseStartRef.current : 0);
      setRawMs(now - startRef.current - paused);
      if (!trans) setGameElapsedS((now - gameStartRef.current) / 1000);
    }, 100);
    return () => clearInterval(t);
  }, [phase, index, trans]);

  // Transition : d'abord le récap, puis le compte à rebours
  useEffect(() => {
    if (!trans) return;
    if (trans.phase === 'recap') {
      const t = setTimeout(() => {
        if (trans.final) {
          // Dernière épreuve : après le verdict, place aux résultats
          setTrans(null);
          setPhase('results');
        } else {
          setTrans({ ...trans, phase: 'countdown' });
        }
      }, RECAP_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (trans.count > 1) {
        setTrans({ ...trans, count: trans.count - 1 });
      } else {
        pausedRef.current += performance.now() - pauseStartRef.current;
        gameStartRef.current = performance.now();
        setGameElapsedS(0);
        setTrans(null);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [trans]);

  const beginTransition = (
    verdict: Verdict | null,
    line: GameLine | null,
    dureeMs: number,
    final = false,
  ) => {
    pauseStartRef.current = performance.now();
    // Pas de récap avant la première épreuve (aucun verdict à afficher)
    setTrans({ verdict, line, dureeMs, phase: verdict ? 'recap' : 'countdown', count: COUNTDOWN_S, final });
  };

  const pushToast = useCallback((ms: number, label: string) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts, { id, ms, label }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 1400);
  }, []);

  const addAdjust = useCallback(
    (ms: number, label: string) => {
      adjustRef.current += ms;
      setAdjustMs(adjustRef.current);
      pushToast(ms, label);
    },
    [pushToast],
  );

  const start = () => {
    startRef.current = performance.now();
    gameStartRef.current = performance.now();
    setPhase('playing');
    beginTransition(null, null, 0); // « Prêt ? » avant la première épreuve
  };

  const nextGame = useCallback(
    (line: GameLine) => {
      const now = performance.now();
      const dureeMs = now - gameStartRef.current;
      const ligne = { ...line, ms: Math.round(dureeMs) };
      setRawMs(now - startRef.current - pausedRef.current);
      const finished = lines.length + 1 === jeux.length;
      setLines((prev) => [...prev, ligne]);
      setIndex((i) => Math.min(i + 1, jeux.length - 1));
      // Même récap pour la dernière épreuve : les résultats suivent au lieu du décompte
      beginTransition(ligne.status, ligne, dureeMs, finished);
    },
    [jeux, lines],
  );

  const onDone = useCallback(
    (r: GameResult) => {
      if (r.adjustMs !== 0) addAdjust(r.adjustMs, r.adjustMs < 0 ? 'Bonus !' : 'Pénalité');
      nextGame({ id: jeu.id, nom: jeu.nom, adjustMs: r.adjustMs, detail: r.detail, status: r.status });
    },
    [jeu, addAdjust, nextGame],
  );

  const onSkip = useCallback(() => {
    if (!skipEff) return;
    const pen = skipEff.penaliteS * 1000;
    addAdjust(pen, 'Jeu passé');
    nextGame({ id: jeu.id, nom: jeu.nom, adjustMs: pen, detail: 'passé', status: 'skip' });
  }, [skipEff, jeu, addAdjust, nextGame]);

  // RNG seedé par jour (ou semaine du défi) + jeu : identique pour tous les joueurs
  const rng = useMemo(
    () => seededRng(`game7le:${defi ? 'defi:' : ''}${date}:${jeu.id}`),
    [date, jeu.id, defi],
  );

  // Atlas dépend d'un appel réseau (imagerie Mapillary) : dès que le run
  // démarre, si Atlas figure dans le tirage on le préchauffe tout de suite —
  // ainsi l'image a tout le temps du run pour arriver, quelle que soit sa
  // position, et elle est prête au montage de l'épreuve.
  useEffect(() => {
    if (phase === 'playing' && jeux.some((j) => j.id === 'atlas')) prewarmAtlas(date, defi);
  }, [phase, jeux, date, defi]);

  const totalMs = Math.max(0, rawMs + adjustMs);

  // Résultats
  const flawless =
    lines.length === jeux.length &&
    lines.every((l) => l.status === 'success' && l.adjustMs <= 0) &&
    totalMs < (defi ? FLAWLESS_MS_DEFI : FLAWLESS_MS);

  useEffect(() => {
    if (phase === 'results' && !savedRef.current && lines.length === jeux.length) {
      savedRef.current = true;
      const run = {
        date,
        totalMs,
        rawMs,
        flawless,
        lines,
        finishedAt: Date.now(),
        // En direct = première tentative du jour même (ou de la semaine pour le
        // défi) ; tout rejeu est un run d'archive et ne touche pas au temps officiel.
        enDirect: defi
          ? lundiStr() === date && !aDefiEnDirect(date)
          : date === todayStr() && !aRunEnDirect(date),
      };
      if (defi) saveDefi(run);
      else saveRun(run);
      syncRun(loadSettings().pseudo, run, defi);
    }
  }, [phase, lines, jeux, date, totalMs, rawMs, flawless, defi]);

  // À la fin, on verse les bonus/malus accumulés dans le total : la réserve se
  // vide (→ 0) pendant que le total glisse de « temps brut » vers « temps final ».
  useEffect(() => {
    if (phase !== 'results') return;
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (adjustMs === 0 || reduit) {
      setAnimP(1);
      return;
    }
    setAnimP(0);
    const DELAI = 650; // pause avant de démarrer (on voit d'abord temps brut + réserve pleine)
    const DUREE = 1700;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const e = now - t0 - DELAI;
      const p = e <= 0 ? 0 : Math.min(1, e / DUREE);
      setAnimP(1 - Math.pow(1 - p, 3)); // ease-out cubique
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, adjustMs]);

  if (phase === 'intro') {
    return (
      <div className="interstitial">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h2)' }}>
          {defi ? 'Le défi difficile de la semaine' : isToday ? 'Le Game7le du jour' : 'Game7le des archives'}
        </h2>
        <p className="muted mt-4">
          {defi ? `Semaine du ${formatDateFr(date)}` : formatDateFr(date)}
        </p>
        <p className="mt-4" style={{ maxWidth: 420, margin: 'var(--sp-4) auto 0' }}>
          {defi
            ? `${JEUX_PAR_JOUR} épreuves corsées tirées au sort de la semaine, enchaînées sous un seul chrono. Les bonus font gagner du temps, les pénalités en ajoutent. Prêt·e ?`
            : `${JEUX_PAR_JOUR} épreuves tirées au sort du jour, enchaînées sous un seul chrono. Les bonus font gagner du temps, les pénalités en ajoutent. Prêt·e ?`}
        </p>
        <button className="btn btn-primary btn-lg mt-6" onClick={start}>
          Lancer le chrono
        </button>
      </div>
    );
  }

  if (phase === 'results') {
    const settings = loadSettings();
    const partage = `Game7le ${defi ? `défi difficile (semaine du ${date})` : date} — ${formatMs(totalMs)}${flawless ? ' ✨ SANS-FAUTE ✨' : ''}\n${lines
      .map((l) => (l.status === 'success' ? '🟩' : l.status === 'skip' ? '🟨' : '🟥'))
      .join('')}`;
    // Valeurs animées : le total glisse de rawMs → totalMs, la réserve se vide → 0
    const totalAffiche = Math.max(0, rawMs + adjustMs * animP);
    const reserve = adjustMs * (1 - animP);
    const reserveVidee = Math.abs(reserve) < 500; // formatAdjust arrondit à la seconde
    return (
      <div className="results">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h2)' }}>Terminé !</h1>
        <div className="total">{formatMs(totalAffiche)}</div>
        {adjustMs !== 0 && !reserveVidee && (
          <div className={`total-reserve ${reserve < 0 ? 'bonus' : 'malus'}`} aria-hidden>
            {formatAdjust(reserve)}
          </div>
        )}
        {flawless && (
          <p className="flawless">
            <SymEtincelle size={18} /> SANS-FAUTE <SymEtincelle size={18} />
          </p>
        )}
        <p className="muted">
          {settings.pseudo} · temps brut {formatMs(rawMs)}
          {adjustMs !== 0 && <> · {formatAdjust(adjustMs)}</>}
        </p>
        <SplitsRun lines={lines} />
        <div className="game-actions">
          <button className="btn btn-primary" onClick={() => navigator.clipboard?.writeText(partage)}>
            Copier le résultat
          </button>
          <button className="btn" onClick={() => setVoirSolutions((v) => !v)}>
            {voirSolutions ? 'Masquer les solutions' : 'Voir les solutions'}
          </button>
          <Link className="btn" to={defi ? '/classement?onglet=defi' : '/classement'}>
            Voir le classement
          </Link>
          <Link className="btn" to="/">
            Accueil
          </Link>
        </div>
        {voirSolutions && <Solutions date={date} ids={lines.map((l) => l.id)} defi={defi} />}
      </div>
    );
  }

  return (
    <div>
      {toasts.map((t) => (
        <div key={t.id} className="toast-adjust" style={{ color: t.ms < 0 ? 'var(--success)' : 'var(--error)' }}>
          {formatAdjust(t.ms)} · {t.label}
        </div>
      ))}
      <div className="run-header">
        <div>
          <div className="game-name">
            <GameIcon id={jeu.id} /> {jeu.nom}
          </div>
          <div className="step">
            Épreuve {index + 1} / {jeux.length}
          </div>
        </div>
        <div className="timer">
          {formatMs(rawMs)}
          {adjustMs !== 0 && (
            <span className={`adj ${adjustMs < 0 ? 'bonus' : 'malus'}`}>{formatAdjust(adjustMs)}</span>
          )}
        </div>
        <SkipControl skip={skipEff} elapsedS={gameElapsedS} paused={!!trans} onSkip={onSkip} />
      </div>
      {trans && trans.phase === 'recap' && trans.verdict && trans.line ? (
        <div className="transition recap">
          <p className="verdict" style={{ color: VERDICTS[trans.verdict].color }}>
            {VERDICTS[trans.verdict].label}
          </p>
          <p className="recap-jeu">
            <GameIcon id={trans.line.id} /> {trans.line.nom}
          </p>
          {trans.line.detail && <p className="muted">{trans.line.detail}</p>}
          <div className="recap-stats">
            <div className="recap-stat">
              <span className="recap-label">Temps sur l'épreuve</span>
              <span className="recap-val">{formatMs(trans.dureeMs)}</span>
            </div>
            <div className="recap-stat">
              <span className="recap-label">
                {trans.line.adjustMs < 0
                  ? 'Temps gagné'
                  : trans.line.adjustMs > 0
                    ? 'Temps perdu'
                    : 'Ajustement'}
              </span>
              <span
                className={`recap-val ${
                  trans.line.adjustMs < 0 ? 'bonus' : trans.line.adjustMs > 0 ? 'malus' : ''
                }`}
              >
                {trans.line.adjustMs === 0 ? '—' : formatAdjust(trans.line.adjustMs)}
              </span>
            </div>
          </div>
        </div>
      ) : trans ? (
        <div className="transition">
          {!trans.verdict && <p className="verdict">Prêt·e ?</p>}
          <p className="next-up">
            Épreuve {index + 1} / {jeux.length} : <GameIcon id={jeu.id} /> <strong>{jeu.nom}</strong>
          </p>
          <div className="countdown" key={trans.count}>
            {trans.count}
          </div>
        </div>
      ) : (
        <>
          <p className="game-rules">{(defi && jeu.reglesDifficile) || jeu.regles}</p>
          <jeu.Component
            key={`${date}-${jeu.id}`}
            rng={rng}
            difficile={defi}
            onAdjust={addAdjust}
            onDone={onDone}
          />
        </>
      )}
    </div>
  );
}
