import { useEffect, useMemo, useRef, useState } from 'react';
import { pick } from '../lib/rng';
import { ATTRS_SAISIE, EST_TACTILE, useSaisieTexte } from '../lib/saisie';
import { SOL5, SOL6 } from '../data/lexique';
import type { GameProps } from './types';

const N_MOTS = 12;

export default function Dactylo({ rng, difficile, onDone }: GameProps) {
  const phrase = useMemo(() => {
    // Défi difficile : deux fois plus de mots à recopier
    const n = difficile ? N_MOTS * 2 : N_MOTS;
    const mots: string[] = [];
    for (let i = 0; i < n; i++) mots.push(pick(rng, i % 2 ? SOL6 : SOL5).toLowerCase());
    return mots.join(' ');
  }, [rng, difficile]);

  const [pos, setPos] = useState(0);
  const [typos, setTypos] = useState(0);
  const [flash, setFlash] = useState(false);
  // Le champ de frappe a-t-il le foyer ? sur mobile, tant qu'il ne l'a pas le
  // clavier virtuel reste fermé et le joueur perd du temps sans comprendre.
  const [foyer, setFoyer] = useState(false);
  const doneRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Position et fautes suivies aussi en ref : un clavier virtuel peut livrer
  // plusieurs caractères dans la même passe, chacun devant voir l'avancement
  // du précédent (l'état React n'est à jour qu'au rendu suivant).
  const posRef = useRef(0);
  const typosRef = useRef(0);
  const saisie = useSaisieTexte((ch) => onChar(ch.toLowerCase()));

  // Ouverture du clavier dès le début de l'épreuve : le foyer seul ne suffit pas
  // sur mobile (les navigateurs n'ouvrent le clavier virtuel que sur un geste),
  // d'où l'appel à l'API VirtualKeyboard — disponible sur Chrome Android, elle
  // accepte l'ouverture sur la seule interaction déjà eue avec la page. Ailleurs
  // le bouton « Ouvrir le clavier » sert de repli.
  useEffect(() => {
    ouvrirClavier();
  }, []);

  function ouvrirClavier() {
    inputRef.current?.focus();
    navigator.virtualKeyboard?.show();
  }

  function onChar(ch: string) {
    if (doneRef.current) return;
    if (ch === phrase[posRef.current]) {
      const next = posRef.current + 1;
      posRef.current = next;
      setPos(next);
      if (next === phrase.length) {
        doneRef.current = true;
        const fautes = typosRef.current;
        const adjustMs = fautes === 0 ? -15000 : fautes <= 5 ? -10000 : -5000;
        setTimeout(
          () =>
            onDone({
              adjustMs,
              detail:
                fautes === 0 ? 'recopié sans faute' : `recopié (${fautes} faute${fautes > 1 ? 's' : ''})`,
              status: 'success',
            }),
          500,
        );
      }
    } else {
      typosRef.current++;
      setTypos(typosRef.current);
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
    }
  }

  return (
    <div className="game-area">
      <p className={`dactylo-phrase${flash ? ' err' : ''}`} onClick={ouvrirClavier}>
        {phrase.split('').map((c, i) => (
          <span key={i} className={i < pos ? 'ok' : i === pos ? 'cur' : ''}>
            {c === ' ' && i === pos ? '␣' : c}
          </span>
        ))}
      </p>
      {/* Un foyer obtenu par programme ne garantit pas que le clavier virtuel
          soit ouvert : on garde le bouton jusqu'à la première lettre frappée,
          et on le remet si le champ perd le foyer en cours d'épreuve. */}
      {EST_TACTILE && (pos + typos === 0 || !foyer) && (
        <button className="btn btn-primary dactylo-clavier" onClick={ouvrirClavier}>
          Ouvrir le clavier
        </button>
      )}
      <input
        ref={inputRef}
        {...ATTRS_SAISIE}
        autoCapitalize="none"
        aria-label="Zone de frappe"
        placeholder="Tapez ici…"
        onFocus={() => setFoyer(true)}
        onBlur={() => setFoyer(false)}
        onInput={saisie}
        onKeyDown={(e) => {
          // les lettres passent par onInput ; on ne bloque que la navigation
          if (e.key === 'Backspace') e.preventDefault();
        }}
      />
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Recopiez la phrase le plus vite possible — seule la bonne lettre fait avancer, chaque
        erreur compte. {typos > 0 && `Fautes : ${typos}`}
      </p>
    </div>
  );
}
