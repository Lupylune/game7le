/**
 * Ricochet Robots — plateau, glissade et solveur.
 *
 * Un robot poussé dans une direction glisse jusqu'à heurter un mur, le bord, le
 * bloc central ou un autre robot : c'est toute la mécanique. L'énigme du jour
 * consiste à amener le robot désigné sur sa cible en un minimum de coups.
 *
 * Le plateau n'est pas inventé : il s'assemble à partir des quatre tuiles 8×8 du
 * jeu physique, tirées parmi les douze variantes connues (trois par couleur) et
 * posées dans les quatre coins — donc pivotées d'un quart de tour à chaque
 * position. Les coordonnées des tuiles sont relevées dans le solveur open source
 * `Lireer/ricochet-robot-solver` (ricochet_board/src/quadrant.rs, MIT), qui les
 * décrit comme identiques à celles du plateau physique.
 *
 * Tout est dérivé du `RNG` seedé du jour : même plateau, mêmes robots et même
 * cible pour tout le monde.
 */
import { shuffle, type RNG } from './rng';

export const TAILLE = 16;
const CASES = TAILLE * TAILLE;
const NB_ROBOTS = 4;

export type Direction = 'haut' | 'droite' | 'bas' | 'gauche';
export const DIRECTIONS: Direction[] = ['haut', 'droite', 'bas', 'gauche'];

/** Masque de murs d'une case : un bit par côté. */
export const MUR = { nord: 1, est: 2, sud: 4, ouest: 8 } as const;

const MUR_DE: Record<Direction, number> = {
  haut: MUR.nord,
  droite: MUR.est,
  bas: MUR.sud,
  gauche: MUR.ouest,
};

const OPPOSE: Record<Direction, Direction> = {
  haut: 'bas',
  droite: 'gauche',
  bas: 'haut',
  gauche: 'droite',
};

/** Les quatre robots, dans l'ordre de leur index (les cibles s'y réfèrent). */
export const COULEURS = ['rouge', 'vert', 'bleu', 'jaune'] as const;
export type Couleur = (typeof COULEURS)[number];

/** Teintes reprises de la palette des régions de Reines : lisibles sur les deux thèmes. */
export const TEINTES: Record<Couleur, string> = {
  rouge: '#c45a5a',
  vert: '#7aa05a',
  bleu: '#5a7fc4',
  jaune: '#c4a45a',
};

/** Symboles du plateau officiel, plus le vortex atteignable par n'importe quel robot. */
const SYMBOLES = {
  cercle: '●',
  triangle: '▲',
  carre: '■',
  hexagone: '⬢',
  vortex: '✺',
} as const;

/** Couleur neutre du vortex : il n'appartient à aucun robot. */
export const TEINTE_VORTEX = '#8d8d8d';

export interface Cible {
  /** Case visée, indexée par `ligne * TAILLE + colonne`. */
  pos: number;
  /** Index du robot qui doit l'atteindre ; `null` pour le vortex, ouvert à tous. */
  robot: number | null;
  symbole: string;
}

export interface Plateau {
  taille: number;
  /** Masque de murs par case. */
  murs: number[];
  /** Cases infranchissables (bloc central). */
  bloquees: number[];
  cibles: Cible[];
}

export const ligneDe = (pos: number, taille = TAILLE) => Math.floor(pos / taille);
export const colDe = (pos: number, taille = TAILLE) => pos % taille;
export const caseDe = (ligne: number, col: number, taille = TAILLE) => ligne * taille + col;

/** Case voisine dans une direction, ou -1 en dehors du plateau. */
export function voisine(pos: number, dir: Direction, taille = TAILLE): number {
  const l = ligneDe(pos, taille);
  const c = colDe(pos, taille);
  switch (dir) {
    case 'haut':
      return l === 0 ? -1 : caseDe(l - 1, c, taille);
    case 'bas':
      return l === taille - 1 ? -1 : caseDe(l + 1, c, taille);
    case 'gauche':
      return c === 0 ? -1 : caseDe(l, c - 1, taille);
    case 'droite':
      return c === taille - 1 ? -1 : caseDe(l, c + 1, taille);
  }
}

