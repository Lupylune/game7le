import { useMemo, useRef, useState } from 'react';
import { pick } from '../lib/rng';
import { ARTICLES, ARTICLES_DIFFICILES } from '../data/encyclo';
import { proches } from '../data/proches';
import type { GameProps } from './types';

/**
 * Encyclo — adaptation de Pedantix : l'introduction d'un article de Wikipédia
 * est entièrement masquée (un bloc par mot, à la bonne longueur), titre compris.
 * Chaque mot proposé se dévoile partout où il apparaît ; la partie est gagnée
 * quand tous les mots du titre sont trouvés.
 *
 * Écarts assumés par rapport à l'original :
 * - proximité de sens approchée par des relations lexicales précalculées
 *   (`data/proches.ts`, Wiktionnaire) plutôt que par un modèle de vecteurs de
 *   mots, trop lourd à embarquer : « monarque » dévoile « roi », mais sans le
 *   dégradé tiède/chaud/brûlant de l'original — un mot est proche ou il ne l'est
 *   pas. La parenté de forme (même radical) est déduite à la volée. Les deux se
 *   dévoilent en « famille » (orange).
 * - texte réduit aux premières phrases de l'intro et mots grammaticaux dévoilés
 *   d'emblée : une épreuve du parcours doit se boucler en une minute ou deux,
 *   pas en cent essais. Le défi difficile masque tout, sujets moins connus.
 */

const MAX_ESSAIS = 40;
const PENALITE_ECHEC = 60000;
const PENALITE_ECHEC_DIFFICILE = 90000;
const PENALITE_INDICE = 15000;

/** Clé de comparaison : sans accents, sans casse, sans ponctuation. */
const clef = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Pluriel simple ignoré : « romans » dévoile « roman ». */
const sansPluriel = (k: string) => (k.length > 3 ? k.replace(/[sx]$/, '') : k);
/** Radical grossier : « peintre » et « peinture » partagent « peint ». */
const radical = (k: string) => k.slice(0, 5);

// Mots grammaticaux dévoilés dès le départ au quotidien : ils ne renseignent sur
// rien et les faire deviner ne ferait que rallonger la partie.
const GRAMMATICAUX = new Set(
  (
    "le la les l un une des de du d et ou a au aux en y est sont etait etaient ete " +
    "sera etre par pour dans sur sous vers avec sans que qui quoi dont ne pas plus " +
    "se s sa son ses leur leurs ce c cet cette ces il elle ils elles on nous vous je " +
    "tu me te mon ma mes ton ta tes notre votre comme mais donc car ni or ainsi " +
    "entre apres avant depuis lors selon chez jusqu qu si aussi ont avait a"
  ).split(' '),
);

type Etat = 'cache' | 'famille' | 'plein';

interface Jeton {
  texte: string;
  /** Suite de lettres ou de chiffres (le reste : ponctuation et espaces). */
  mot: boolean;
  /** Nombre pur (une date reste lisible, comme dans l'original). */
  nombre: boolean;
  clef: string;
  titre: boolean;
}

/** Découpe un texte en mots et séparateurs (apostrophes et tirets séparent). */
function tokenise(s: string, titre: boolean): Jeton[] {
  const out: Jeton[] = [];
  let fin = 0;
  for (const m of s.matchAll(/[\p{L}\p{N}]+/gu)) {
    const i = m.index;
    if (i > fin)
      out.push({ texte: s.slice(fin, i), mot: false, nombre: false, clef: '', titre });
    const mot = m[0];
    out.push({
      texte: mot,
      mot: true,
      nombre: !/\p{L}/u.test(mot),
      clef: clef(mot),
      titre,
    });
    fin = i + mot.length;
  }
  if (fin < s.length)
    out.push({ texte: s.slice(fin), mot: false, nombre: false, clef: '', titre });
  return out;
}

interface Proposition {
  mot: string;
  /** Occurrences dévoilées exactement, puis en famille. */
  exact: number;
  famille: number;
}

