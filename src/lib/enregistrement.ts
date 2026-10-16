import type { GameLine } from './storage';

/**
 * Enregistrement d'un run, pour le revoir après coup.
 *
 * Rien de l'état des mini-jeux n'est stocké : la grille se régénère depuis la
 * même graine que le run, il suffit donc de garder **les gestes du joueur**,
 * horodatés depuis le montage de l'épreuve. À la relecture, l'épreuve est
 * remontée avec la même graine et chaque geste lui est renvoyé sous forme
 * d'événement DOM synthétique, sur le même élément — le même tirage plus les
 * mêmes gestes redonnent la même partie, sans qu'aucun jeu ait à exposer quoi
 * que ce soit.
 *
 * Un élément est désigné par son chemin d'indices depuis la racine de
 * l'épreuve (identique d'un montage à l'autre, puisque le rendu l'est), et un
 * pointeur par sa position relative à cet élément, en millièmes : le plateau
 * se redimensionne avec la fenêtre (`--case`), la position relative, elle, ne
 * bouge pas. Exception, les widgets tiers (carte Leaflet, panorama Mapillary)
 * dont le DOM interne varie au gré du réseau : marqués
 * `data-enregistrement="zone"`, ils sont adressés par un point de la zone,
 * résolu à la relecture par `elementFromPoint`.
 */

/** `[dt, type, cible, …données]` : dt en ms depuis l'événement précédent. */
export type Evenement = (number | string)[];

export interface JournalEpreuve {
  id: string;
  /** Durée enregistrée, du montage de l'épreuve à sa fin (ms). */
  ms: number;
  /** Épreuve reprise après une interruption : seul le dernier essai est enregistré. */
  reprise?: boolean;
  /** Plafond d'événements atteint : la fin de l'épreuve manque. */
  tronque?: boolean;
  ev: Evenement[];
}

export interface Enregistrement {
  v: 1;
  date: string;
  defi: boolean;
  totalMs: number;
  lines: GameLine[];
  epreuves: JournalEpreuve[];
}

const CODES: Record<string, string> = {
  pointerdown: 'pd',
  pointerup: 'pu',
  pointercancel: 'pc',
  pointermove: 'pm',
  click: 'c',
  dblclick: 'dc',
  contextmenu: 'cm',
  mousedown: 'md',
  mouseup: 'mu',
  mousemove: 'mm',
  keydown: 'kd',
  keyup: 'ku',
  input: 'in',
  change: 'ch',
  wheel: 'w',
};
const TYPES = Object.fromEntries(Object.entries(CODES).map(([t, c]) => [c, t]));

/** Écoutés hors de l'épreuve : les jeux qui suivent le clavier ou le relâcher
 *  sur `window` (Tempo, Sudoku, Le Mot…) les reçoivent d'où qu'ils viennent. */
const HORS_RACINE = new Set(['keydown', 'keyup', 'pointerup', 'pointercancel']);
/** Les événements souris « bruts » ne servent qu'aux widgets tiers : les jeux
 *  maison écoutent les événements pointeur, et `click`. */
const SOURIS_BRUTE = new Set(['mousedown', 'mouseup', 'mousemove']);
const MOUVEMENTS = new Set(['pointermove', 'mousemove']);

const CIBLE_DOCUMENT = 'D';
const PREFIXE_ZONE = '@';
const SELECTEUR_ZONE = '[data-enregistrement="zone"]';

const MAX_EVENEMENTS = 4000;
const PAS_MOUVEMENT_MS = 30;
const MAX_VALEUR = 200;

function chemin(racine: Element, el: Element): string | null {
  const idx: number[] = [];
  let n: Element = el;
  while (n !== racine) {
    const p = n.parentElement;
    if (!p) return null;
    idx.push(Array.prototype.indexOf.call(p.children, n));
    n = p;
  }
  return idx.reverse().join('.');
}

function resout(racine: Element, ch: string): Element | null {
  let n: Element | undefined = racine;
  if (ch === '') return n;
  for (const i of ch.split('.')) {
    n = n.children[Number(i)];
    if (!n) return null;
  }
  return n;
}

const pourMille = (v: number, debut: number, taille: number) =>
  taille > 0 ? Math.round(((v - debut) / taille) * 1000) : 500;

function mods(e: KeyboardEvent): number {
  return (
    (e.shiftKey ? 1 : 0) |
    (e.ctrlKey ? 2 : 0) |
    (e.altKey ? 4 : 0) |
    (e.metaKey ? 8 : 0) |
    (e.repeat ? 16 : 0)
  );
}

