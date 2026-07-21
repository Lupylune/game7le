import { useEffect, useMemo, useRef, useState } from 'react';
import { pick } from '../lib/rng';
import { POKEMONS, type Pokemon } from '../data/pokemon';
import type { GameProps } from './types';

const MAX_ESSAIS = 8;
const REVEAL_MS = 320; // délai entre chaque colonne dévoilée
const NB_COLS = 6; // colonnes dévoilées une à une (Type 1 → Habitat)
const SPRITE = (num: number) => `${import.meta.env.BASE_URL}sprites/pokemon/${num}.png`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Clé de recherche insensible aux accents, à la casse et aux symboles (♀/♂). */
const clef = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

type Etat = 'ok' | 'proche' | 'non';
interface Cellule {
  texte: string;
  etat: Etat;
  fleche?: '↑' | '↓';
}

const COLONNES = ['Pokémon', 'Type 1', 'Type 2', 'Stade', 'Évolué', 'Couleur', 'Habitat'];

/** Compare un Pokémon proposé à la cible, colonne par colonne. */
function compare(g: Pokemon, cible: Pokemon): Cellule[] {
  const type1: Cellule = {
    texte: g.type1,
    etat: g.type1 === cible.type1 ? 'ok' : g.type1 === cible.type2 ? 'proche' : 'non',
  };
  const type2: Cellule = {
    texte: g.type2 ?? '—',
    etat:
      g.type2 === cible.type2 ? 'ok' : g.type2 && g.type2 === cible.type1 ? 'proche' : 'non',
  };
  const stade: Cellule = {
    texte: String(g.stade),
    etat: g.stade === cible.stade ? 'ok' : 'non',
    fleche: g.stade === cible.stade ? undefined : cible.stade > g.stade ? '↑' : '↓',
  };
  const evolue: Cellule = {
    texte: g.evolueTotal ? 'Oui' : 'Non',
    etat: g.evolueTotal === cible.evolueTotal ? 'ok' : 'non',
  };
  const couleur: Cellule = {
    texte: g.couleur,
    etat: g.couleur === cible.couleur ? 'ok' : 'non',
  };
  const habitat: Cellule = {
    texte: cap(g.habitat),
    etat: g.habitat === cible.habitat ? 'ok' : 'non',
  };
  return [type1, type2, stade, evolue, couleur, habitat];
}

function bonus(essais: number): number {
  if (essais <= 3) return -15000;
  if (essais <= 5) return -10000;
  return -5000;
}

export default function Pokedle({ rng, onDone }: GameProps) {
  const cible = useMemo(() => pick(rng, POKEMONS), [rng]);
  const [essais, setEssais] = useState<Pokemon[]>([]);
  const [saisie, setSaisie] = useState('');
  const [message, setMessage] = useState('');
  // Nombre de colonnes déjà dévoilées sur la DERNIÈRE proposition (0 → NB_COLS).
  const [revele, setRevele] = useState(NB_COLS);
  const [enCours, setEnCours] = useState(false); // reveal en cours : entrées bloquées
  const enCoursRef = useRef(false);
  const doneRef = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

  // Garde toujours la dernière proposition visible (le board défile en interne
  // quand la fenêtre n'est pas assez haute).
  useEffect(() => {
    const el = boardRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [essais.length]);

  const dejaJoues = useMemo(() => new Set(essais.map((p) => p.num)), [essais]);
  const suggestions = useMemo(() => {
    const k = clef(saisie);
    if (!k) return [];
    return POKEMONS.filter((p) => !dejaJoues.has(p.num) && clef(p.nom).startsWith(k));
  }, [saisie, dejaJoues]);

  function deviner(p: Pokemon) {
    if (doneRef.current || enCoursRef.current || dejaJoues.has(p.num)) return;
    const suite = [...essais, p];
    setEssais(suite);
    setSaisie('');
    setMessage('');
    // Dévoile les colonnes une par une (comme le pokédle original), puis conclut.
    setRevele(0);
    setEnCours(true);
    enCoursRef.current = true;
    let n = 0;
    const tick = () => {
      n += 1;
      setRevele(n);
      if (n < NB_COLS) {
        setTimeout(tick, REVEAL_MS);
        return;
      }
      enCoursRef.current = false;
      setEnCours(false);
      if (p.num === cible.num) {
        doneRef.current = true;
        setTimeout(
          () =>
            onDone({
              adjustMs: bonus(suite.length),
              detail: `trouvé en ${suite.length} essai${suite.length > 1 ? 's' : ''}`,
              status: 'success',
            }),
          500,
        );
      } else if (suite.length >= MAX_ESSAIS) {
        doneRef.current = true;
        // Le nom n'est affiché que localement : le détail synchronisé ne doit pas
        // spoiler le Pokémon du jour aux autres joueurs.
        setMessage(`C'était ${cible.nom}`);
        setTimeout(() => onDone({ adjustMs: 60000, detail: 'échoué', status: 'fail' }), 1100);
      }
    };
    setTimeout(tick, REVEAL_MS);
  }

  return (
    <div className="game-area">
      <div className="pokedle-board" ref={boardRef}>
        <div className="pokedle-row pokedle-head">
          {COLONNES.map((c) => (
            <div className="pokedle-cell" key={c}>
              {c}
            </div>
          ))}
        </div>
        {essais.map((p, ligne) => {
          const dernier = ligne === essais.length - 1;
          const visibles = dernier ? revele : NB_COLS;
          return (
            <div className="pokedle-row" key={p.num}>
              <div className={`pokedle-cell nom${p.num === cible.num ? ' ok' : ''}`}>
                <img className="pokedle-sprite" src={SPRITE(p.num)} alt={p.nom} loading="lazy" />
              </div>
              {compare(p, cible).map((cell, i) =>
                i < visibles ? (
                  <div className={`pokedle-cell ${cell.etat}`} key={i}>
                    {cell.texte}
                    {cell.fleche && <span className="pokedle-fleche">{cell.fleche}</span>}
                  </div>
                ) : (
                  <div className="pokedle-cell cache" key={i} />
                ),
              )}
            </div>
          );
        })}
      </div>

      {!doneRef.current && (
        <div className="pokedle-saisie">
          <input
            className="pokedle-input"
            value={saisie}
            disabled={enCours}
            placeholder={`Devinez le Pokémon · essai ${essais.length + 1}/${MAX_ESSAIS}`}
            autoComplete="off"
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && suggestions[0] && deviner(suggestions[0])}
          />
          {!enCours && suggestions.length > 0 && (
            <div className="pokedle-suggestions">
              {suggestions.map((p) => (
                <button key={p.num} className="pokedle-sugg" onClick={() => deviner(p)}>
                  <img className="pokedle-sugg-sprite" src={SPRITE(p.num)} alt="" loading="lazy" />
                  {p.nom}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {message && <p className="muted">{message}</p>}
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Vert = exact · orange (types) = ce type est dans l’autre emplacement · ↑/↓ = stade
        d’évolution plus haut / plus bas. Génération 1 uniquement.
      </p>
    </div>
  );
}
