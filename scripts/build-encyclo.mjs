/**
 * Génère src/data/encyclo.ts à partir de Wikipédia en français (CC BY-SA 4.0) :
 * les articles dont l'introduction sert de texte à deviner dans « Encyclo ».
 * Usage : node scripts/build-encyclo.mjs   (cache : /tmp/encyclo-cache.json)
 *
 * Pool de départ : les « articles vitaux » de niveau 4 (~10 000 articles
 * fondamentaux sélectionnés par la communauté) — un socle intemporel, contrairement
 * au top des pages vues qui suit l'actualité (footballeurs, faits divers…).
 * Ces candidats sont ensuite classés par fréquentation réelle (prop=pageviews,
 * moyenne des 60 derniers jours) :
 * - ARTICLES : les plus consultés — quotidien, sujets largement connus.
 * - ARTICLES_DIFFICILES : la tranche suivante — défi hebdomadaire difficile.
 *
 * Chaque entrée est un titre + les premières phrases de l'introduction, nettoyées
 * (prononciations, alphabets non latins, notes) et coupées à la phrase. On ne
 * conserve un article que si tous les mots significatifs de son titre
 * apparaissent dans le texte retenu : sinon le titre serait indevinable.
 *
 * Attention : régénérer ce fichier peut décaler les pools (la fréquentation
 * bouge), donc les articles tirés les jours passés. Comme pour le lexique, on ne
 * régénère que délibérément.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://fr.wikipedia.org/w/api.php';
const UA = 'game7le-build/1.0 (génération de données de jeu, usage non commercial)';
const CACHE = '/tmp/encyclo-cache.json';

const NB_QUOTIDIEN = 700; // taille du pool ARTICLES
const NB_DIFFICILE = 600; // taille du pool ARTICLES_DIFFICILES
const VUES_MIN = 15; // vues/jour en dessous desquelles le sujet est trop confidentiel
const TEXTE_MIN = 140; // longueur utile mini du texte retenu
const TEXTE_MAX = 320; // au-delà, la partie devient interminable

const SECTIONS = [
  'Arts et culture',
  'Géographie',
  'Histoire',
  'Mathématiques',
  'Personnalités',
  'Philosophie et religion',
  'Santé et médecine',
  'Science',
  'Société et sciences sociales',
  'Technologie',
  'Vie quotidienne',
];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  let dernier = '';
  let attente = 0;
  // L'API limite le débit des requêtes anonymes (HTTP 429) : on s'espace, on
  // respecte `Retry-After` et on patiente franchement plutôt que d'abandonner
  // le build — les données déjà obtenues restent en cache de toute façon.
  for (let essai = 0; essai < 8; essai++) {
    await pause(essai === 0 ? 400 : attente || 2000 * 2 ** (essai - 1));
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) return await r.json();
      dernier = `HTTP ${r.status}`;
      const retry = Number(r.headers.get('retry-after'));
      attente = retry > 0 ? Math.min(retry, 90) * 1000 : 0;
      if (attente) console.log(`  (429 — pause de ${attente / 1000} s demandée par l'API)`);
    } catch (e) {
      dernier = String(e);
      attente = 0;
    }
  }
  throw new Error(`Échec du téléchargement (${dernier}) : ${url}`);
}

/** Tous les liens vers l'espace principal d'une page (avec pagination). */
async function liensArticles(titre) {
  const out = [];
  let suite;
  do {
    const d = await api({
      action: 'query',
      titles: titre,
      prop: 'links',
      plnamespace: '0',
      pllimit: 'max',
      ...(suite ? { plcontinue: suite } : {}),
    });
    for (const l of d.query.pages[0].links ?? []) out.push(l.title);
    suite = d.continue?.plcontinue;
  } while (suite);
  return out;
}

// --- Titres ---------------------------------------------------------------

/** Titre affiché : sans la parenthèse de désambiguïsation (« Vénus (planète) »). */
const titreCourt = (t) => t.replace(/\s*\([^()]*\)\s*$/, '').trim();

// Pages de service, articles-listes, titres à rallonge ou encore parenthésés
// (« (1) Cérès », le numéro d'astéroïde n'est pas devinable) : indevinables.
const TITRE_EXCLU =
  /[:/()]|^(liste|chronologie)\b|^\d+$|^(19|20)\d\d\b|\bhomonymie\b/i;

const clef = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Mots du titre qu'il faudra retrouver (les petits mots sont grammaticaux). */
const motsSignificatifs = (titre) =>
  titre
    .split(/[^\p{L}\p{N}]+/u)
    .map(clef)
    .filter((m) => m.length >= 4);

function titreRecevable(titre) {
  const court = titreCourt(titre);
  if (TITRE_EXCLU.test(court) || court.length < 3 || court.length > 32) return false;
  if (court.split(/\s+/).length > 4) return false;
  return motsSignificatifs(court).length > 0;
}

// --- Texte ----------------------------------------------------------------

