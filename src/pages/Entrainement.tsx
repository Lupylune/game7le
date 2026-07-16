import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { JEUX, JEU_PAR_ID } from '../games';
import type { GameResult } from '../games/types';
import { seededRng } from '../lib/rng';
import { formatAdjust, formatMs } from '../lib/time';
import { VERDICTS } from './RunPage';
import GameIcon from '../components/GameIcon';

export function EntrainementListe() {
  return (
    <div className="prose" style={{ maxWidth: 720 }}>
      <h1>Entraînement</h1>
      <p className="muted">
        Jouez chaque épreuve à volonté, hors chrono officiel. Les grilles changent à chaque essai —
        rien n'est enregistré.
      </p>
      <div className="card-grid">
        {JEUX.map((j) => (
          <Link className="game-card" to={`/entrainement/${j.id}`} key={j.id}>
            <strong>
              <GameIcon id={j.id} /> {j.nom}
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
  const [nonce, setNonce] = useState(() => Math.floor(Math.random() * 1e9));
  const [count, setCount] = useState(3);
  const [startAt, setStartAt] = useState(0);
  const [result, setResult] = useState<(GameResult & { ms: number }) | null>(null);
  const rng = useMemo(() => seededRng(`entrainement:${id}:${nonce}`), [id, nonce]);

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

  const retry = () => {
    setResult(null);
    setCount(3);
    setNonce(Math.floor(Math.random() * 1e9));
  };

  return (
    <div>
      <div className="run-header">
        <div>
          <div className="game-name">
            <GameIcon id={jeu.id} /> {jeu.nom}
          </div>
          <div className="step">Entraînement libre</div>
        </div>
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
            <button className="btn btn-primary" onClick={retry}>
              Rejouer
            </button>
          </div>
        </div>
      ) : count > 0 ? (
        <div className="transition">
          <p className="verdict">Prêt·e ?</p>
          <p className="next-up">
            <GameIcon id={jeu.id} /> <strong>{jeu.nom}</strong>
          </p>
          <div className="countdown" key={count}>
            {count}
          </div>
        </div>
      ) : (
        <>
          <p className="game-rules">{jeu.regles}</p>
          <jeu.Component
            key={nonce}
            rng={rng}
            onAdjust={() => {}}
            onDone={(r) => setResult({ ...r, ms: performance.now() - startAt })}
          />
        </>
      )}
    </div>
  );
}