export interface Enregistreur {
  /** Arrête l'écoute et rend le journal (idempotent). */
  arrete(): JournalEpreuve;
}

/**
 * Enregistre les gestes du joueur sur l'épreuve montée sous `racine`. Écoute
 * en phase de capture sur `window`, donc avant tout gestionnaire du jeu : un
 * jeu qui stoppe la propagation n'échappe pas à l'enregistrement. Seuls les
 * événements de confiance (`isTrusted`) comptent — ceux qu'un jeu émet
 * lui-même se reproduiront d'eux-mêmes à la relecture.
 */
export function enregistre(racine: HTMLElement, id: string, reprise: boolean): Enregistreur {
  const t0 = performance.now();
  let precedent = t0;
  let dernierMouvement = -Infinity;
  let sousDernier: Element | null = null;
  const ev: Evenement[] = [];
  let tronque = false;
  let journal: JournalEpreuve | null = null;
  // Mouvement écarté par l'échantillonnage, gardé au cas où il serait le
  // dernier avant un relâcher : c'est souvent lui qui fixe la position finale
  // d'un glisser (Ratiole coupe là où le pointeur a bougé en dernier).
  let differe: { t: number; e: Evenement } | null = null;

  const ajoute = (t: number, e: Evenement) => {
    e[0] = Math.round(t - precedent);
    precedent = t;
    ev.push(e);
    if (ev.length >= MAX_EVENEMENTS) tronque = true;
  };

  const ecoute = (e: Event) => {
    if (!e.isTrusted || tronque) return;
    const el = e.target instanceof Element ? e.target : null;
    const dedans = !!el && racine.contains(el);
    if (!dedans && !HORS_RACINE.has(e.type)) return;
    const zone = dedans ? el!.closest(SELECTEUR_ZONE) : null;
    const enZone = !!zone && racine.contains(zone);
    if (SOURIS_BRUTE.has(e.type) && !enZone) return;

    const maintenant = performance.now();
    const mouvement = MOUVEMENTS.has(e.type);
    // Seuls les glisser comptent (bouton enfoncé ou doigt posé)
    if (mouvement && (e as MouseEvent).buttons === 0) return;

    let cible: string;
    let repere: Element | null = null;
    if (!dedans) {
      cible = CIBLE_DOCUMENT;
    } else if (enZone) {
      const ch = chemin(racine, zone!);
      if (ch == null) return;
      cible = PREFIXE_ZONE + ch;
      repere = zone;
    } else {
      const ch = chemin(racine, el!);
      if (ch == null) return;
      cible = ch;
      repere = el;
    }

    const code = CODES[e.type];
    let donnees: (number | string)[] = [];
    if (e instanceof MouseEvent) {
      const r = repere?.getBoundingClientRect();
      const x = r ? pourMille(e.clientX, r.left, r.width) : 0;
      const y = r ? pourMille(e.clientY, r.top, r.height) : 0;
      if (e instanceof WheelEvent) donnees = [x, y, Math.round(e.deltaY), e.deltaMode];
      else if (e instanceof PointerEvent)
        donnees = [x, y, e.buttons, e.button, e.pointerType === 'touch' ? 't' : e.pointerType === 'pen' ? 'p' : 'm'];
      else donnees = [x, y, e.buttons, e.button];
    } else if (e instanceof KeyboardEvent) {
      donnees = [e.key, e.code, mods(e)];
    } else if (e.type === 'input') {
      const v = (el as HTMLInputElement).value;
      if (typeof v !== 'string') return;
      donnees = [v.slice(0, MAX_VALEUR)];
    } else if (e.type === 'change') {
      // Les cases à cocher passent par `click` ; seuls les menus déroulants restent.
      if (!(el instanceof HTMLSelectElement)) return;
      donnees = [el.value];
    }
    const entree: Evenement = [0, code, cible, ...donnees];
    if (mouvement) {
      // Échantillonné, sauf quand le pointeur change d'élément : un glisser
      // rapide qui peint des cases (Nonogramme) n'en saute aucune. Le plus
      // récent écarté attend le prochain événement.
      const me = e as MouseEvent;
      const sous = document.elementFromPoint(me.clientX, me.clientY);
      if (maintenant - dernierMouvement < PAS_MOUVEMENT_MS && sous === sousDernier) {
        differe = { t: maintenant, e: entree };
        return;
      }
      dernierMouvement = maintenant;
      sousDernier = sous;
      differe = null;
    } else if (differe) {
      ajoute(differe.t, differe.e);
      differe = null;
      if (tronque) return;
    }
    ajoute(maintenant, entree);
  };

  const types = Object.keys(CODES);
  const opts = { capture: true, passive: true };
  for (const t of types) window.addEventListener(t, ecoute, opts);

  return {
    arrete() {
      if (!journal) {
        for (const t of types) window.removeEventListener(t, ecoute, opts);
        journal = { id, ms: Math.round(performance.now() - t0), ev };
        if (reprise) journal.reprise = true;
        if (tronque) journal.tronque = true;
      }
      return journal;
    },
  };
}