/**
 * Fait glisser un robot jusqu'à ce qu'il heurte un mur, le bord, le bloc central
 * ou un autre robot. Retourne la case d'arrivée — identique au départ si le
 * robot est déjà bloqué dans cette direction.
 */
export function glisse(
  plateau: Plateau,
  occupees: ReadonlySet<number>,
  depart: number,
  dir: Direction,
): number {
  const bit = MUR_DE[dir];
  let courante = depart;
  for (;;) {
    if (((plateau.murs[courante] ?? 0) & bit) !== 0) return courante;
    const suivante = voisine(courante, dir, plateau.taille);
    if (suivante < 0) return courante;
    if (occupees.has(suivante)) return courante;
    if (plateau.bloquees.includes(suivante)) return courante;
    courante = suivante;
  }
}

/**
 * Applique un coup et retourne les nouvelles positions, ou `null` si le robot
 * n'a pas bougé — un coup qui ne déplace personne n'est pas décompté.
 */
export function deplace(
  plateau: Plateau,
  robots: readonly number[],
  index: number,
  dir: Direction,
): number[] | null {
  const depart = robots[index];
  if (depart === undefined) return null;
  const occupees = new Set(robots.filter((_, i) => i !== index));
  const arrivee = glisse(plateau, occupees, depart, dir);
  if (arrivee === depart) return null;
  const suite = robots.slice();
  suite[index] = arrivee;
  return suite;
}

/** Le vortex est validé par n'importe quel robot ; les autres cibles sont nominatives. */
export function cibleAtteinte(cible: Cible, robots: readonly number[]): boolean {
  if (cible.robot === null) return robots.includes(cible.pos);
  return robots[cible.robot] === cible.pos;
}

/** Ajoute un mur et son réciproque sur la case voisine, pour garder le plateau cohérent. */
function poseMur(murs: number[], pos: number, dir: Direction, taille = TAILLE): void {
  murs[pos] = (murs[pos] ?? 0) | MUR_DE[dir];
  const v = voisine(pos, dir, taille);
  if (v < 0) return;
  murs[v] = (murs[v] ?? 0) | MUR_DE[OPPOSE[dir]];
}

/* ===== Tuiles du plateau physique ======================================== */

/**
 * Conventions d'origine, conservées telles quelles pour rester vérifiables
 * ligne à ligne face à la source :
 *  - une position est `[colonne, ligne]`, origine en haut à gauche de la tuile ;
 *  - `mursSud` place un mur sur le côté sud de la case, `mursEst` sur le côté est.
 *
 * Propriété structurelle du plateau physique : toute case cible porte un coude
 * de deux murs perpendiculaires. Une coordonnée mal recopiée casse forcément un
 * coude — c'est le meilleur garde-fou en relisant ces données.
 */
type SymboleCible = keyof typeof SYMBOLES;

interface CibleTuile {
  en: [number, number];
  /** Couleur du robot attendu ; `null` = le vortex, ouvert à tous. */
  robot: Couleur | null;
  symbole: SymboleCible;
}

interface Tuile {
  couleur: Couleur;
  mursSud: Array<[number, number]>;
  mursEst: Array<[number, number]>;
  cibles: CibleTuile[];
}

const DEMI = TAILLE / 2;

