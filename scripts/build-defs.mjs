/**
 * Génère src/data/definitions.ts (indices des mini mots croisés, pools
 * quotidien et défi difficile) à partir du dump wiktextract du Wiktionnaire
 * français publié par kaikki.org : contrairement à l'API MediaWiki, il expose
 * **tous** les sens de chaque lemme, déjà découpés et en texte brut. On choisit
 * donc pour chaque mot le sens le plus proche du format « indice » — court et
 * autonome — au lieu de prendre le premier de la page.
 *
 * Usage : node scripts/build-defs.mjs [--elargir]
 *   --elargir  autorise l'ajout de mots absents du definitions.ts courant.
 *              Sans ce drapeau le pool de mots est figé (voir POOL FIGÉ).
 *
 * Caches : /tmp/kaikki-frwiktionary.jsonl.gz (dump, 366 Mo, téléchargé une fois)
 *          /tmp/defs-kaikki.json (sens des seuls lemmes utiles, quelques Mo)
 *
 * POOL FIGÉ — `croisesgen.ts` construit ses grilles à partir de
 * `CROISES5 ∩ DEFS5` : ajouter ou retirer un mot ici change les grilles de
 * *toutes* les journées passées. Par défaut le script conserve donc exactement
 * le même jeu de clés qu'avant (un mot dont on ne retrouve pas de sens garde
 * son ancien indice), et se contente de signaler les mots qu'il pourrait
 * ajouter. Seul le texte des indices bouge.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  createReadStream,
  createWriteStream,
  statSync,
  openSync,
  readSync,
  closeSync,
} from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ELARGIR = process.argv.includes('--elargir');
const LEXIQUE = new URL('../src/data/lexique.ts', import.meta.url);
const SORTIE = new URL('../src/data/definitions.ts', import.meta.url);
const DUMP = '/tmp/kaikki-frwiktionary.jsonl.gz';
const CACHE = '/tmp/defs-kaikki.json';
const VERSION_CACHE = 3; // à incrémenter dès que `extrait()` change de forme
const URL_DUMP =
  'https://kaikki.org/frwiktionary/Fran%C3%A7ais/kaikki.org-dictionary-Fran%C3%A7ais.jsonl';

const src = readFileSync(LEXIQUE, 'utf8');
const pairs = ['CROISES5', 'CROISES5_RARE'].flatMap((nom) => {
  const m = src.match(new RegExp(`${nom}: string\\[\\] = '([^']+)'`));
  if (!m) throw new Error(`${nom} introuvable dans lexique.ts — lancer build-lexique.mjs d’abord`);
  return m[1].split(' ').map((p) => p.split(':')); // [STRIPPE, accentué]
});

/* ------------------------------------------------------------------ dump --- */