// Parenthèses de prononciation, de translittération ou d'écoute : du bruit qui
// n'aide en rien et casse la lecture (« (prononcé [ˈalbɐt ˈaɪnʃtaɪn] ) »).
// Plages couvertes : phonétique (API), grec, cyrillique, hébreu, arabe, devanagari, japonais, chinois, coréen.
const PARASITE =
  /prononc|écouter|\bAPI\b|[ɐ-ʯͰ-ϿЀ-ӿ֐-׿؀-ۿऀ-ॿ　-ヿ一-鿿가-힯]/;
// Introductions qui ne décrivent pas un sujet unique.
const INTRO_INEXPLOITABLE = /peut (désigner|faire référence)|page d.homonymie|^cet article/i;

function nettoie(extrait) {
  let t = (extrait ?? '').split('\n')[0].replace(/[   ]/g, ' ');
  // Parenthèses parasites (deux passes : elles sont parfois imbriquées).
  for (let i = 0; i < 2; i++) {
    t = t.replace(/\s*\(([^()]*)\)/g, (m, dedans) =>
      PARASITE.test(dedans) || !/[a-zà-öø-ÿ0-9]/i.test(dedans) ? '' : m,
    );
  }
  t = t
    .replace(/\s*\[[^\]]*\]/g, '') // crochets IPA ou notes résiduels
    .replace(/\s*\(\s*\)/g, '')
    .replace(/'{2,}/g, '') // apostrophes de mise en forme wiki qui ont survécu
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    // Ponctuation double et guillemets : espace insécable en typographie
    // française — l'API rend parfois un espace fin, parfois rien.
    .replace(/\s*([;:!?»])/g, ' $1')
    .replace(/([«])\s*/g, '$1 ')
    .trim();
  return t;
}