const TUILES: Tuile[] = [
  // --- tuiles rouges ---------------------------------------------------------
  {
    couleur: 'rouge',
    mursSud: [[0, 5], [1, 3], [3, 6], [4, 0], [5, 4]],
    mursEst: [[0, 3], [1, 0], [3, 6], [4, 1], [4, 5]],
    cibles: [
      { en: [1, 3], robot: 'rouge', symbole: 'triangle' },
      { en: [3, 6], robot: 'bleu', symbole: 'hexagone' },
      { en: [4, 1], robot: 'vert', symbole: 'cercle' },
      { en: [5, 5], robot: 'jaune', symbole: 'carre' },
    ],
  },
  {
    couleur: 'rouge',
    mursSud: [[0, 5], [1, 1], [2, 4], [6, 1], [7, 4]],
    mursEst: [[0, 1], [2, 4], [3, 0], [6, 2], [6, 5]],
    cibles: [
      { en: [1, 1], robot: 'rouge', symbole: 'triangle' },
      { en: [2, 4], robot: 'bleu', symbole: 'hexagone' },
      { en: [6, 2], robot: 'vert', symbole: 'cercle' },
      { en: [7, 5], robot: 'jaune', symbole: 'carre' },
    ],
  },
  {
    couleur: 'rouge',
    mursSud: [[0, 4], [1, 5], [2, 3], [5, 2], [7, 5]],
    mursEst: [[0, 6], [2, 4], [3, 0], [5, 2], [6, 5]],
    cibles: [
      { en: [1, 6], robot: 'jaune', symbole: 'carre' },
      { en: [2, 4], robot: 'vert', symbole: 'cercle' },
      { en: [5, 2], robot: 'bleu', symbole: 'hexagone' },
      { en: [7, 5], robot: 'rouge', symbole: 'triangle' },
    ],
  },

  // --- tuiles bleues ---------------------------------------------------------
  {
    couleur: 'bleu',
    mursSud: [[0, 3], [2, 3], [3, 1], [4, 5], [5, 3]],
    mursEst: [[2, 2], [2, 4], [4, 3], [4, 5], [5, 0]],
    cibles: [
      { en: [2, 4], robot: 'rouge', symbole: 'carre' },
      { en: [3, 2], robot: 'jaune', symbole: 'cercle' },
      { en: [4, 5], robot: 'vert', symbole: 'hexagone' },
      { en: [5, 3], robot: 'bleu', symbole: 'triangle' },
    ],
  },
  {
    couleur: 'bleu',
    mursSud: [[0, 3], [1, 2], [2, 5], [5, 1], [6, 3]],
    mursEst: [[0, 2], [2, 6], [3, 0], [5, 1], [5, 4]],
    cibles: [
      { en: [1, 2], robot: 'rouge', symbole: 'carre' },
      { en: [2, 6], robot: 'bleu', symbole: 'triangle' },
      { en: [5, 1], robot: 'vert', symbole: 'hexagone' },
      { en: [6, 4], robot: 'jaune', symbole: 'cercle' },
    ],
  },
  {
    couleur: 'bleu',
    mursSud: [[0, 4], [1, 6], [2, 0], [4, 4], [6, 3]],
    mursEst: [[1, 1], [1, 6], [4, 0], [4, 5], [5, 3]],
    cibles: [
      { en: [1, 6], robot: 'vert', symbole: 'hexagone' },
      { en: [2, 1], robot: 'jaune', symbole: 'cercle' },
      { en: [4, 5], robot: 'rouge', symbole: 'carre' },
      { en: [6, 3], robot: 'bleu', symbole: 'triangle' },
    ],
  },

  // --- tuiles vertes ---------------------------------------------------------
  {
    couleur: 'vert',
    mursSud: [[0, 6], [1, 4], [3, 0], [4, 5], [6, 3]],
    mursEst: [[0, 4], [1, 0], [2, 1], [4, 6], [6, 3]],
    cibles: [
      { en: [1, 4], robot: 'rouge', symbole: 'cercle' },
      { en: [3, 1], robot: 'vert', symbole: 'triangle' },
      { en: [4, 6], robot: 'bleu', symbole: 'carre' },
      { en: [6, 3], robot: 'jaune', symbole: 'hexagone' },
    ],
  },
  {
    couleur: 'vert',
    mursSud: [[0, 5], [1, 1], [3, 6], [4, 0], [6, 3]],
    mursEst: [[1, 0], [1, 2], [2, 6], [3, 1], [6, 3]],
    cibles: [
      { en: [1, 2], robot: 'vert', symbole: 'triangle' },
      { en: [3, 6], robot: 'bleu', symbole: 'carre' },
      { en: [4, 1], robot: 'rouge', symbole: 'cercle' },
      { en: [6, 3], robot: 'jaune', symbole: 'hexagone' },
    ],
  },
  {
    couleur: 'vert',
    mursSud: [[0, 5], [1, 1], [3, 6], [6, 1], [6, 4]],
    mursEst: [[0, 2], [2, 6], [4, 0], [6, 1], [6, 5]],
    cibles: [
      { en: [1, 2], robot: 'vert', symbole: 'triangle' },
      { en: [3, 6], robot: 'rouge', symbole: 'cercle' },
      { en: [6, 1], robot: 'jaune', symbole: 'hexagone' },
      { en: [6, 5], robot: 'bleu', symbole: 'carre' },
    ],
  },

  // --- tuiles jaunes (elles portent le vortex) -------------------------------
  {
    couleur: 'jaune',
    mursSud: [[0, 3], [1, 5], [3, 4], [5, 1], [6, 4], [7, 2]],
    mursEst: [[1, 6], [2, 0], [3, 4], [4, 1], [5, 5], [7, 2]],
    cibles: [
      { en: [1, 6], robot: 'jaune', symbole: 'triangle' },
      { en: [3, 4], robot: 'rouge', symbole: 'hexagone' },
      { en: [5, 1], robot: 'bleu', symbole: 'cercle' },
      { en: [6, 5], robot: 'vert', symbole: 'carre' },
      { en: [7, 2], robot: null, symbole: 'vortex' },
    ],
  },
  {
    couleur: 'jaune',
    mursSud: [[0, 4], [1, 3], [2, 1], [3, 7], [5, 5], [6, 3]],
    mursEst: [[0, 3], [2, 1], [3, 7], [4, 0], [5, 4], [5, 6]],
    cibles: [
      { en: [1, 3], robot: 'vert', symbole: 'carre' },
      // La source amont indique [3, 1], case qui ne porte qu'un seul mur. Le coude
      // sud+est est sur [2, 1] — même motif que la cible rouge hexagone des deux
      // autres tuiles jaunes. Corrigé ici, comme dans le projet Cartel.
      { en: [2, 1], robot: 'rouge', symbole: 'hexagone' },
      { en: [3, 7], robot: null, symbole: 'vortex' },
      { en: [5, 6], robot: 'bleu', symbole: 'cercle' },
      { en: [6, 4], robot: 'jaune', symbole: 'triangle' },
    ],
  },
  {
    couleur: 'jaune',
    mursSud: [[0, 6], [1, 2], [2, 5], [5, 3], [6, 1], [7, 5]],
    mursEst: [[1, 3], [2, 5], [3, 0], [4, 4], [5, 1], [7, 5]],
    cibles: [
      { en: [1, 3], robot: 'jaune', symbole: 'triangle' },
      { en: [2, 5], robot: 'rouge', symbole: 'hexagone' },
      { en: [5, 4], robot: 'vert', symbole: 'carre' },
      { en: [6, 1], robot: 'bleu', symbole: 'cercle' },
      { en: [7, 5], robot: null, symbole: 'vortex' },
    ],
  },
];