// Le dump est servi en gzip (366 Mo au lieu de 3,2 Go) ; on le stocke tel quel.
// Selon la version de Node, `fetch` peut décompresser à la volée : on détecte
// le format au moment de lire plutôt que de faire une hypothèse.
async function telecharge() {
  console.log(`Téléchargement du dump kaikki (~366 Mo) — une seule fois…`);
  const r = await fetch(URL_DUMP, { headers: { 'accept-encoding': 'gzip' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${URL_DUMP}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(DUMP));
  console.log(`Dump : ${(statSync(DUMP).size / 2 ** 20).toFixed(0)} Mo`);
}

function fluxDump() {
  const entete = Buffer.alloc(2);
  const fd = openSync(DUMP, 'r');
  readSync(fd, entete, 0, 2, 0);
  closeSync(fd);
  const brut = createReadStream(DUMP);
  const gzippe = entete[0] === 0x1f && entete[1] === 0x8b;
  return gzippe ? brut.pipe(createGunzip()) : brut;
}

/**
 * Extrait du dump les entrées des seuls lemmes voulus. Le dump fait des
 * millions de lignes de plusieurs Ko : on lit le champ `word` à même la chaîne
 * et on ne parse en JSON que les lignes retenues.
 */
async function extrait(voulus) {
  const trouve = {};
  let lus = 0;
  const rl = createInterface({ input: fluxDump(), crlfDelay: Infinity });
  for await (const ligne of rl) {
    if (++lus % 1_000_000 === 0) console.log(`  ${lus / 1e6} M lignes…`);
    if (!ligne.startsWith('{"word": "')) continue;
    const fin = ligne.indexOf('"', 10);
    const mot = ligne.slice(10, fin);
    if (!voulus.has(mot)) continue;
    const o = JSON.parse(ligne);
    if (o.lang_code !== 'fr') continue;
    const sens = (o.senses ?? [])
      .filter(
        (s) => !s.form_of && !(s.tags ?? []).some((t) => t === 'form-of' || t === 'alt-of'),
      )
      .map((s) => ({
        gloss: (s.glosses ?? []).at(-1) ?? '',
        tags: [...(s.tags ?? []), ...(s.raw_tags ?? []), ...(s.topics ?? [])],
      }))
      .filter((s) => s.gloss);
    if (!sens.length) continue;
    // Le dump ne classe pas les entrées d'un homographe par prééminence (MERLE
    // ouvre sur la robe du chien, pas sur l'oiseau) : le nombre de traductions
    // dit bien mieux quel sens est le sens courant du mot.
    (trouve[mot] ??= []).push({ poids: (o.translations ?? []).length, sens });
  }
  console.log(`  ${lus.toLocaleString('fr')} lignes lues`);
  return trouve;
}

/* --------------------------------------------------------------- indices --- */

// Sens qui font de mauvais indices : renvoi grammatical, marque d'usage trop
// pointue (on les pénalise sans les exclure, pour ne pas perdre de couverture).
const META =
  /^(pluriel|variante|diminutif|abréviation|synonyme|autre nom|graphie|orthographe)\b|^participe (passé|présent)|^(féminin|masculin) (singulier|pluriel|de|du|d’|d')|personne du (singulier|pluriel)|^forme (conjuguée|de conjugaison)/i;
// Marques d'usage (en anglais dans le dump) signalant un sens dérivé ou
// spécialisé : un joueur pense au sens courant, pas au terme de blason.
const TAGS_FAIBLES =
  /^(figuratively|broadly|generally|metonymically|analogy|obsolete|archaic|dated|rare|vulgar|slang|offensive|pejorative|ironic|neologism|regional|dialectal|heraldry|entomology|dance)$/i;
// Les marques régionales restent en clair dans le dump (« Afrique centrale ») :
// un sens local n'est pas celui qu'un joueur a en tête.
const TAGS_REGIONAUX =
  /Afrique|Québec|Belgique|Suisse|Acadie|Louisiane|Antilles|Maghreb|Wallonie|Canada|Réunion|Anjou|Normandie|Provence|Lorraine|Bretagne|Picardie|Savoie|Occitanie|Aude|Vaud/i;

const CIBLE = 70; // au-delà, l'indice s'allonge trop pour une grille 5×5
const MAX = 110; // plafond dur, au-delà on tronque (et on pénalise lourdement)

// Une glose qui renvoie au sens précédent (« Industrie et commerce de cet
// alliage ») ou à une autre entrée ne veut rien dire isolée dans une grille.
// `\b` est ASCII en JavaScript et voit une frontière de mot au milieu
// d'« espèce de » : les bornes se font ici à la main sur la classe accentuée.
const ANAPHORE = /(?<![a-zà-ÿœæ])(ce|cet|cette|ces)\s+(?!qui\s|qu’|que\s|dont\s|à\s)[a-zà-ÿœæ]/i;
const RENVOI = /^(idem|synonyme de|variante de|autre (nom|graphie)|équivalent de)\b/i;

// Frontières où couper une glose sans casser la phrase — le préfixe d'une
// définition reste une définition. Le poids dit à quel point la coupe est sûre :
// une incise se retire sans dommage, une relative non détachée un peu moins.
const COUPES = [
  [/,\s+(qui|que|dont|où|lequel|laquelle|auquel|duquel)(?![a-zà-ÿœæ])/, 6],
  [/\s*;\s+/, 6],
  [/,\s+(notamment|en particulier|par exemple|spécialement|surtout|voire|parfois|souvent)\b/, 6],
  [/\s+(et|ou|mais)\s+(qui|que|dont|où)\s+/, 10], // seconde relative coordonnée
  [/,?\s+le plus souvent\b/, 6],
  [/,?\s+(généralement|habituellement|en général|principalement)\b/, 6],
  [/,\s+(et|ou)\s+(par extension|par analogie|plus généralement)\b/, 6],
  [/\s+\(/, 6],
  [/,\s+/, 12], // apposition ou énumération quelconque
  [/\s+(dont|qui|que|où)\s+/, 18], // relative non détachée
];

const MIN_COUPE = 20; // en deçà, le préfixe ne définit plus rien

// Une coupe ne doit pas laisser la phrase en suspens : ni sur un mot-outil qui
// appelle une suite (« Qui a la vue fort courte et »), ni juste après un
// relatif (« Concurrent ; celui qui aspire »).
const FIN_BANCALE =
  /(?:^|\s)(?:et|ou|de|du|des|d’|d'|à|au|aux|en|par|pour|avec|sans|sous|sur|dans|le|la|les|un|une|qui|que|qu’|dont|où|comme|ainsi|entre|vers|chez|selon|leur|son|sa|ses|ce|cet|cette|plus|moins|très|tout|toute)$/i;
const RELATIF_OUVERT = /(?:^|\s)(?:qui|que|qu’|dont|où)\s+\S+$/i;

/** La glose et ses préfixes coupés proprement, chacun avec son coût de coupe. */
function variantes(def) {
  const v = new Map([[def, 0]]);
  for (const [re, poids] of COUPES) {
    const m = def.match(re);
    if (!m) continue;
    const court = def
      .slice(0, m.index)
      .replace(/,?\s*etc\.*\s*$/i, '') // la coupe peut ramener l'énumération en fin
      .replace(/[\s,;–—]+$/, '');
    if (court.length < MIN_COUPE || (court.match(/\S+/g) || []).length < 3) continue;
    if (FIN_BANCALE.test(court) || RELATIF_OUVERT.test(court)) continue;
    if (!v.has(court) || v.get(court) > poids) v.set(court, poids);
  }
  return [...v];
}

const strip = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/Œ/g, 'OE')
    .replace(/Æ/g, 'AE'); // « nœud » doit se masquer dans la définition de NOEUD

/** Ne garde que la première phrase d'une glose et normalise la ponctuation. */
function nettoie(gloss) {
  let d = gloss.replace(/\s+/g, ' ').trim();
  const phrases = d.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÝŒÆ«0-9])/);
  if (phrases.length > 1 && phrases[0].length >= 20) d = phrases[0];
  d = d.replace(/^\([^)]*\)\s*/, ''); // marque de contexte laissée en tête
  d = d.replace(/\s*(?:→|⇒|➞)\s*voir.*$/i, ''); // renvoi vers une autre entrée
  d = d.replace(/\s*\((?:voir|cf\.|au sens|Wikipédia)[^)]*\)\s*$/i, '');
  d = d.replace(/,?\s*etc\.*\s*$/i, ''); // énumération laissée ouverte
  d = d.replace(/[\s:;,–—]+$/, '').replace(/^[\s:,.;–—]+/, '');
  return d.replace(/\.{2,}$/, '.').trim();
}

