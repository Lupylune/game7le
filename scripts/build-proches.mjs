/**
 * Génère src/data/proches.ts : les « mots de sens proche » d'Encyclo.
 * Usage : node scripts/build-proches.mjs   (après build-encyclo.mjs)
 *         cache : /tmp/proches-cache.json
 *
 * Objectif : reconnaître qu'« monarque » désigne le mot caché « roi », ce que la
 * seule parenté de forme (radical commun) ne peut pas voir. Plutôt que
 * d'embarquer un modèle de vecteurs de mots (≈ 3 Mo minimum côté client, cf.
 * discussion du 2026-07-28), on précalcule ici des relations lexicales
 * explicites, et on n'expédie que celles qui concernent les mots réellement
 * présents dans les articles d'Encyclo.
 *
 * Chaîne de traitement :
 * 1. lire les articles de src/data/encyclo.ts et en extraire les formes à deviner ;
 * 2. les lemmatiser avec Lexique 3.83 (forme → lemme + catégorie), ce qui écarte
 *    au passage les noms propres, absents de Lexique et sans synonyme utile ;
 * 3. relever sur le Wiktionnaire français les synonymes, quasi-synonymes,
 *    hyperonymes et hyponymes de chaque lemme (pas les dérivés : purement
 *    morphologiques, ils ne disent rien du sens — « laiterie » pour « lait ») ;
 * 4. écrire l'index **inversé** — mot que le joueur peut taper → formes du texte
 *    à dévoiler —, seul sens dans lequel le jeu l'interroge.
 *
 * Deux filtres font l'essentiel de la qualité :
 * - côté clé (ce que le joueur tape) : le mot doit être assez fréquent dans
 *   Lexique, sinon personne ne le proposera jamais ;
 * - côté cible (le mot dévoilé) : noms et adjectifs seulement. Les verbes
 *   conjugués d'une intro encyclopédique ne se devinent pas par synonyme et
 *   produisent des rapprochements absurdes (« trépasser » → « passions », via
 *   le lemme « passer »).
 *
 * Les relations déjà couvertes par le radical commun (5 premières lettres) sont
 * omises : elles seraient du poids mort dans le bundle.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ENCYCLO = new URL('../src/data/encyclo.ts', import.meta.url);
const SORTIE = new URL('../src/data/proches.ts', import.meta.url);
const TSV = '/tmp/lexique383.tsv';
const TSV_URL = 'http://www.lexique.org/databases/Lexique383/Lexique383.tsv';
const CACHE = '/tmp/proches-cache.json';
const UA = 'game7le-build/1.0 (génération de données de jeu, usage non commercial)';

const MAX_PAR_LEMME = 12; // au-delà, on aide plus qu'on ne fait deviner
const LONGUEUR_MIN = 4; // mots courts : trop ambigus, trop peu discriminants
// Fréquence Lexique (occurrences par million) sous laquelle un mot ne sera jamais
// tapé par un joueur : « médersa », « zoobotanique », « surfinancer »… Sans ce
// filtre, 90 % de l'index est du poids mort.
const FREQ_MIN_CLE = 0.4;

// Même liste que src/games/Encyclo.tsx (mots dévoilés d'emblée) : inutile de
// chercher des synonymes à « dans » ou « été ».
const GRAMMATICAUX = new Set(
  (
    "le la les l un une des de du d et ou a au aux en y est sont etait etaient ete " +
    "sera etre par pour dans sur sous vers avec sans que qui quoi dont ne pas plus " +
    "se s sa son ses leur leurs ce c cet cette ces il elle ils elles on nous vous je " +
    "tu me te mon ma mes ton ta tes notre votre comme mais donc car ni or ainsi " +
    "entre apres avant depuis lors selon chez jusqu qu si aussi ont avait a"
  ).split(' '),
);

// Le Wiktionnaire range les termes injurieux et argotiques parmi les synonymes
// (« boche », « fritz », « frisé » pour « allemand ») ; les modèles de registre
// qui les marquent ne sont pas conservés dans le cache, d'où cette liste
// explicite — même parti pris que le `EXCLUS` de build-defs.mjs. Volontairement
// limitée aux termes sans emploi neutre : exclure « jaune » ou « melon » ferait
// perdre des relations légitimes.
const CLES_EXCLUES = new Set(
  (
    "boche fritz frise chleuh rital macaroni espingouin amerloque angliche rosbif " +
    "polack youpin feuj negro negre bicot bougnoule niakoue chinetoque romanichel " +
    "pede tapette gouine salope connard pouffiasse morbleu"
  ).split(' '),
);

const clef = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const radical = (k) => k.slice(0, 5);
const sansPluriel = (k) => (k.length > 3 ? k.replace(/[sx]$/, '') : k);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1. Formes à couvrir --------------------------------------------------

const src = readFileSync(ENCYCLO, 'utf8');
const articles = [
  ...src.matchAll(/titre:\s*("(?:[^"\\]|\\.)*"),\s*texte:\s*("(?:[^"\\]|\\.)*")/g),
].map((m) => `${JSON.parse(m[1])} ${JSON.parse(m[2])}`);
if (!articles.length) throw new Error('aucun article lu — lancer build-encyclo.mjs d’abord');

// forme minuscule accentuée (telle que dans Lexique) -> clé normalisée du jeu
const formes = new Map();
for (const texte of articles) {
  for (const m of texte.matchAll(/[\p{L}]+/gu)) {
    const forme = m[0].toLowerCase();
    const k = clef(forme);
    if (k.length >= LONGUEUR_MIN && !GRAMMATICAUX.has(k)) formes.set(forme, k);
  }
}
console.log(`${articles.length} articles → ${formes.size} formes distinctes à couvrir`);

// --- 2. Lemmatisation via Lexique 3.83 ------------------------------------

if (!existsSync(TSV)) {
  console.log('Téléchargement de Lexique 3.83…');
  execSync(`curl -sL --max-time 180 "${TSV_URL}" -o ${TSV}`);
}

const lignes = readFileSync(TSV, 'utf8').split('\n');
const entete = lignes[0].split('\t');
const [cOrtho, cLemme, cCgram, cFreqF, cFreqL] = [
  'ortho', 'lemme', 'cgram', 'freqfilms2', 'freqlivres',
].map((n) => entete.indexOf(n));

// lemme -> formes du texte qu'il faudra dévoiler (plusieurs flexions possibles)
const parLemme = new Map();
// clé normalisée -> fréquence max observée, pour juger si un mot est « tapable »
const freqParClef = new Map();
for (let i = 1; i < lignes.length; i++) {
  const f = lignes[i].split('\t');
  if (f.length < 10) continue;
  const forme = f[cOrtho];
  const freq = Math.max(Number(f[cFreqF]) || 0, Number(f[cFreqL]) || 0);
  const k = clef(forme);
  if (freq > (freqParClef.get(k) ?? 0)) freqParClef.set(k, freq);
  if (!formes.has(forme)) continue;
  // Noms et adjectifs seulement : voir l'en-tête (« trépasser » → « passions »).
  if (!/^(NOM|ADJ)/.test(f[cCgram])) continue;
  const lemme = f[cLemme];
  if (!lemme || /[^a-zà-öø-ÿ]/i.test(lemme)) continue; // locutions et sigles écartés
  if (!parLemme.has(lemme)) parLemme.set(lemme, new Set());
  parLemme.get(lemme).add(formes.get(forme));
}
console.log(`${parLemme.size} lemmes à interroger sur le Wiktionnaire`);

// --- 3. Relations lexicales du Wiktionnaire -------------------------------

// Sections retenues, du sens le plus proche au plus lâche : c'est aussi l'ordre
// dans lequel on tronque à MAX_PAR_LEMME.
const SECTIONS = ['synonymes', 'quasi-synonymes', 'hyperonymes', 'hyponymes'];

/** Liens d'une section de relations, dans la partie française de la page. */
function relations(wikitexte) {
  const debut = wikitexte.indexOf('== {{langue|fr}} ==');
  if (debut === -1) return [];
  let fr = wikitexte.slice(debut + 19);
  const suivante = fr.indexOf('== {{langue|');
  if (suivante !== -1) fr = fr.slice(0, suivante);

  const out = [];
  for (const section of SECTIONS) {
    // Titre de sous-section : `=== {{S|synonymes}} ===`, parfois `==== … ====`.
    const re = new RegExp(`={3,4}\\s*\\{\\{S\\|${section}[^}]*\\}\\}\\s*={3,4}`, 'g');
    for (const m of fr.matchAll(re)) {
      const corps = fr.slice(m.index + m[0].length);
      const fin = corps.search(/\n={2,4}[^=]/);
      const bloc = fin === -1 ? corps : corps.slice(0, fin);
      for (const l of bloc.split('\n')) {
        if (!l.startsWith('*')) continue;
        // `[[mot]]`, `[[cible|affiché]]` et `{{lien|mot|fr}}`
        for (const lien of l.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]|\{\{lien\|([^|}]+)/g))
          out.push({ mot: (lien[1] ?? lien[2]).trim(), section });
      }
    }
  }
  return out;
}

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const lemmes = [...parLemme.keys()].sort();
const manquants = lemmes.filter((l) => !(l in cache));
console.log(`À récupérer : ${manquants.length} (cache : ${Object.keys(cache).length})`);

