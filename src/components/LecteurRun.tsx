import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { JEU_PAR_ID } from '../games';
import type { GameResult } from '../games/types';
import {
  cadence,
  chronologie,
  modeLecture,
  rejoue,
  type Enregistrement,
  type JournalEpreuve,
} from '../lib/enregistrement';
import { seededRng } from '../lib/rng';
import type { GameLine } from '../lib/storage';
import { formatAdjust, formatMs } from '../lib/time';
import { VERDICTS } from '../lib/verdicts';
import GameIcon from './GameIcon';

/**
 * Lecteur d'un run enregistré (voir `lib/enregistrement`) : les sept épreuves
 * sont remontées l'une après l'autre avec la graine du run, et les gestes du
 * joueur leur sont renvoyés à leur instant d'origine. Entre deux épreuves, le
 * même bilan qu'en jeu.
 *
 * La pause suspend les gestes, pas l'épreuve : ses propres minuteurs (flash
 * d'une vérification, coup de l'adversaire…) continuent de tourner.
 */

const BILAN_MS = 2400;
/** Laisse voir l'état final d'une épreuve terminée avant son bilan. */
const APRES_FIN_MS = 1200;
/** Une épreuve qui s'est conclue d'elle-même pendant le run le refait en
 *  relecture, mais rarement à la milliseconde : on lui laisse ce délai. */
const GRACE_FIN_MS = 2000;
/** Plafond d'avance par frame : un onglet en arrière-plan met la lecture en pause. */
const FRAME_MAX_MS = 250;

interface Toast {
  id: number;
  ms: number;
  label: string;
}

/** Valeur lue sur une ref à chaque frame, sans re-rendre l'épreuve. */
function useFrame<T>(lit: () => T): T {
  const [v, setV] = useState(lit);
  const litRef = useRef(lit);
  litRef.current = lit;
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setV(litRef.current());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return v;
}

function Horloge({ oRef, baseMs, adjustMs }: { oRef: { current: number }; baseMs: number; adjustMs: number }) {
  const ms = useFrame(() => baseMs + oRef.current);
  return (
    <div className="timer">
      {formatMs(ms)}
      {adjustMs !== 0 && (
        <span className={`adj ${adjustMs < 0 ? 'bonus' : 'malus'}`}>{formatAdjust(adjustMs)}</span>
      )}
    </div>
  );
}

function Avancement({ oRef, finMs }: { oRef: { current: number }; finMs: number }) {
  const p = useFrame(() => (finMs > 0 ? Math.min(1, oRef.current / finMs) : 0));
  return (
    <div className="lecteur-avancement" aria-hidden>
      <div style={{ '--p': p } as CSSProperties} />
    </div>
  );
}