/** Découpe en phrases, sans se laisser piéger par « J.-C. », « M. », « av. ». */
function phrases(texte) {
  const brut = texte.split(/(?<=[.!?])\s+(?=[«"'(]?[A-ZÀ-ÖØ-Þ])/u);
  const out = [];
  for (const p of brut) {
    const precedent = out[out.length - 1];
    if (precedent && (precedent.length < 40 || /\b([A-Z]|av|apr|J\.-C)\.$/.test(precedent)))
      out[out.length - 1] = `${precedent} ${p}`;
    else out.push(p);
  }
  return out;
}

/** Les premières phrases de l'intro, jusqu'à ~TEXTE_MAX caractères. */
function extraitJouable(extrait) {
  const propre = nettoie(extrait);
  if (!propre || INTRO_INEXPLOITABLE.test(propre)) return null;
  let texte = '';
  for (const p of phrases(propre)) {
    if (texte && texte.length + p.length + 1 > TEXTE_MAX) break;
    texte = texte ? `${texte} ${p}` : p;
    if (texte.length >= TEXTE_MIN + 60) break;
  }
  if (texte.length > TEXTE_MAX) texte = texte.slice(0, TEXTE_MAX).replace(/\s+\S*$/, '');
  return texte.length >= TEXTE_MIN ? texte : null;
}

/** Le titre doit être devinable : chacun de ses mots forts figure dans le texte. */
function titreDansTexte(titre, texte) {
  const jetons = texte.split(/[^\p{L}\p{N}]+/u).map(clef).filter(Boolean);
  return motsSignificatifs(titre).every((mot) => {
    const racine = mot.slice(0, Math.min(5, mot.length));
    return jetons.some((j) => j.startsWith(racine) || mot.startsWith(j.slice(0, 5)));
  });
}

// --- Récupération ---------------------------------------------------------

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
cache.sections ??= {};
cache.vues ??= {};
cache.intro ??= {};
const sauveCache = () => writeFileSync(CACHE, JSON.stringify(cache));

console.log('Titres candidats (articles vitaux niveau 4)…');
const candidats = new Set();
for (const s of SECTIONS) {
  if (!cache.sections[s]) {
    cache.sections[s] = await liensArticles(`Wikipédia:Articles vitaux/Niveau/4/${s}`);
    sauveCache();
  }
  const l = cache.sections[s];
  for (const t of l) if (titreRecevable(t)) candidats.add(t);
  console.log(`  ${s} : ${l.length} liens → ${candidats.size} candidats cumulés`);
}

const titres = [...candidats];
const aVoir = titres.filter((t) => !(t in cache.vues));
console.log(`Fréquentation : ${aVoir.length} à récupérer (cache : ${Object.keys(cache.vues).length})`);
for (let i = 0; i < aVoir.length; i += 50) {
  const lot = aVoir.slice(i, i + 50);
  const d = await api({ action: 'query', titles: lot.join('|'), prop: 'pageviews', pvipdays: '60' });
  // `redirects` n'est pas demandé : on veut la fréquentation du titre listé.
  for (const p of d.query.pages) {
    const jours = Object.values(p.pageviews ?? {}).filter((v) => typeof v === 'number');
    cache.vues[p.title] = jours.length ? Math.round(jours.reduce((a, b) => a + b, 0) / jours.length) : 0;
  }
  for (const t of lot) cache.vues[t] ??= 0; // titres absents (renommés, supprimés)
  if (i % 500 === 0) sauveCache();
  console.log(`  …${Math.min(i + 50, aVoir.length)}/${aVoir.length}`);
  await pause(120);
}
sauveCache();

// On ne va chercher les intros que des mieux classés : de quoi remplir les deux
// pools même après les filtres de qualité (~40 % de perte constatée).
const classes = titres
  .filter((t) => cache.vues[t] >= VUES_MIN)
  .sort((a, b) => cache.vues[b] - cache.vues[a])
  .slice(0, Math.round((NB_QUOTIDIEN + NB_DIFFICILE) * 2.4));

const introsAVoir = classes.filter((t) => !(t in cache.intro));
console.log(`Introductions : ${introsAVoir.length} à récupérer (sur ${classes.length} classés)`);
for (let i = 0; i < introsAVoir.length; i += 20) {
  const lot = introsAVoir.slice(i, i + 20);
  const d = await api({
    action: 'query',
    titles: lot.join('|'),
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    exlimit: '20',
    redirects: '1',
  });
  const parTitre = new Map(d.query.pages.map((p) => [p.title, p.extract ?? '']));
  // `redirects` peut renvoyer un autre titre que celui demandé : on remonte le lien.
  const vers = new Map((d.query.redirects ?? []).map((r) => [r.from, r.to]));
  const normalise = new Map((d.query.normalized ?? []).map((r) => [r.from, r.to]));
  for (const t of lot) {
    const cible = vers.get(normalise.get(t) ?? t) ?? normalise.get(t) ?? t;
    cache.intro[t] = parTitre.get(cible) ?? '';
  }
  if (i % 200 === 0) sauveCache();
  console.log(`  …${Math.min(i + 20, introsAVoir.length)}/${introsAVoir.length}`);
  await pause(120);
}
sauveCache();

// --- Sélection et écriture ------------------------------------------------

const retenus = [];
const vus = new Set();
const rejets = { intro: 0, titre: 0, doublon: 0 };
for (const t of classes) {
  const titre = titreCourt(t);
  // Deux pages peuvent se réduire au même titre affiché (« Vénus (planète) » et
  // « Vénus (mythologie) ») : on garde la mieux classée.
  if (vus.has(clef(titre))) {
    rejets.doublon++;
    continue;
  }
  const texte = extraitJouable(cache.intro[t]);
  if (!texte) {
    rejets.intro++;
    continue;
  }
  if (!titreDansTexte(titre, texte)) {
    rejets.titre++;
    continue;
  }
  vus.add(clef(titre));
  retenus.push({ titre, texte, vues: cache.vues[t] });
}
console.log(
  `Retenus : ${retenus.length} (rejets — intro inexploitable : ${rejets.intro}, ` +
    `titre absent du texte : ${rejets.titre}, doublon de titre : ${rejets.doublon})`,
);

const quotidien = retenus.slice(0, NB_QUOTIDIEN);
const difficile = retenus.slice(NB_QUOTIDIEN, NB_QUOTIDIEN + NB_DIFFICILE);
if (quotidien.length < NB_QUOTIDIEN || difficile.length < NB_DIFFICILE)
  console.warn(
    `⚠ pools incomplets (${quotidien.length}/${NB_QUOTIDIEN}, ${difficile.length}/${NB_DIFFICILE})`,
  );

const parTitre = (a, b) => a.titre.localeCompare(b.titre, 'fr');
const lignes = (arr) =>
  arr
    .sort(parTitre)
    .map((a) => `  { titre: ${JSON.stringify(a.titre)}, texte: ${JSON.stringify(a.texte)} },`)
    .join('\n');

const contenu = `// Généré par scripts/build-encyclo.mjs — ne pas éditer à la main.
// Source : Wikipédia en français (fr.wikipedia.org), textes sous licence CC BY-SA 4.0.
// Introductions d'articles « vitaux » (niveau 4), classées par fréquentation :
// ARTICLES = les plus consultés (Encyclo quotidien), ARTICLES_DIFFICILES = la
// tranche suivante, moins connue (défi hebdomadaire difficile).

export interface Article {
  /** Titre à deviner. */
  titre: string;
  /** Premières phrases de l'introduction, masquées mot à mot pendant la partie. */
  texte: string;
}

export const ARTICLES: Article[] = [
${lignes(quotidien)}
];

export const ARTICLES_DIFFICILES: Article[] = [
${lignes(difficile)}
];
`;

writeFileSync(new URL('../src/data/encyclo.ts', import.meta.url), contenu);
console.log(
  `Écrit src/data/encyclo.ts (ARTICLES ${quotidien.length}, ARTICLES_DIFFICILES ${difficile.length}).`,
);