const LOT = 20;
for (let i = 0; i < manquants.length; i += LOT) {
  const lot = manquants.slice(i, i + LOT);
  const url =
    'https://fr.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content' +
    `&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(lot.join('|'))}`;
  let essais = 0;
  for (;;) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const pages = j?.query?.pages ?? [];
      // L'API renvoie parfois le titre normalisé plutôt que celui demandé.
      const alias = new Map((j?.query?.normalized ?? []).map((n) => [n.from, n.to]));
      const contenu = new Map(
        pages.map((p) => [p.title, p.missing ? '' : (p.revisions?.[0]?.slots?.main?.content ?? '')]),
      );
      // Un titre absent de la réponse (lot tronqué) ne doit PAS être mis en cache
      // comme « sans relation » : on le laisse manquant pour qu'une relance le reprenne.
      let omis = 0;
      for (const l of lot) {
        const t = alias.get(l) ?? l;
        if (!contenu.has(t)) {
          omis++;
          continue;
        }
        // Le cache mémorise les relations brutes : refiltrer ne coûte alors rien.
        cache[l] = relations(contenu.get(t));
      }
      if (omis) console.log(`  lot ${i} : ${omis} titre(s) non renvoyés — à reprendre en relançant`);
      break;
    } catch (e) {
      if (++essais >= 6) {
        console.log(`  lot ${i} abandonné (${e.message}) — une relance le réessaiera`);
        break;
      }
      const attente = /429/.test(e.message) ? 40000 : 5000;
      console.log(`  lot ${i} : ${e.message}, nouvel essai dans ${attente / 1000} s`);
      await pause(attente);
    }
  }
  writeFileSync(CACHE, JSON.stringify(cache));
  if (i % (LOT * 10) === 0) console.log(`  …${Math.min(i + LOT, manquants.length)}/${manquants.length}`);
  await pause(600);
}