/**
 * Masque le mot et ses dérivés proches dans sa propre définition, token par
 * token (`\b` échoue devant les lettres accentuées) : un mot de l'indice est
 * masqué s'il contient la réponse entière, s'il partage sa racine (4 premières
 * lettres), ou s'il commence par la réponse privée de son initiale (« bord »
 * pour ABORD).
 */
function masque(def, word, accent) {
  const stem = strip(accent.slice(0, 4));
  const queue = word.slice(1);
  let d = def.replace(/[a-zà-ÿA-ZÀ-Ÿœæ]+/g, (tok) => {
    const t = strip(tok);
    if (t.includes(word) || t.includes(stem)) return '____'; // « ébullition » pour BULLE
    if (queue.length >= 4 && t.startsWith(queue)) return '____';
    return tok;
  });
  d = d.replace(/_{4}( _{4})+/g, '____'); // fusionne les masques adjacents
  return d;
}

/** Retourne l'indice fini, ou null s'il ne dit plus rien une fois masqué. */
function finalise(def, word, accent) {
  let d = masque(def, word, accent);
  const tronque = d.length > MAX;
  if (tronque) d = d.slice(0, MAX).replace(/\s+\S*$/, '') + '…';
  d = d.charAt(0).toUpperCase() + d.slice(1);
  const masques = (d.match(/____/g) || []).length;
  // filtre qualité : assez de contenu non masqué, pas de résidu de template
  // (« Familier fr … »), ne commence pas par le mot masqué. Une glose intacte
  // n'a rien à prouver de plus : « Mère. » est un indice parfait pour MAMAN,
  // c'est le masquage qui vide une définition de sa substance.
  const visible = d.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (visible.length < (masques ? 12 : 5)) return null;
  if (/(^|\s)(fr|fro|frm|conv)(\s|$)/.test(visible)) return null;
  if (d.startsWith('____')) return null;
  // au moins deux mots significatifs visibles quand il y a du masque, sinon
  // l'indice ne dit plus rien (ex. « Action d'____ ou de s'____ »)
  if ((visible.match(/[a-zà-ÿœæ]{4,}/gi) || []).length < (masques ? 2 : 1)) return null;
  return { texte: d, tronque, masques };
}