/**
 * Rotation d'un quart de tour horaire.
 *
 * Une case `[c, l]` devient `[7 - l, c]`. Un mur sud devient un mur est, mais sur
 * la case *au-dessus* de la case tournée — d'où le `- 1` : le segment, lui, ne
 * change pas de place.
 */
function tourneUneFois(tuile: Tuile): Tuile {
  const dernier = DEMI - 1;
  return {
    couleur: tuile.couleur,
    // Un mur est devient un mur sud sur la case tournée.
    mursSud: tuile.mursEst.map(([c, l]) => [dernier - l, c] as [number, number]),
    mursEst: tuile.mursSud.map(([c, l]) => [dernier - l - 1, c] as [number, number]),
    cibles: tuile.cibles.map((cible) => ({
      ...cible,
      en: [dernier - cible.en[1], cible.en[0]] as [number, number],
    })),
  };
}

/** Tuile pivotée d'autant de quarts de tour horaires que son coin de destination. */
function tourne(tuile: Tuile, quarts: number): Tuile {
  let resultat = tuile;
  for (let i = 0; i < quarts; i++) resultat = tourneUneFois(resultat);
  return resultat;
}

/** Décalages des quatre coins, dans l'ordre des rotations appliquées. */
const COINS: Array<[number, number]> = [
  [0, 0],
  [DEMI, 0],
  [DEMI, DEMI],
  [0, DEMI],
];

/**
 * Pose un mur en tolérant les coordonnées hors tuile : une rotation peut produire
 * une colonne `-1`, qui désigne alors le mur de la case voisine. Hors plateau, le
 * mur ne ferait que doubler la bordure : on l'ignore.
 */