// --- 4. Index inversé -----------------------------------------------------

const CIBLE_VALIDE = /^[a-zà-öø-ÿ]+$/;
// clé tapée par le joueur -> formes du texte à dévoiler
const index = new Map();
let relationsGardees = 0;
const rejets = { forme: 0, rare: 0, radical: 0, plafond: 0 };

for (const [lemme, ciblesTexte] of parLemme) {
  const vues = new Set();
  let gardees = 0;
  for (const { mot } of (cache[lemme] ?? []).sort(
    (a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section),
  )) {
    if (gardees >= MAX_PAR_LEMME) {
      rejets.plafond++;
      continue;
    }
    const bas = mot.toLowerCase();
    if (!CIBLE_VALIDE.test(bas)) {
      rejets.forme++; // locutions, mots à trait d'union, alphabets étrangers
      continue;
    }
    const k = clef(bas);
    if (k.length < LONGUEUR_MIN || GRAMMATICAUX.has(k) || vues.has(k) || CLES_EXCLUES.has(k)) {
      rejets.forme++;
      continue;
    }
    // Mot que personne ne tapera (trop rare, ou absent de Lexique : étranger,
    // néologisme, entrée exotique du Wiktionnaire).
    if ((freqParClef.get(k) ?? 0) < FREQ_MIN_CLE) {
      rejets.rare++;
      continue;
    }
    // Écartés : ce que le jeu déduit déjà (radical commun) et les fausses
    // relations où l'un des deux mots contient l'autre — le Wiktionnaire range
    // parfois un dérivé parmi les hyponymes (« journaliste » sous « jour »,
    // « immonde » sous « monde », « maintien » sous « main »).
    // Comparaison au singulier : sans ça « bientôt » passait sous « biens » et
    // « ressaut » sous « sauts ».
    const ks = sansPluriel(k);
    const utiles = [...ciblesTexte].filter((c) => {
      const cs = sansPluriel(c);
      return radical(c) !== radical(k) && cs !== ks && !cs.includes(ks) && !ks.includes(cs);
    });
    if (!utiles.length) {
      rejets.radical++;
      continue;
    }
    vues.add(k);
    gardees++;
    relationsGardees++;
    if (!index.has(k)) index.set(k, new Set());
    for (const c of utiles) index.get(k).add(c);
  }
}