/** Choisit, parmi tous les sens de toutes les catégories, le meilleur indice. */
function meilleur(entrees, word, accent) {
  let gagnant = null;
  const ordonnees = [...entrees].sort((a, b) => b.poids - a.poids || b.sens.length - a.sens.length);
  for (const [pos, { sens }] of ordonnees.entries()) {
    sens.forEach(({ gloss, tags }, i) => {
      const brut = nettoie(gloss);
      if (!brut || META.test(brut) || RENVOI.test(brut) || ANAPHORE.test(brut)) return;
      // Le sens dominant du mot est ce qu'attend un joueur : on ne descend vers
      // les sens suivants (souvent des homographes : SUCRE la monnaie, TIGRE la
      // danseuse) que si le principal ne donne aucun indice exploitable.
      const faible = tags.some((t) => TAGS_FAIBLES.test(t) || TAGS_REGIONAUX.test(t));
      const rang = pos * 60 + i * 35 + (faible ? 45 : 0);
      for (const [variante, coupe] of variantes(brut)) {
        const f = finalise(variante, word, accent);
        if (!f) continue;
        const cout =
          rang +
          coupe +
          Math.max(0, f.texte.length - CIBLE) + // seule la longueur excessive coûte
          (f.tronque ? 80 : 0) +
          f.masques * 40; // un trou coûte plus qu'un rang de sens : mieux vaut
        // descendre d'un sens que masquer (CHOIX « Pouvoir ou faculté de ____ »)
        if (!gagnant || cout < gagnant.cout) gagnant = { cout, texte: f.texte };
      }
    });
  }
  return gagnant?.texte ?? null;
}

/* ----------------------------------------------------------------- sortie --- */

/** Relit les indices déjà publiés (pool figé + repli quand un sens manque). */
function ancien() {
  if (!existsSync(SORTIE)) return new Map();
  const t = readFileSync(SORTIE, 'utf8');
  const m = t.match(/const RAW = ("(?:[^"\\]|\\.)*");/);
  if (!m) return new Map();
  return new Map(
    JSON.parse(m[1])
      .split('\n')
      .map((l) => [l.slice(0, l.indexOf('|')), l.slice(l.indexOf('|') + 1)]),
  );
}