/* ===== Relecture ===== */

function poseValeur(el: Element, v: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  // Le setter natif, et non `el.value = …` : React suit la valeur des champs
  // contrôlés et ignorerait un événement dont la valeur n'a pas « changé ».
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v);
}

/** Renvoie un geste enregistré à l'épreuve montée sous `racine`. */
export function rejoue(racine: HTMLElement, e: Evenement) {
  const [, code, cible, ...d] = e as [number, string, string, ...(number | string)[]];
  const type = TYPES[code];
  if (!type) return;

  let el: Element | null;
  let x = 0;
  let y = 0;
  // Point du geste, ramené à l'écran au besoin : plusieurs jeux retrouvent la
  // case visée par `elementFromPoint`, qui ne voit rien hors de la fenêtre.
  const place = (repere: Element) => {
    const point = () => {
      const r = repere.getBoundingClientRect();
      x = r.left + ((d[0] as number) / 1000) * r.width;
      y = r.top + ((d[1] as number) / 1000) * r.height;
    };
    point();
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
      repere.scrollIntoView({ block: 'center', inline: 'nearest' });
      point();
    }
  };
  if (cible === CIBLE_DOCUMENT) {
    el = document.body;
  } else if (cible.startsWith(PREFIXE_ZONE)) {
    const zone = resout(racine, cible.slice(1));
    if (!zone) return;
    place(zone);
    const sous = document.elementFromPoint(x, y);
    el = sous && zone.contains(sous) ? sous : zone;
  } else {
    el = resout(racine, cible);
    if (!el) return;
    if (typeof d[0] === 'number' && typeof d[1] === 'number') place(el);
  }
  if (!el) return;
  // Un enregistrement venu du serveur n'est pas de confiance : un clic
  // synthétique sur un lien le suivrait (attribution d'un widget tiers).
  if ((code === 'c' || code === 'dc') && el.closest('a[href]')) return;

  const commun = { bubbles: true, cancelable: true, composed: true, view: window };
  let evt: Event;
  switch (code) {
    case 'pd':
    case 'pu':
    case 'pc':
    case 'pm':
      evt = new PointerEvent(type, {
        ...commun,
        clientX: x,
        clientY: y,
        buttons: d[2] as number,
        button: d[3] as number,
        pointerId: 1,
        isPrimary: true,
        pointerType: d[4] === 't' ? 'touch' : d[4] === 'p' ? 'pen' : 'mouse',
      });
      break;
    case 'w':
      evt = new WheelEvent(type, {
        ...commun,
        clientX: x,
        clientY: y,
        deltaY: d[2] as number,
        deltaMode: d[3] as number,
      });
      break;
    case 'kd':
    case 'ku': {
      const m = d[2] as number;
      evt = new KeyboardEvent(type, {
        ...commun,
        key: d[0] as string,
        code: d[1] as string,
        shiftKey: !!(m & 1),
        ctrlKey: !!(m & 2),
        altKey: !!(m & 4),
        metaKey: !!(m & 8),
        repeat: !!(m & 16),
      });
      break;
    }
    case 'in':
      poseValeur(el, d[0] as string);
      evt = new Event('input', { bubbles: true });
      break;
    case 'ch':
      poseValeur(el, d[0] as string);
      evt = new Event('change', { bubbles: true });
      break;
    default:
      evt = new MouseEvent(type, {
        ...commun,
        clientX: x,
        clientY: y,
        buttons: d[2] as number,
        button: d[3] as number,
        detail: code === 'dc' ? 2 : 1,
      });
  }
  el.dispatchEvent(evt);
}

/**
 * Forme minimale d'un enregistrement (ceux du serveur ne sont pas de
 * confiance) : 7 épreuves aux ids connus, chacune avec sa ligne de run.
 */