export default function Encyclo({ rng, difficile = false, onAdjust, onDone }: GameProps) {
  const article = useMemo(() => pick(rng, difficile ? ARTICLES_DIFFICILES : ARTICLES), [
    rng,
    difficile,
  ]);

  const jetons = useMemo(
    () => [...tokenise(article.titre, true), ...tokenise(article.texte, false)],
    [article],
  );

  // État de chaque jeton. Ponctuation, nombres et — au quotidien — mots
  // grammaticaux sont lisibles d'emblée.
  const [etats, setEtats] = useState<Etat[]>(() =>
    jetons.map((j) =>
      !j.mot || j.nombre || (!difficile && GRAMMATICAUX.has(j.clef)) ? 'plein' : 'cache',
    ),
  );
  // Lettres dévoilées par les indices, jeton par jeton (mots du titre seulement).
  const [lettres, setLettres] = useState<number[]>(() => jetons.map(() => 0));
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [saisie, setSaisie] = useState('');
  const [message, setMessage] = useState('');
  // Jetons dévoilés par la dernière proposition (surlignage passager).
  const [derniers, setDerniers] = useState<Set<number>>(() => new Set());
  const doneRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const essais = propositions.length;
  const dejaProposees = useMemo(
    () => new Set(propositions.map((p) => clef(p.mot))),
    [propositions],
  );

  const trouve = (i: number, etat: Etat, lettre: number) =>
    etat === 'plein' || lettre >= jetons[i].texte.length;
  /**
   * Mot du titre qui reste à trouver. Les mots grammaticaux n'en font jamais
   * partie : dévoilés d'emblée au quotidien, ils ne sont pas exigés au défi
   * difficile non plus — taper « de » ou « la » n'est pas une énigme.
   */
  const exige = (j: Jeton, i: number) =>
    j.titre && j.mot && !j.nombre && !GRAMMATICAUX.has(j.clef) && !trouve(i, etats[i], lettres[i]);
  const gagne = (e: Etat[], l: number[]) =>
    jetons.every(
      (j, i) =>
        !j.titre || !j.mot || j.nombre || GRAMMATICAUX.has(j.clef) || trouve(i, e[i], l[i]),
    );

  function termine(succes: boolean, nbEssais: number) {
    doneRef.current = true;
    // Fin de partie : l'article se dévoile en entier, comme dans l'original.
    setEtats(jetons.map(() => 'plein'));
    if (succes) {
      const bonus = nbEssais <= 8 ? -20000 : nbEssais <= 16 ? -12000 : nbEssais <= 30 ? -6000 : -3000;
      setMessage('Bien joué !');
      setTimeout(
        () =>
          onDone({
            adjustMs: bonus,
            // Pas le titre dans le détail : il est synchronisé et visible par les
            // autres joueurs en dépliant la run (spoiler de l'article du jour).
            detail: nbEssais
              ? `trouvé en ${nbEssais} mot${nbEssais > 1 ? 's' : ''}`
              : 'trouvé grâce aux indices',
            status: 'success',
          }),
        700,
      );
    } else {
      setMessage(`C'était « ${article.titre} »`);
      setTimeout(
        () =>
          onDone({
            adjustMs: difficile ? PENALITE_ECHEC_DIFFICILE : PENALITE_ECHEC,
            detail: 'échoué',
            status: 'fail',
          }),
        1400,
      );
    }
  }

  /** Propose un ou plusieurs mots (chacun compte pour un essai). */
  function proposer() {
    if (doneRef.current) return;
    const mots = saisie.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    setSaisie('');
    if (!mots.length) return;

    const suivants = [...etats];
    const nouvelles: Proposition[] = [];
    const touches = new Set<number>();

    for (const mot of mots) {
      const k = clef(mot);
      if (!k || dejaProposees.has(k) || nouvelles.some((p) => clef(p.mot) === k)) {
        setMessage(`« ${mot} » a déjà été proposé`);
        continue;
      }
      let exact = 0;
      let famille = 0;
      // Formes du texte que ce mot dévoile par le sens (« monarque » → « roi »).
      const parLeSens = proches().get(k);
      jetons.forEach((j, i) => {
        if (!j.mot || j.nombre) return;
        if (sansPluriel(j.clef) === sansPluriel(k)) {
          if (suivants[i] !== 'plein') {
            exact++;
            touches.add(i);
          }
          suivants[i] = 'plein';
        } else if (
          suivants[i] === 'cache' &&
          ((k.length >= 5 && j.clef.length >= 5 && radical(j.clef) === radical(k)) ||
            parLeSens?.includes(j.clef))
        ) {
          famille++;
          touches.add(i);
          suivants[i] = 'famille';
        }
      });
      nouvelles.push({ mot, exact, famille });
      if (!exact && !famille) setMessage(`« ${mot} » n'apparaît pas`);
      else setMessage('');
    }

    inputRef.current?.focus();
    if (!nouvelles.length) return;
    const total = essais + nouvelles.length;
    setEtats(suivants);
    setPropositions([...propositions, ...nouvelles]);
    setDerniers(touches);
    if (gagne(suivants, lettres)) termine(true, total);
    else if (total >= MAX_ESSAIS) termine(false, total);
  }

  /** Dévoile une lettre de plus sur le premier mot du titre encore incomplet. */
  function indice() {
    if (doneRef.current) return;
    const i = jetons.findIndex(exige);
    if (i === -1) return;
    const suivantes = [...lettres];
    suivantes[i] += 1;
    onAdjust(PENALITE_INDICE, 'Indice');
    setLettres(suivantes);
    setMessage('');
    if (gagne(etats, suivantes)) termine(true, essais);
  }

  const rendu = (j: Jeton, i: number) => {
    if (!j.mot) return <span key={i}>{j.texte}</span>;
    const etat = etats[i];
    const revele = lettres[i];
    // Un mot complété par les indices reste marqué comme tel : il n'a pas été
    // trouvé par le joueur.
    if (etat !== 'plein' && revele >= j.texte.length)
      return (
        <span key={i} className="enc-mot ind">
          {j.texte}
        </span>
      );
    if (etat === 'plein' || etat === 'famille')
      return (
        <span key={i} className={`enc-mot ${etat === 'plein' ? 'ok' : 'famille'}${derniers.has(i) ? ' neuf' : ''}`}>
          {j.texte}
        </span>
      );
    // Masqué : bloc à la longueur du mot, préfixé des lettres données en indice.
    return (
      <span key={i} className="enc-mot cache" aria-label={`mot de ${j.texte.length} lettres`}>
        {revele > 0 && <span className="enc-indice">{j.texte.slice(0, revele)}</span>}
        <span className="enc-bloc" style={{ width: `${j.texte.length - revele}ch` }} />
      </span>
    );
  };

  const restants = jetons.filter(exige).length;

  return (
    <div className="game-area">
      <div className="enc-article">
        <span className="enc-label">Titre à trouver</span>
        <h3 className="enc-titre">{jetons.map((j, i) => (j.titre ? rendu(j, i) : null))}</h3>
        <p className="enc-texte">
          {jetons.map((j, i) => (j.titre ? null : rendu(j, i)))}
        </p>
      </div>

      {!doneRef.current && (
        <div className="enc-saisie">
          <input
            ref={inputRef}
            className="enc-input"
            autoFocus
            value={saisie}
            placeholder={`Proposez un mot · essai ${essais + 1}/${MAX_ESSAIS}`}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && proposer()}
          />
          <button className="btn btn-primary btn-sm" onClick={proposer} disabled={!saisie.trim()}>
            Proposer
          </button>
        </div>
      )}

      {propositions.length > 0 && (
        <div className="enc-historique">
          {[...propositions]
            .reverse()
            .slice(0, 12)
            .map((p) => (
              <span
                key={clef(p.mot)}
                className={`enc-essai ${p.exact ? 'ok' : p.famille ? 'famille' : 'non'}`}
              >
                {p.mot}
                {p.exact + p.famille > 0 && <b>{p.exact + p.famille}</b>}
              </span>
            ))}
        </div>
      )}

      {message && <p className="muted">{message}</p>}

      {!doneRef.current && (
        <div className="game-actions">
          <button className="btn btn-sm" onClick={indice}>
            Indice (+{PENALITE_INDICE / 1000} s)
          </button>
        </div>
      )}

      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        {restants > 1 ? `${restants} mots du titre à trouver` : `${restants} mot du titre à trouver`}
        {!doneRef.current && ` · essai ${essais + 1}/${MAX_ESSAIS}`} · vert = mot exact, orange =
        même famille ou sens proche. Texte : Wikipédia (CC BY-SA).
      </p>
    </div>
  );
}

/** Titre de l'article du jour (écran des solutions). */
export function solutionEncyclo(rng: () => number, difficile = false): string {
  return pick(rng, difficile ? ARTICLES_DIFFICILES : ARTICLES).titre;
}