function Epreuve({
  journal,
  date,
  defi,
  enLecture,
  accelere,
  oRef,
  attendFin,
  onAdjust,
  onFin,
}: {
  journal: JournalEpreuve;
  date: string;
  defi: boolean;
  enLecture: boolean;
  accelere: boolean;
  oRef: { current: number };
  /** L'épreuve s'est terminée d'elle-même pendant le run (pas passée). */
  attendFin: boolean;
  onAdjust: (ms: number, label: string) => void;
  onFin: (r: GameResult | null) => void;
}) {
  const jeu = JEU_PAR_ID.get(journal.id)!;
  // Même graine que le run : même grille, même mot, même plateau
  const rng = useMemo(
    () => seededRng(`game7le:${defi ? 'defi:' : ''}${date}:${journal.id}`),
    [date, defi, journal.id],
  );
  const pas = useMemo(() => chronologie(journal, !!jeu.tempsReel), [journal, jeu]);
  const racineRef = useRef<HTMLDivElement>(null);
  const resultatRef = useRef<GameResult | null>(null);
  const finiARef = useRef<number | null>(null);
  // Lus à chaque frame : la boucle ne redémarre pas quand on les bascule
  const lectureRef = useRef(enLecture);
  const accelereRef = useRef(accelere);
  const onFinRef = useRef(onFin);
  const attendFinRef = useRef(attendFin);
  lectureRef.current = enLecture;
  accelereRef.current = accelere;
  onFinRef.current = onFin;
  attendFinRef.current = attendFin;

  useEffect(() => {
    const racine = racineRef.current!;
    const libere = modeLecture(racine);
    const fin = pas[pas.length - 1].t;
    let k = 0;
    let avant = performance.now();
    let raf = 0;
    // Instant (réel) où tous les gestes ont été rendus
    let epuiseA: number | null = null;
    oRef.current = 0;
    const tick = (now: number) => {
      const dt = Math.min(FRAME_MAX_MS, now - avant);
      avant = now;
      if (lectureRef.current) {
        oRef.current = Math.min(fin, oRef.current + dt * cadence(pas, k, accelereRef.current));
        while (k < pas.length - 1 && pas[k].t <= oRef.current) {
          try {
            rejoue(racine, pas[k].e);
          } catch {
            // un geste qui ne s'applique plus : la relecture continue
          }
          k++;
        }
        if (k === pas.length - 1 && pas[k].t <= oRef.current) {
          k = pas.length;
          epuiseA = now;
        }
      }
      const jeuFini = finiARef.current != null && now - finiARef.current >= APRES_FIN_MS;
      const journalFini =
        epuiseA != null &&
        finiARef.current == null &&
        (!attendFinRef.current || now - epuiseA >= GRACE_FIN_MS);
      if (jeuFini || journalFini) {
        onFinRef.current(resultatRef.current);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      libere();
    };
  }, [pas, oRef]);

  const onDone = useCallback(
    (r: GameResult) => {
      if (resultatRef.current) return;
      resultatRef.current = r;
      finiARef.current = performance.now();
      if (r.adjustMs !== 0) onAdjust(r.adjustMs, r.adjustMs < 0 ? 'Bonus !' : 'Pénalité');
    },
    [onAdjust],
  );

  return (
    <>
      <p className="game-rules">{(defi && jeu.reglesDifficile) || jeu.regles}</p>
      {/* Même enveloppe qu'en jeu (RunPage) : les chemins enregistrés partent d'elle */}
      <div ref={racineRef} className="zone-epreuve">
        <jeu.Component rng={rng} difficile={defi} onAdjust={onAdjust} onDone={onDone} />
      </div>
    </>
  );
}

function Bilan({ line, ecart, journal }: { line: GameLine; ecart: boolean; journal: JournalEpreuve }) {
  const v = VERDICTS[line.status];
  return (
    <div className="transition recap">
      <p className="verdict" style={{ color: v.color }}>
        {v.label}
      </p>
      <p className="recap-jeu">
        <GameIcon id={line.id} /> {line.nom}
      </p>
      {line.detail && <p className="muted">{line.detail}</p>}
      <div className="recap-stats">
        <div className="recap-stat">
          <span className="recap-label">Temps sur l'épreuve</span>
          <span className="recap-val">{formatMs(line.ms ?? journal.ms)}</span>
        </div>
        <div className="recap-stat">
          <span className="recap-label">
            {line.adjustMs < 0 ? 'Temps gagné' : line.adjustMs > 0 ? 'Temps perdu' : 'Ajustement'}
          </span>
          <span className={`recap-val ${line.adjustMs < 0 ? 'bonus' : line.adjustMs > 0 ? 'malus' : ''}`}>
            {line.adjustMs === 0 ? '—' : formatAdjust(line.adjustMs)}
          </span>
        </div>
      </div>
      {journal.tronque ? (
        <p className="note">Enregistrement incomplet : la fin de l'épreuve n'a pas été gardée.</p>
      ) : (
        ecart && (
          <p className="note">
            Relecture approximative : l'épreuve ne s'est pas terminée exactement comme pendant le run.
          </p>
        )
      )}
    </div>
  );
}

export default function LecteurRun({ enr }: { enr: Enregistrement }) {
  const [i, setI] = useState(0);
  // Incrémenté pour remonter l'épreuve (recommencer, sauter)
  const [essai, setEssai] = useState(0);
  const [enLecture, setEnLecture] = useState(true);
  const [accelere, setAccelere] = useState(true);
  const [bilan, setBilan] = useState<{ ecart: boolean } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const oRef = useRef(0);

  const n = enr.epreuves.length;
  const journal = enr.epreuves[i];
  const line = enr.lines[i];
  const jeu = JEU_PAR_ID.get(journal.id)!;
  const derniere = i === n - 1;
  // Une épreuve reprise après interruption n'a gardé que son dernier essai :
  // le temps passé avant compte quand même dans le chrono.
  const decalage = journal.reprise ? Math.max(0, (line.ms ?? 0) - journal.ms) : 0;
  const avant = enr.lines.slice(0, i);
  const baseMs = avant.reduce((s, l) => s + (l.ms ?? 0), 0) + decalage;
  const adjustAvant = avant.reduce((s, l) => s + l.adjustMs, 0);

  const aller = (j: number) => {
    setI(Math.max(0, Math.min(n - 1, j)));
    setEssai((e) => e + 1);
    setBilan(null);
    setToasts([]);
    oRef.current = 0;
  };

  const onAdjust = useCallback((ms: number, label: string) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts, { id, ms, label }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 1400);
  }, []);

  const onFin = useCallback(
    (r: GameResult | null) => {
      const ecart = line.status === 'skip' ? r != null : r?.status !== line.status;
      setBilan({ ecart });
    },
    [line],
  );

  // Bilan affiché, puis épreuve suivante — sauf en pause et après la dernière
  useEffect(() => {
    if (!bilan || !enLecture || derniere) return;
    const t = setTimeout(() => aller(i + 1), BILAN_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bilan, enLecture, derniere, i]);

  const finRun = bilan && derniere;

  return (
    <div className="lecteur">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-adjust"
          style={{ color: t.ms < 0 ? 'var(--success)' : 'var(--error)' }}
        >
          {formatAdjust(t.ms)} · {t.label}
        </div>
      ))}
      <div className="run-header">
        <div>
          <div className="game-name">
            <GameIcon id={jeu.id} /> {jeu.nom}
          </div>
          <div className="step">
            Épreuve {i + 1} / {n}
            {journal.reprise && ' · reprise après interruption'}
          </div>
        </div>
        <Horloge oRef={oRef} baseMs={baseMs} adjustMs={adjustAvant} />
        <div className="lecteur-commandes">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => aller(i - 1)}
            disabled={i === 0}
            aria-label="Épreuve précédente"
          >
            ‹
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => (finRun ? aller(0) : setEnLecture((l) => !l))}
            aria-label={finRun ? 'Revoir depuis le début' : enLecture ? 'Mettre en pause' : 'Reprendre'}
          >
            {finRun ? '↺' : enLecture ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => aller(i)}
            aria-label="Recommencer l'épreuve"
          >
            ⟲
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => aller(i + 1)}
            disabled={derniere}
            aria-label="Épreuve suivante"
          >
            ›
          </button>
        </div>
      </div>
      <Avancement key={`${i}-${essai}`} oRef={oRef} finMs={Math.max(journal.ms, 1)} />
      {bilan ? (
        <>
          <Bilan line={line} ecart={bilan.ecart} journal={journal} />
          {finRun && (
            <p className="lecteur-fin">
              Fin du run — <strong>{formatMs(enr.totalMs)}</strong>{' '}
              <button type="button" className="btn btn-sm" onClick={() => aller(0)}>
                Revoir depuis le début
              </button>
            </p>
          )}
        </>
      ) : (
        <Epreuve
          key={`${i}-${essai}`}
          journal={journal}
          date={enr.date}
          defi={enr.defi}
          enLecture={enLecture}
          accelere={accelere}
          oRef={oRef}
          attendFin={line.status !== 'skip' && !journal.tronque}
          onAdjust={onAdjust}
          onFin={onFin}
        />
      )}
      <div className="lecteur-pied">
        <ol className="lecteur-epreuves">
          {enr.lines.map((l, j) => (
            <li key={l.id}>
              <button
                type="button"
                className={`lecteur-puce${j === i ? ' actif' : ''}`}
                style={{ '--c': VERDICTS[l.status].color } as CSSProperties}
                aria-current={j === i ? 'step' : undefined}
                onClick={() => aller(j)}
              >
                <GameIcon id={l.id} /> {l.nom}
              </button>
            </li>
          ))}
        </ol>
        <label className="lecteur-option">
          <input type="checkbox" checked={accelere} onChange={(e) => setAccelere(e.target.checked)} />
          Écourter les temps morts
        </label>
      </div>
    </div>
  );
}