export function estEnregistrement(x: unknown, connu: (id: string) => boolean): x is Enregistrement {
  const e = x as Enregistrement;
  return (
    !!e &&
    e.v === 1 &&
    typeof e.date === 'string' &&
    Array.isArray(e.epreuves) &&
    Array.isArray(e.lines) &&
    e.epreuves.length === e.lines.length &&
    e.epreuves.length > 0 &&
    e.epreuves.every(
      (j, i) =>
        !!j &&
        typeof j.id === 'string' &&
        connu(j.id) &&
        j.id === e.lines[i]?.id &&
        typeof j.ms === 'number' &&
        Array.isArray(j.ev) &&
        j.ev.every((v) => Array.isArray(v) && typeof v[0] === 'number' && typeof v[2] === 'string'),
    )
  );
}

/** Écart au-delà duquel un temps mort peut être raccourci, et sa durée réduite. */
const SEUIL_TEMPS_MORT_MS = 5000;
const TEMPS_MORT_REDUIT_MS = 2500;

export interface Pas {
  /** Instant de l'événement dans le run (ms depuis le montage de l'épreuve). */
  t: number;
  e: Evenement;
  /** L'attente qui précède cet événement peut être raccourcie. */
  compressible: boolean;
}

/**
 * Chronologie d'une épreuve : instants absolus, et pour chaque attente la
 * possibilité de la raccourcir. Jamais pendant un appui (un bouton, une touche
 * ou un doigt tenu : sa durée peut être le geste lui-même, cf. Tempo), ni
 * pour un jeu `tempsReel`. La dernière entrée est la fin de l'épreuve.
 */
export function chronologie(j: JournalEpreuve, tempsReel: boolean): Pas[] {
  const pas: Pas[] = [];
  let t = 0;
  const tenus = new Set<string>();
  const accelerable = (dt: number) => !tempsReel && tenus.size === 0 && dt > SEUIL_TEMPS_MORT_MS;
  for (const e of j.ev) {
    const dt = e[0] as number;
    t += dt;
    pas.push({ t, e, compressible: accelerable(dt) });
    const code = e[1];
    if (code === 'pd' || code === 'md') tenus.add('p');
    else if (code === 'pu' || code === 'pc' || code === 'mu') tenus.delete('p');
    else if (code === 'kd') tenus.add(`k${e[4]}`);
    else if (code === 'ku') tenus.delete(`k${e[4]}`);
  }
  const fin = Math.max(t, j.ms);
  pas.push({ t: fin, e: [], compressible: accelerable(fin - t) });
  return pas;
}

/** Vitesse de lecture de l'attente qui mène au pas `k`. */
export function cadence(pas: Pas[], k: number, accelere: boolean): number {
  const p = pas[k];
  if (!accelere || !p?.compressible) return 1;
  const dt = p.t - (k > 0 ? pas[k - 1].t : 0);
  return dt / TEMPS_MORT_REDUIT_MS;
}

const BLOQUES_PARTOUT = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointercancel',
  'mousedown',
  'mouseup',
  'mousemove',
  'keydown',
  'keyup',
  'keypress',
];
const BLOQUES_DEDANS = ['click', 'dblclick', 'auxclick', 'contextmenu', 'wheel', 'beforeinput', 'input'];

/**
 * Pendant une relecture, l'épreuve n'obéit qu'aux gestes enregistrés : les
 * vrais gestes sont arrêtés en capture sur `window`, avant tout gestionnaire.
 * Clavier et pointeur le sont **partout**, car plusieurs jeux les écoutent sur
 * `window` (un relâcher n'importe où finirait un appui de Tempo) ; sans
 * `preventDefault` hors de l'épreuve, de sorte que les boutons du lecteur
 * restent cliquables et activables au clavier. Les gestes synthétiques
 * (`isTrusted` faux) passent.
 *
 * Neutralise aussi `setPointerCapture` : appelé sur un pointeur synthétique,
 * il lève une exception (aucun pointeur actif ne porte cet id).
 */