function poseMurTuile(murs: number[], col: number, lig: number, dir: 'bas' | 'droite'): void {
  const dedans = col >= 0 && col < TAILLE && lig >= 0 && lig < TAILLE;
  if (dedans) {
    poseMur(murs, caseDe(lig, col), dir);
    return;
  }
  const [vc, vl] = dir === 'bas' ? [col, lig + 1] : [col + 1, lig];
  if (vc < 0 || vc >= TAILLE || vl < 0 || vl >= TAILLE) return;
  poseMur(murs, caseDe(vl, vc), OPPOSE[dir]);
}

function casesCentrales(): number[] {
  const a = TAILLE / 2 - 1;
  const b = TAILLE / 2;
  return [caseDe(a, a), caseDe(a, b), caseDe(b, a), caseDe(b, b)];
}

/** Assemble quatre tuiles de couleurs différentes en un plateau 16×16. */
function assemble(tuiles: Tuile[]): Plateau {
  const murs: number[] = new Array<number>(CASES).fill(0);
  const cibles: Cible[] = [];

  tuiles.forEach((tuile, coin) => {
    const pivotee = tourne(tuile, coin);
    const [dc, dl] = COINS[coin];

    for (const [c, l] of pivotee.mursSud) poseMurTuile(murs, c + dc, l + dl, 'bas');
    for (const [c, l] of pivotee.mursEst) poseMurTuile(murs, c + dc, l + dl, 'droite');
    for (const cible of pivotee.cibles) {
      cibles.push({
        pos: caseDe(cible.en[1] + dl, cible.en[0] + dc),
        robot: cible.robot === null ? null : COULEURS.indexOf(cible.robot),
        symbole: SYMBOLES[cible.symbole],
      });
    }
  });

  return { taille: TAILLE, murs, bloquees: casesCentrales(), cibles };
}

/** Tire quatre tuiles de couleurs différentes et les répartit dans les quatre coins. */
function tireTuiles(rng: RNG): Tuile[] {
  const choisies = COULEURS.map((couleur) => {
    const variantes = TUILES.filter((t) => t.couleur === couleur);
    return variantes[Math.floor(rng() * variantes.length)];
  });
  return shuffle(rng, choisies);
}

/** Positions de départ : une case libre par robot, hors centre et hors cible. */
function placeRobots(rng: RNG, plateau: Plateau): number[] {
  const interdites = new Set<number>([
    ...plateau.bloquees,
    ...plateau.cibles.map((c) => c.pos),
  ]);
  const robots: number[] = [];
  while (robots.length < NB_ROBOTS) {
    const pos = Math.floor(rng() * CASES);
    if (interdites.has(pos) || robots.includes(pos)) continue;
    robots.push(pos);
  }
  return robots;
}

/* ===== Solveur =========================================================== */

/**
 * Table de glissade : case suivante dans une direction, ou -1 quand le robot
 * s'arrête (mur, bord, bloc central). Précalculée une fois par parcours : la
 * boucle de glissade devient une suite de lectures dans un `Int16Array`.
 */
function tableGlissade(plateau: Plateau): Int16Array {
  const pas = new Int16Array(4 * CASES).fill(-1);
  const bloquee = new Uint8Array(CASES);
  for (const pos of plateau.bloquees) bloquee[pos] = 1;

  DIRECTIONS.forEach((dir, d) => {
    const bit = MUR_DE[dir];
    const offset = d * CASES;
    for (let pos = 0; pos < CASES; pos++) {
      if (bloquee[pos] === 1) continue;
      if (((plateau.murs[pos] ?? 0) & bit) !== 0) continue;
      const v = voisine(pos, dir);
      if (v < 0 || bloquee[v] === 1) continue;
      pas[offset + pos] = v;
    }
  });
  return pas;
}

/** Aucune case n'est négative : -1 marque un emplacement libre. */
const LIBRE = -1;

