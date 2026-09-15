import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { JEUX, JEU_PAR_ID } from '../games';
import { todayStr } from '../lib/rng';
import type { GameDef, GameResult } from '../games/types';
import { seededRng } from '../lib/rng';
import { formatAdjust, formatMs } from '../lib/time';
import { VERDICTS } from './RunPage';
import GameIcon from '../components/GameIcon';

/**
 * Un jeu a une variante corsée dès qu'il en décrit les règles — c'est le seul
 * marqueur fiable : `defi` ne dit que sa présence au tirage hebdomadaire, or
 * Chromal a une variante sans y être, et Tempo en garde une après en être
 * sorti. À l'entraînement, on veut pouvoir jouer toutes celles qui existent.
 */
const aVarianteDifficile = (j: GameDef) => !!j.reglesDifficile;

export function EntrainementListe() {
  return (
    <div className="prose" style={{ maxWidth: 720 }}>
      <h1>Entraînement</h1>
      <p className="muted">
        Jouez chaque épreuve à volonté, hors chrono officiel. Les grilles changent à chaque essai —
        rien n'est enregistré. Les jeux marqués <span className="entr-badge">difficile</span> ont une
        variante corsée, celle du défi hebdomadaire : le choix se fait sur la page du jeu.
      </p>
      <div className="card-grid">
        {/* Tout le catalogue encore en service, y compris un jeu qui n'entre
            dans le tirage que dans quelques jours : on peut s'y entraîner dès
            son arrivée. Un jeu retiré reste jouable par son URL (archives). */}
        {JEUX.filter((j) => !j.tirage.retire || todayStr() < j.tirage.retire).map((j) => (
          <Link className="game-card" to={`/entrainement/${j.id}`} key={j.id}>
            <strong>
              <GameIcon id={j.id} /> {j.nom}
              {aVarianteDifficile(j) && <span className="entr-badge">difficile</span>}
            </strong>
            <span className="desc">{j.regles}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function EntrainementJeu() {
  const { id } = useParams();
  const jeu = JEU_PAR_ID.get(id ?? '');
  const [params, setParams] = useSearchParams();
  const [nonce, setNonce] = useState(() => Math.floor(Math.random() * 1e9));
  const [count, setCount] = useState(3);
  const [startAt, setStartAt] = useState(0);
  const [result, setResult] = useState<(GameResult & { ms: number }) | null>(null);
  // `?mode=difficile` : partageable, et ignoré pour un jeu qui n'a pas de
  // variante — sinon l'URL ferait passer un `difficile` que le jeu ne gère pas.
  const difficile = !!jeu && aVarianteDifficile(jeu) && params.get('mode') === 'difficile';
  // Le mode entre dans la graine : les deux variantes d'un même jeu ne tirent
  // pas la même chose à nonce égal.
  const rng = useMemo(
    () => seededRng(`entrainement:${id}:${difficile ? 'difficile:' : ''}${nonce}`),
    [id, difficile, nonce],
  );

  // Compte à rebours de 3 s avant le début, comme dans le run
  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => {
      if (count === 1) setStartAt(performance.now());
      setCount((c) => c - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [count]);

  if (!jeu)
    return (
      <p>
        Jeu introuvable. <Link to="/entrainement">Retour</Link>
      </p>
    );

  const relance = () => {
    setResult(null);
    setCount(3);
    setNonce(Math.floor(Math.random() * 1e9));
  };

  const changeMode = (dur: boolean) => {
    if (dur === difficile) return;
    setParams(dur ? { mode: 'difficile' } : {}, { replace: true });
    relance();
  };

  const modes = aVarianteDifficile(jeu) && (
    <div className="entr-modes" role="tablist" aria-label="Difficulté">
      {[
        { dur: false, label: 'Normal' },
        { dur: true, label: 'Difficile' },
      ].map((m) => (
        <button
          key={m.label}
          role="tab"
          aria-selected={difficile === m.dur}
          className={`entr-mode${difficile === m.dur ? ' actif' : ''}`}
          onClick={() => changeMode(m.dur)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div className="run-header">
        <div>
          <div className="game-name">
            <GameIcon id={jeu.id} /> {jeu.nom}
          </div>
          <div className="step">Entraînement libre{difficile && ' · difficile'}</div>
        </div>
        {/* Même calage que dans le run : l'entête est une grille de trois
            colonnes (titre / chrono / contrôle). La colonne du milieu porte le
            choix de difficulté quand le jeu en a un, et reste vide sinon —
            sans elle le lien se logeait au centre au lieu d'être à droite. */}
        <div>{modes}</div>
        <Link className="btn btn-sm" to="/entrainement">
          ← Tous les jeux
        </Link>
      </div>
      {result ? (
        <div className="results">
          <p className="verdict" style={{ color: VERDICTS[result.status].color, fontFamily: 'var(--font-display)', fontSize: 'var(--text-h2)' }}>
            {VERDICTS[result.status].label}
          </p>
          <div className="total">{formatMs(result.ms)}</div>
          <p>
            {result.detail} ·{' '}
            <span className={result.adjustMs < 0 ? 'bonus' : result.adjustMs > 0 ? 'malus' : ''}>
              {result.adjustMs === 0 ? 'sans ajustement' : formatAdjust(result.adjustMs)}
            </span>
          </p>
          <div className="game-actions">
            <button className="btn btn-primary" onClick={relance}>
              Rejouer
            </button>
          </div>
        </div>
      ) : count > 0 ? (
        <div className="transition">
          <p className="verdict">Prêt·e ?</p>
          <p className="next-up">
            <GameIcon id={jeu.id} /> <strong>{jeu.nom}</strong>
            {difficile && <span className="entr-badge">difficile</span>}
          </p>
          <div className="countdown" key={count}>
            {count}
          </div>
        </div>
      ) : (
        <>
          <p className="game-rules">{difficile ? (jeu.reglesDifficile ?? jeu.regles) : jeu.regles}</p>
          <jeu.Component
            key={`${nonce}-${difficile}`}
            rng={rng}
            difficile={difficile}
            onAdjust={() => {}}
            onDone={(r) => setResult({ ...r, ms: performance.now() - startAt })}
          />
        </>
      )}
    </div>
  );
}