// Vocabulaire exclu des grilles (insultes ethniques présentes dans Lexique),
// et mots dont tous les sens tournent autour du mot lui-même : une fois masqué,
// l'indice ne dit plus rien (« Appellation simplifiée et plus courante du ____ »).
const EXCLUS = new Set([
  'NEGRO',
  'RITAL',
  'BOCHE',
  'BICOT',
  'CONNU',
  'FETER',
  'LAPON',
  'PESEE',
  'PORNO',
  'SERBE',
  'SOLEX',
  'VOTER',
]);

if (!existsSync(DUMP)) await telecharge();

// Lexique écrit les ligatures en deux lettres (« noeud ») là où le Wiktionnaire
// range l'article sous « nœud » — on interroge les deux graphies.
const ligature = (m) => m.replace(/oe/g, 'œ').replace(/ae/g, 'æ');
const voulus = new Set(pairs.flatMap(([, a]) => [a, ligature(a)]));
let cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : null;
if (!cache || cache.version !== VERSION_CACHE || cache.lemmes !== voulus.size) {
  console.log(`Extraction de ${voulus.size} lemmes depuis le dump…`);
  cache = { version: VERSION_CACHE, lemmes: voulus.size, mots: await extrait(voulus) };
  writeFileSync(CACHE, JSON.stringify(cache));
}
console.log(`Lemmes trouvés dans le dump : ${Object.keys(cache.mots).length}/${voulus.size}`);

const avant = ancien();
const out = {};
let repris = 0;
const nouveaux = [];
for (const [word, accent] of pairs) {
  if (EXCLUS.has(word)) continue;
  const entrees = [...(cache.mots[accent] ?? []), ...(cache.mots[ligature(accent)] ?? [])];
  const indice = entrees.length ? meilleur(entrees, word, accent) : null;
  const precedent = avant.get(word);
  if (precedent === undefined) {
    // POOL FIGÉ : un mot en plus élargirait le pool et rebattrait les grilles
    // de toutes les journées déjà jouées.
    if (indice && !ELARGIR) nouveaux.push(word);
    if (indice && ELARGIR) out[word] = indice;
    continue;
  }
  if (indice) out[word] = indice;
  else {
    out[word] = precedent; // aucun sens exploitable : on garde l'indice publié
    repris++;
  }
}

const packed = Object.keys(out)
  .sort()
  .map((w) => `${w}|${out[w].replace(/\n/g, ' ')}`)
  .join('\n');

writeFileSync(
  SORTIE,
  `/**
 * Indices des mini mots croisés, extraits des sens du Wiktionnaire français via
 * le dump wiktextract de kaikki.org (fr.wiktionary.org, CC BY-SA 4.0).
 * NE PAS ÉDITER — régénérer : node scripts/build-defs.mjs
 */
const RAW = ${JSON.stringify(packed)};

/** MOT (sans accent) → définition masquée. */
export const DEFS5: Map<string, string> = new Map(
  RAW.split('\\n').map((l) => {
    const i = l.indexOf('|');
    return [l.slice(0, i), l.slice(i + 1)] as [string, string];
  }),
);
`,
);

const longueurs = Object.values(out).map((d) => d.length);
const moy = Math.round(longueurs.reduce((a, b) => a + b, 0) / longueurs.length);
console.log(`Indices écrits : ${Object.keys(out).length} (pool ${avant.size} avant)`);
const tronques = Object.values(out).filter((d) => d.endsWith('…')).length;
console.log(`  longueur moyenne ${moy}, tronqués ${tronques}`);
if (repris) console.log(`  ${repris} indices conservés faute de sens exploitable`);
if (nouveaux.length)
  console.log(
    `  ${nouveaux.length} mots pourraient être ajoutés au pool (--elargir, mais cela change les grilles passées) : ${nouveaux.slice(0, 10).join(', ')}…`,
  );