export function modeLecture(racine: HTMLElement): () => void {
  const arrete = (e: Event) => {
    if (!e.isTrusted) return;
    const dedans = e.target instanceof Node && racine.contains(e.target);
    if (dedans) e.preventDefault();
    if (dedans || BLOQUES_PARTOUT.includes(e.type)) e.stopImmediatePropagation();
  };
  const opts = { capture: true, passive: false };
  for (const t of [...BLOQUES_PARTOUT, ...BLOQUES_DEDANS]) window.addEventListener(t, arrete, opts);

  const proto = Element.prototype;
  const capture = proto.setPointerCapture;
  const libere = proto.releasePointerCapture;
  proto.setPointerCapture = function (id: number) {
    try {
      capture.call(this, id);
    } catch {
      /* pointeur synthétique */
    }
  };
  proto.releasePointerCapture = function (id: number) {
    try {
      libere.call(this, id);
    } catch {
      /* pointeur synthétique */
    }
  };

  return () => {
    for (const t of [...BLOQUES_PARTOUT, ...BLOQUES_DEDANS])
      window.removeEventListener(t, arrete, opts);
    proto.setPointerCapture = capture;
    proto.releasePointerCapture = libere;
  };
}

/* ===== Stockage local ===== */

const K_ENREG = 'game7le:enregistrements';
const K_ENREG_ENCOURS = 'game7le:enregistrements-encours';
/** Enregistrements gardés en local (les plus récents). */
const MAX_LOCAUX = 30;
/** Au-delà, l'enregistrement n'est ni stocké ni envoyé (taille JSON). */
export const TAILLE_MAX = 250_000;
const ENCOURS_TTL_MS = 8 * 24 * 3600 * 1000;

const cle = (date: string, defi: boolean, enDirect: boolean) =>
  `${defi ? 'defi:' : ''}${date}${enDirect ? '' : '#archive'}`;

interface Stocke {
  enr: Enregistrement;
  majAt: number;
}

function charge<T>(k: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(k) || '{}');
  } catch {
    return {};
  }
}

function ecrit(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // quota dépassé : l'enregistrement est un bonus, le run, lui, est sauvé
  }
}

export function tailleEnregistrement(e: Enregistrement): number {
  return JSON.stringify(e).length;
}

/** Enregistrement du run gardé pour ce jour et ce type (direct / archive). */
export function saveEnregistrement(e: Enregistrement, enDirect: boolean): void {
  if (tailleEnregistrement(e) > TAILLE_MAX) return;
  const tout = charge<Stocke>(K_ENREG);
  tout[cle(e.date, e.defi, enDirect)] = { enr: e, majAt: Date.now() };
  const gardes = Object.entries(tout)
    .sort(([, a], [, b]) => b.majAt - a.majAt)
    .slice(0, MAX_LOCAUX);
  ecrit(K_ENREG, Object.fromEntries(gardes));
}

/** Enregistrement local d'un jour : celui du run en direct, sinon de l'archive. */
export function loadEnregistrement(date: string, defi: boolean): Enregistrement | null {
  const tout = charge<Stocke>(K_ENREG);
  return (tout[cle(date, defi, true)] ?? tout[cle(date, defi, false)])?.enr ?? null;
}

/** Jours (quotidiens) ayant un enregistrement local. */
export function joursEnregistres(): Set<string> {
  return new Set(
    Object.values(charge<Stocke>(K_ENREG))
      .filter((s) => !s.enr.defi)
      .map((s) => s.enr.date),
  );
}

/* Journaux des épreuves déjà bouclées d'un run en cours : la reprise d'un run
   interrompu les retrouve (l'épreuve en cours, elle, repart de zéro). */

interface EnCours {
  journaux: JournalEpreuve[];
  majAt: number;
}

export function saveJournauxEnCours(date: string, defi: boolean, journaux: JournalEpreuve[]) {
  const tout = charge<EnCours>(K_ENREG_ENCOURS);
  const now = Date.now();
  for (const [k, c] of Object.entries(tout)) if (now - c.majAt > ENCOURS_TTL_MS) delete tout[k];
  tout[cle(date, defi, true)] = { journaux, majAt: now };
  ecrit(K_ENREG_ENCOURS, tout);
}

export function loadJournauxEnCours(date: string, defi: boolean): JournalEpreuve[] {
  return charge<EnCours>(K_ENREG_ENCOURS)[cle(date, defi, true)]?.journaux ?? [];
}

export function clearJournauxEnCours(date: string, defi: boolean) {
  const tout = charge<EnCours>(K_ENREG_ENCOURS);
  delete tout[cle(date, defi, true)];
  ecrit(K_ENREG_ENCOURS, tout);
}

export function resetEnregistrements() {
  localStorage.removeItem(K_ENREG);
  localStorage.removeItem(K_ENREG_ENCOURS);
}
