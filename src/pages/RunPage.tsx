import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { jeuxDuJour, JEUX_PAR_JOUR } from '../games';
import type { GameResult } from '../games/types';
import { seededRng, todayStr } from '../lib/rng';
import { formatAdjust, formatDateFr, formatMs } from '../lib/time';
import { loadSettings, saveRun, type GameLine } from '../lib/storage';
import GameIcon from '../components/GameIcon';
import Solutions from '../components/Solutions';

const FLAWLESS_MS = 5 * 60 * 1000;
const COUNTDOWN_S = 3;

interface Toast {
  id: number;
  ms: number;
  label: string;
}

type Verdict = 'success' | 'skip' | 'fail';

/** Transition de 3 s avant chaque épreuve : verdict de la précédente + compte à rebours. */
interface Transition {
  verdict: Verdict | null; // null avant la toute première épreuve
  line: GameLine | null;
  count: number;
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
      passe dans <span className="skip-s">{Math.max(0, Math.ceil(skip.apresS - elapsedS))} s</span>
    </span>
  );
}

export default function RunPage() {
  const params = useParams();
  const date = params.date ?? todayStr();
  const isToday = date === todayStr();

  // Les 7 épreuves du jour, tirées au sort parmi les 13 (identiques pour tous)
  const jeux = useMemo(() => jeuxDuJour(date), [date]);

  const [phase, setPhase] = useState<'intro' | 'playing' | 'results'>('intro');
  const [index, setIndex] = useState(0);
  const [lines, setLines] = useState<GameLine[]>([]);
  const [adjustMs, setAdjustMs] = useState(0);
  const [rawMs, setRawMs] = useState(0);
  const [gameElapsedS, setGameElapsedS] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [trans, setTrans] = useState<Transition | null>(null);
  const [voirSolutions, setVoirSolutions] = useState(false);
  const startRef = useRef(0);
  const gameStartRef = useRef(0);
  const adjustRef = useRef(0);
  // Le chrono est en pause pendant les transitions : temps de pause cumulé
  const pausedRef = useRef(0);
  const pauseStartRef = useRef(0);
  const toastId = useRef(0);
  const savedRef = useRef(false);

  const jeu = jeux[index];

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

  // Compte à rebours de transition
  useEffect(() => {
    if (!trans) return;
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

  const beginTransition = (verdict: Verdict | null, line: GameLine | null) => {
    pauseStartRef.current = performance.now();
    setTrans({ verdict, line, count: COUNTDOWN_S });
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
    beginTransition(null, null); // « Prêt ? » avant la première épreuve
  };

  const nextGame = useCallback(
    (line: GameLine) => {
      setRawMs(performance.now() - startRef.current - pausedRef.current);
      let finished = false;
      setLines((prev) => {
        const nl = [...prev, line];
        if (nl.length === jeux.length) {
          finished = true;
          setPhase('results');
        }
        return nl;
      });
      setIndex((i) => Math.min(i + 1, jeux.length - 1));
      if (!finished) beginTransition(line.status, line);
    },
    [jeux],
  );

  const onDone = useCallback(
    (r: GameResult) => {
      if (r.adjustMs !== 0) addAdjust(r.adjustMs, r.adjustMs < 0 ? 'Bonus !' : 'Pénalité');
      nextGame({ id: jeu.id, nom: jeu.nom, adjustMs: r.adjustMs, detail: r.detail, status: r.status });
    },
    [jeu, addAdjust, nextGame],
  );

  const onSkip = useCallback(() => {
    if (!jeu.skip) return;
    const pen = jeu.skip.penaliteS * 1000;
    addAdjust(pen, 'Jeu passé');
    nextGame({ id: jeu.id, nom: jeu.nom, adjustMs: pen, detail: 'passé', status: 'skip' });
  }, [jeu, addAdjust, nextGame]);

  // RNG seedé par jour + jeu : identique pour tous les joueurs d'un même jour
  const rng = useMemo(() => seededRng(`game7le:${date}:${jeu.id}`), [date, jeu.id]);

  const totalMs = Math.max(0, rawMs + adjustMs);

  // Résultats
  const flawless =
    lines.length === jeux.length &&
    lines.every((l) => l.status === 'success' && l.adjustMs <= 0) &&
    totalMs < FLAWLESS_MS;

  useEffect(() => {
    if (phase === 'results' && !savedRef.current && lines.length === jeux.length) {
      savedRef.current = true;
      saveRun({ date, totalMs, rawMs, flawless, lines, finishedAt: Date.now() });
    }
  }, [phase, lines, jeux, date, totalMs, rawMs, flawless]);

  if (phase === 'intro') {
    return (
      <div className="interstitial">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h2)' }}>
          {isToday ? 'Le Game7le du jour' : 'Game7le des archives'}
        </h2>
        <p className="muted mt-4">{formatDateFr(date)}</p>
        <p className="mt-4" style={{ maxWidth: 420, margin: 'var(--sp-4) auto 0' }}>
          {JEUX_PAR_JOUR} épreuves tirées au sort du jour, enchaînées sous un seul chrono. Les
          bonus font gagner du temps, les pénalités en ajoutent. Prêt·e ?
        </p>
        <button className="btn btn-primary btn-lg mt-6" onClick={start}>
          Lancer le chrono
        </button>
      </div>
    );
  }

  if (phase === 'results') {
    const settings = loadSettings();
    const partage = `Game7le ${date} — ${formatMs(totalMs)}${flawless ? ' ✨ SANS-FAUTE ✨' : ''}\n${lines
      .map((l) => (l.status === 'success' ? '🟩' : l.status === 'skip' ? '🟨' : '🟥'))
      .join('')}`;
    return (
      <div className="results">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-h2)' }}>Terminé !</h1>
        <div className="total">{formatMs(totalMs)}</div>
        {flawless && <p className="flawless">✨ SANS-FAUTE ✨</p>}
        <p className="muted">
          {settings.pseudo} · temps brut {formatMs(rawMs)} · ajustements {formatAdjust(adjustMs)}
        </p>
        <table>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.nom}</td>
                <td className="muted">{l.detail}</td>
                <td className={`adj ${l.adjustMs < 0 ? 'bonus' : l.adjustMs > 0 ? 'malus' : ''}`}>
                  {l.adjustMs === 0 ? '—' : formatAdjust(l.adjustMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="game-actions">
          <button className="btn btn-primary" onClick={() => navigator.clipboard?.writeText(partage)}>
            Copier le résultat
          </button>
          <button className="btn" onClick={() => setVoirSolutions((v) => !v)}>
            {voirSolutions ? 'Masquer les solutions' : 'Voir les solutions'}
          </button>
          <Link className="btn" to="/classement">
            Voir le classement
          </Link>
          <Link className="btn" to="/">
            Accueil
          </Link>
        </div>
        {voirSolutions && <Solutions date={date} ids={lines.map((l) => l.id)} />}
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
          {formatMs(totalMs)}
          {adjustMs !== 0 && (
            <span className={`adj ${adjustMs < 0 ? 'bonus' : 'malus'}`}>{formatAdjust(adjustMs)}</span>
          )}
        </div>
        <SkipControl skip={jeu.skip} elapsedS={gameElapsedS} paused={!!trans} onSkip={onSkip} />
      </div>
      {trans ? (
        <div className="transition">
          {trans.verdict && (
            <p className="verdict" style={{ color: VERDICTS[trans.verdict].color }}>
              {VERDICTS[trans.verdict].label}
            </p>
          )}
          {trans.line && (
            <p className="muted">
              {trans.line.nom} · {trans.line.detail}
              {trans.line.adjustMs !== 0 && (
                <>
                  {' · '}
                  <span className={trans.line.adjustMs < 0 ? 'bonus' : 'malus'}>
                    {formatAdjust(trans.line.adjustMs)}
                  </span>
                </>
              )}
            </p>
          )}
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
          <p className="game-rules">{jeu.regles}</p>
          <jeu.Component key={`${date}-${jeu.id}`} rng={rng} onAdjust={addAdjust} onDone={onDone} />
        </>
      )}
    </div>
  );
}