// Un mot qui dévoilerait un grand nombre de formes différentes n'est plus un
// indice mais un passe-partout (« chose », « personne ») : on l'écarte.
const MAX_CIBLES = 6;
let passePartout = 0;
const entrees = [...index.entries()]
  .filter(([, cibles]) => {
    if (cibles.size <= MAX_CIBLES) return true;
    passePartout++;
    return false;
  })
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, cibles]) => `${k}>${[...cibles].sort().join(',')}`);

const contenu = `// Généré par scripts/build-proches.mjs — ne pas éditer à la main.
// Relations lexicales du Wiktionnaire français (CC BY-SA 4.0) restreintes aux
// mots des articles d'Encyclo : « mot que le joueur tape » > « formes du texte à
// dévoiler » (clés normalisées sans accents, comme celles du jeu).
// Les parentés de forme (radical commun) n'y figurent pas : le jeu les déduit
// déjà tout seul.

const BRUT =
  '${entrees.join(' ')}';

let table: Map<string, string[]> | null = null;

/** Index « mot proposé → formes du texte de même sens » (construit à la 1re demande). */
export function proches(): Map<string, string[]> {
  if (!table) {
    table = new Map();
    for (const e of BRUT.split(' ')) {
      const [k, v] = e.split('>');
      if (k) table.set(k, v.split(','));
    }
  }
  return table;
}
`;

writeFileSync(SORTIE, contenu);
console.log(
  `Écrit src/data/proches.ts : ${entrees.length} entrées, ${relationsGardees} relations ` +
    `(rejets — forme inutilisable : ${rejets.forme}, trop rare pour être tapé : ${rejets.rare}, ` +
    `déjà vu par le radical : ${rejets.radical}, ` +
    `plafond par lemme : ${rejets.plafond}, passe-partout : ${passePartout}) — ` +
    `${(contenu.length / 1024).toFixed(0)} Ko`,
);