/** Mélange les deux moitiés de 32 bits de la clé (murmur3, étage de finalisation). */
function hache(cle: number): number {
  const bas = cle % 0x1_0000_0000;
  const haut = (cle - bas) / 0x1_0000_0000;
  let h = Math.imul(bas ^ 0x9e37_79b9, 0x85eb_ca6b);
  h = Math.imul(h ^ haut ^ (h >>> 13), 0xc2b2_ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * États visités, en adressage ouvert.
 *
 * Un `Set<number>` généraliste domine le coût du parcours : la clé d'un état
 * concatène une case par robot, dépasse donc 32 bits à quatre robots et sort du
 * domaine des petits entiers de V8. Les clés vivent ici dans un `Float64Array`
 * — exactes jusqu'à six robots — et le hachage est fait à la main.
 */
class Visites {
  private cles: Float64Array;
  private masque: number;
  private nb = 0;
  private plafond: number;

  constructor() {
    const taille = 1 << 12;
    this.cles = new Float64Array(taille).fill(LIBRE);
    this.masque = taille - 1;
    this.plafond = (taille * 3) >> 2;
  }

  /** Insère la clé ; retourne `false` si l'état avait déjà été vu. */
  ajoute(cle: number): boolean {
    let i = hache(cle) & this.masque;
    for (;;) {
      const trouvee = this.cles[i];
      if (trouvee === LIBRE) break;
      if (trouvee === cle) return false;
      i = (i + 1) & this.masque;
    }
    this.cles[i] = cle;
    this.nb++;
    if (this.nb >= this.plafond) this.agrandit();
    return true;
  }

  private agrandit(): void {
    const anciennes = this.cles;
    const taille = anciennes.length * 2;
    this.cles = new Float64Array(taille).fill(LIBRE);
    this.masque = taille - 1;
    this.plafond = (taille * 3) >> 2;
    for (const cle of anciennes) {
      if (cle === LIBRE) continue;
      let i = hache(cle) & this.masque;
      while (this.cles[i] !== LIBRE) i = (i + 1) & this.masque;
      this.cles[i] = cle;
    }
  }
}

/** Clé compacte d'une paire (robot, case). */
const cleAtteinte = (robot: number, pos: number) => robot * CASES + pos;

export interface Atteignables {
  /** Profondeur minimale à laquelle chaque paire (robot, case) est atteinte. */
  profondeurs: Map<number, number>;
  /** États développés : permet de répartir un budget sur plusieurs parcours. */
  noeuds: number;
}

/**
 * Parcours en largeur depuis la position de départ : un seul parcours donne la
 * distance minimale vers *toutes* les paires (robot, case) à la fois.
 *
 * Le nombre d'états croît d'environ ×2,3 par coup supplémentaire — d'où les
 * tableaux typés et le budget de nœuds, qui borne le temps de génération.
 */
export function exploreAtteignables(
  plateau: Plateau,
  depart: readonly number[],
  profondeurMax: number,
  budget: number,
): Atteignables {
  const pas = tableGlissade(plateau);
  const n = depart.length;
  const profondeurs = new Map<number, number>();
  const visites = new Visites();
  const occupee = new Uint8Array(CASES);
  const courant = new Int32Array(n);

  depart.forEach((pos, i) => profondeurs.set(cleAtteinte(i, pos), 0));
  let cleDepart = 0;
  for (const pos of depart) cleDepart = cleDepart * CASES + pos;
  visites.ajoute(cleDepart);

  // Les deux frontières sont des tampons réutilisés d'un niveau à l'autre : un
  // niveau profond compte des centaines de milliers d'états, soit autant de
  // tableaux à ramasser si on les alloue un par un.
  let frontiere = new Int32Array(n * 64);
  let suivante = new Int32Array(n * 1024);
  frontiere.set(depart);
  let longueur = n;
  let noeuds = 0;
  let epuise = false;

  for (let p = 1; p <= profondeurMax && longueur > 0 && !epuise; p++) {
    let longueurSuivante = 0;

    for (let base = 0; base < longueur && !epuise; base += n) {
      for (let i = 0; i < n; i++) {
        const pos = frontiere[base + i];
        courant[i] = pos;
        occupee[pos] = 1;
      }

      for (let r = 0; r < n && !epuise; r++) {
        const depuis = courant[r];
        occupee[depuis] = 0;

        for (let d = 0; d < 4; d++) {
          const offset = d * CASES;
          let vers = depuis;
          for (;;) {
            const devant = pas[offset + vers];
            if (devant < 0 || occupee[devant] === 1) break;
            vers = devant;
          }
          if (vers === depuis) continue;

          let cle = 0;
          for (let i = 0; i < n; i++) cle = cle * CASES + (i === r ? vers : courant[i]);
          if (!visites.ajoute(cle)) continue;

          if (longueurSuivante + n > suivante.length) {
            const grande = new Int32Array(suivante.length * 2);
            grande.set(suivante);
            suivante = grande;
          }
          for (let i = 0; i < n; i++) {
            suivante[longueurSuivante + i] = i === r ? vers : courant[i];
          }
          longueurSuivante += n;

          const cleR = cleAtteinte(r, vers);
          if (!profondeurs.has(cleR)) profondeurs.set(cleR, p);

          noeuds++;
          if (noeuds >= budget) {
            epuise = true;
            break;
          }
        }
        occupee[depuis] = 1;
      }

      for (let i = 0; i < n; i++) occupee[courant[i]] = 0;
    }

    const tampon = frontiere;
    frontiere = suivante;
    suivante = tampon;
    longueur = longueurSuivante;
  }

  return { profondeurs, noeuds };
}

export interface Coup {
  robot: number;
  dir: Direction;
}

/**
 * Reconstruit une solution optimale vers une cible donnée — sert à l'indice et à
 * l'écran des solutions, jamais à arbitrer un coup du joueur, qui est rejoué
 * réellement par `deplace()`.
 */
export function trouveSolution(
  plateau: Plateau,
  depart: readonly number[],
  cible: Cible,
  profondeurMax: number,
  budget = 600_000,
): Coup[] | null {
  if (cibleAtteinte(cible, depart)) return [];

  const pas = tableGlissade(plateau);
  const n = depart.length;
  const visites = new Visites();
  const occupee = new Uint8Array(CASES);
  const atteint = (r: number, pos: number) =>
    pos === cible.pos && (cible.robot === null || cible.robot === r);

  /** Positions concaténées de tous les états rencontrés, `n` cases par état. */
  const positions: number[] = [...depart];
  /** Pour chaque état : l'état d'où il vient, et le coup qui y a mené (`robot * 4 + dir`). */
  const parent: number[] = [-1];
  const via: number[] = [-1];
  const courant = new Int32Array(n);

  let cle = 0;
  for (const pos of depart) cle = cle * CASES + pos;
  visites.ajoute(cle);

  let frontiere: number[] = [0];
  let noeuds = 0;

  for (let p = 1; p <= profondeurMax && frontiere.length > 0; p++) {
    const suivante: number[] = [];

    for (const noeud of frontiere) {
      const base = noeud * n;
      for (let i = 0; i < n; i++) {
        const pos = positions[base + i];
        courant[i] = pos;
        occupee[pos] = 1;
      }

      for (let r = 0; r < n; r++) {
        const depuis = courant[r];
        occupee[depuis] = 0;

        for (let d = 0; d < 4; d++) {
          const offset = d * CASES;
          let vers = depuis;
          for (;;) {
            const devant = pas[offset + vers];
            if (devant < 0 || occupee[devant] === 1) break;
            vers = devant;
          }
          if (vers === depuis) continue;

          let cleCoup = 0;
          for (let i = 0; i < n; i++) cleCoup = cleCoup * CASES + (i === r ? vers : courant[i]);
          if (!visites.ajoute(cleCoup)) continue;

          const enfant = parent.length;
          for (let i = 0; i < n; i++) positions.push(i === r ? vers : courant[i]);
          parent.push(noeud);
          via.push(r * 4 + d);

          if (atteint(r, vers)) {
            occupee.fill(0);
            return remonte(parent, via, enfant);
          }

          suivante.push(enfant);
          noeuds++;
          if (noeuds >= budget) {
            occupee.fill(0);
            return null;
          }
        }
        occupee[depuis] = 1;
      }

      for (let i = 0; i < n; i++) occupee[courant[i]] = 0;
    }
    frontiere = suivante;
  }
  return null;
}

function remonte(parent: readonly number[], via: readonly number[], depuis: number): Coup[] {
  const coups: Coup[] = [];
  let curseur = depuis;
  while (curseur > 0) {
    const code = via[curseur];
    coups.unshift({ robot: code >> 2, dir: DIRECTIONS[code & 3] });
    curseur = parent[curseur];
  }
  return coups;
}

/* ===== Génération de l'énigme du jour ==================================== */

export interface Enigme {
  plateau: Plateau;
  /** Positions de départ des quatre robots, index = couleur. */
  depart: number[];
  cible: Cible;
  /** Longueur de la solution optimale : c'est l'objectif annoncé au joueur. */
  optimal: number;
  solution: Coup[];
}

/**
 * Plancher et plafond de la solution optimale, en coups — mêmes ordres de
 * grandeur que le Ricochet Robots du projet Cartel (6 à 8 par défaut). Le
 * plafond du défi s'arrête à 9 : à 10 coups, la génération dépasse la seconde
 * sur la boucle de rendu, et l'épreuve démarrerait sur un à-coup.
 */
const DIFFICULTE = { normal: [6, 8], difficile: [8, 9] } as const;

/**
 * Budget de nœuds partagé par toutes les tentatives : borne le temps de
 * génération quelle que soit la chance du tirage. À défaut d'atteindre le
 * plancher, on sert la meilleure énigme croisée en chemin — une énigme un peu
 * trop facile vaut mieux qu'un écran figé.
 */
const BUDGET = 1_400_000;

/**
 * Tire l'énigme du jour : un plateau, quatre robots, et la cible inédite la plus
 * corsée dont la solution optimale tient dans la fourchette de difficulté. Tant
 * qu'aucune cible ne l'atteint, les robots sont redistribués ; en dernier
 * recours un nouveau plateau est assemblé.
 */
export function genRicochet(rng: RNG, difficile = false): Enigme {
  const [mini, maxi] = DIFFICULTE[difficile ? 'difficile' : 'normal'];
  let restant = BUDGET;
  let meilleure: Enigme | null = null;
  let plateau = assemble(tireTuiles(rng));

  for (let essai = 0; essai < 24 && restant > 0; essai++) {
    // Tous les 4 essais infructueux, on repart d'un plateau neuf plutôt que de
    // s'acharner sur une configuration de murs peu généreuse.
    if (essai > 0 && essai % 4 === 0) plateau = assemble(tireTuiles(rng));
    const depart = placeRobots(rng, plateau);

    const { profondeurs, noeuds } = exploreAtteignables(plateau, depart, maxi, restant);
    restant -= noeuds;

    // Profondeur de chaque cible : pour le vortex, c'est le robot le mieux placé.
    const candidates = plateau.cibles
      .map((cible) => {
        const profs =
          cible.robot === null
            ? COULEURS.map((_, r) => profondeurs.get(cleAtteinte(r, cible.pos)))
            : [profondeurs.get(cleAtteinte(cible.robot, cible.pos))];
        const dispo = profs.filter((p): p is number => p !== undefined && p > 0);
        return dispo.length === 0 ? null : { cible, prof: Math.min(...dispo) };
      })
      .filter((c): c is { cible: Cible; prof: number } => c !== null && c.prof <= maxi);

    if (candidates.length === 0) continue;

    // La plus corsée d'abord ; à profondeur égale, tirage au sort.
    const profMax = Math.max(...candidates.map((c) => c.prof));
    const exaequo = shuffle(rng, candidates.filter((c) => c.prof === profMax));
    const { cible, prof } = exaequo[0];

    const solution = trouveSolution(plateau, depart, cible, prof);
    if (!solution || solution.length !== prof) continue;

    const enigme: Enigme = { plateau, depart, cible, optimal: prof, solution };
    if (prof >= mini) return enigme;
    if (!meilleure || prof > meilleure.optimal) meilleure = enigme;
  }

  // Budget épuisé sans atteindre le plancher : la meilleure énigme croisée fait
  // l'affaire. Le cas est théorique — il faudrait deux douzaines de tirages secs.
  if (meilleure) return meilleure;
  const depart = placeRobots(rng, plateau);
  const cible = plateau.cibles[0];
  const solution = trouveSolution(plateau, depart, cible, 8) ?? [];
  return { plateau, depart, cible, optimal: Math.max(1, solution.length), solution };
}
