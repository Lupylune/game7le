/* Pré-résolution des cibles d'Atlas → public/atlas.json.
 *
 * Atlas est la seule épreuve qui dépend d'un service tiers au moment de jouer :
 * trouver l'image Mapillary la plus proche du point tiré coûte jusqu'à huit
 * aller-retours en recherche adaptative, soit plusieurs secondes d'écran
 * d'attente avant le premier pixel. Or le tirage est déterministe : la cible du
 * 21 mars est connue dès aujourd'hui. On la résout donc ici, hors production, et
 * le jeu n'a plus qu'à lire la table.
 *
 * Deux propriétés valent d'être notées :
 *
 * - c'est un RACCOURCI, jamais un prérequis. Table absente, horizon dépassé,
 *   image retirée de Mapillary depuis : `resoudreImage()` retombe sur la
 *   recherche au runtime, exactement comme avant.
 * - ça RESSERRE le déterminisme. La réponse de l'API évolue avec l'imagerie
 *   disponible, donc deux joueurs résolvant le même jour à six mois d'écart
 *   pouvaient déjà ne pas noter sur le même point. Figer l'id fige la référence.
 *
 * On ne consulte pas le tirage du jour : la cible `game7le:${date}:atlas` est
 * définie pour toute date, qu'Atlas sorte ou non. Résoudre tous les jours plutôt
 * que les ~44 % où il est tiré coûte un fichier deux fois plus gros (quelques
 * dizaines de ko) et affranchit ce script de la logique de tirage — qu'il
 * n'aurait pas pu importer sans embarquer tous les composants de jeu. Le défi
 * hebdomadaire est hors sujet : Atlas n'a pas de fenêtre `defi`.
 *
 * Usage : npm run atlas [-- --horizon 365] [--concurrence 4]
 *          npm run atlas -- --verifier --depuis 2026-09-21
 *
 * `--verifier` revalide les entrées déjà en table et remplace celles qui ne
 * s'affichent plus ; `--depuis` borne l'opération aux jours à venir, pour ne
 * pas déplacer la cible de jours déjà joués — elle sert de référence de score
 * aux rejouables en archive. `--force` re-résout tout, passé compris.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const racine = new URL('..', import.meta.url);
const SORTIE = new URL('public/atlas.json', racine);

// ---- Options ---------------------------------------------------------------

const argv = process.argv.slice(2);
const opt = (nom, def) => {
  const i = argv.indexOf(`--${nom}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def;
};
const HORIZON = opt('horizon', 365); // jours à l'avance
const CONCURRENCE = opt('concurrence', 4); // requêtes simultanées vers l'API
/* Bornes desserrées : les 4 s du jeu servent à se replier vite devant le joueur,
   ici on a tout le temps. Sans ça, les villes très denses (Berlin, Seattle…)
   échouent en boucle — or ce sont précisément celles où la table sert le plus. */
const BORNES = { delaiRequete: opt('delai', 20000), budget: opt('budget', 90000) };
/* Candidats validés avant d'abandonner un point. Il en faut plus qu'on ne
   croit : les images cassées ne sont pas réparties au hasard, elles vont par
   grappes (à Dubaï, tous les panoramas du quartier). */
const CANDIDATS_MAX = opt('candidats', 15);
const FORCE = argv.includes('--force'); // re-résoudre TOUT, y compris le passé
/* Re-résoudre à partir d'une date : sert à réparer sans toucher aux jours déjà
   joués, dont l'entrée est la référence de score des rejouables en archive. */
const iDepuis = argv.indexOf('--depuis');
const DEPUIS = iDepuis >= 0 ? argv[iDepuis + 1] : null;
/* Revérifier les entrées existantes (et remplacer celles qui ne s'affichent
   plus) au lieu de les sauter. Se combine avec --depuis. */
const VERIFIER = argv.includes('--verifier');

// ---- Jeton -----------------------------------------------------------------

/** Le jeton vit dans .env (gitignoré), comme pour le site. */
function jeton() {
  if (process.env.VITE_MAPILLARY_TOKEN) return process.env.VITE_MAPILLARY_TOKEN;
  const f = new URL('.env', racine);
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^VITE_MAPILLARY_TOKEN\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('VITE_MAPILLARY_TOKEN absent (.env ou environnement)');
}

// ---- Import des modules du jeu ---------------------------------------------

/**
 * `cibleDe` et la recherche adaptative sont la logique du jeu, pas la nôtre :
 * les réimplémenter ici ferait diverger la table du tirage réel au premier
 * ajustement. On les importe donc telles quelles, via un passage par rolldown
 * (déjà présent, Vite s'en sert) puisque Node ne lit pas le TypeScript.
 * `import.meta.env` n'existe pas hors Vite : on neutralise le seul accès, le
 * jeton étant fourni ici par l'environnement.
 */
async function modulesDuJeu() {
  const { rolldown } = await import('rolldown');
  const dir = mkdtempSync(join(tmpdir(), 'game7le-atlas-'));
  const bundle = await rolldown({
    input: {
      geo: new URL('src/lib/geo.ts', racine).pathname,
      rng: new URL('src/lib/rng.ts', racine).pathname,
    },
    platform: 'node',
    plugins: [
      {
        name: 'sans-import-meta-env',
        transform: (code) => code.replace(/import\.meta\.env/g, '({})'),
      },
    ],
    logLevel: 'silent',
  });
  await bundle.write({ dir, format: 'esm' });
  await bundle.close();
  const geo = await import(pathToFileURL(join(dir, 'geo.js')).href);
  const rng = await import(pathToFileURL(join(dir, 'rng.js')).href);
  rmSync(dir, { recursive: true, force: true });
  return { geo, rng };
}

// ---- Affichabilité ---------------------------------------------------------

/* Champs de géométrie exigés par le viewer. Une image peut très bien répondre
   200 sur ses métadonnées et 500 ici : ses données dérivées sont cassées chez
   Mapillary, définitivement. Le viewer ne rend alors jamais rien, et le joueur
   attend le délai de repli avant d'avoir une photo fixe — c'est ce qui est
   arrivé le 2026-09-21 (Florence). On ne peut le savoir qu'en demandant. */
const CHAMPS_VIEWER =
  'mesh,sfm_cluster,atomic_scale,camera_parameters,camera_type,computed_rotation';
/* Ils sont demandés groupés à dessein : c'est ainsi que le viewer procède, et
   un seul champ en 500 fait échouer toute la requête — donc l'image entière.
   `sfm_cluster` est le cas observé sur Florence : tous les autres champs de
   cette image répondent 200, celui-là non, et le viewer ne rend jamais rien. */

/* Ordre d'essai : on alterne panoramas et images plates au lieu d'épuiser les
   premiers avant de toucher aux secondes. Les images cassées vont par grappes
   — à Dubaï, tout le quartier en panoramas — et une zone dense en remonte
   cinquante d'un coup : en file, on validerait cinquante images mortes avant
   d'atteindre la première saine. Le premier élément reste le meilleur
   panorama, donc le choix par défaut est inchangé. */
function alterne(candidats) {
  const panos = candidats.filter((c) => c.pano);
  const plates = candidats.filter((c) => !c.pano);
  const out = [];
  for (let i = 0; i < Math.max(panos.length, plates.length); i++) {
    if (panos[i]) out.push(panos[i]);
    if (plates[i]) out.push(plates[i]);
  }
  return out;
}

async function affichable(id) {
  try {
    const r = await fetch(
      `https://graph.mapillary.com/${id}?access_token=${token}&fields=${CHAMPS_VIEWER}`,
      { signal: AbortSignal.timeout(BORNES.delaiRequete) },
    );
    return r.ok;
  } catch {
    return false; // au doute on écarte : le runtime saura résoudre lui-même
  }
}

// ---- Dates -----------------------------------------------------------------

/** Suite de dates AAAA-MM-JJ, du lancement à aujourd'hui + horizon. */
function dates(lancement) {
  const out = [];
  const fin = new Date(Date.now() + HORIZON * 864e5);
  for (const d = new Date(lancement + 'T12:00:00Z'); d <= fin; d.setUTCDate(d.getUTCDate() + 1))
    out.push(d.toISOString().slice(0, 10));
  return out;
}

// ---- Résolution ------------------------------------------------------------

const { geo, rng } = await modulesDuJeu();
const token = jeton();

const table = !FORCE && existsSync(SORTIE) ? JSON.parse(readFileSync(SORTIE, 'utf8')) : {};
const avant = Object.keys(table).length;

/** Les points à résoudre. Les clés déjà connues sont sautées — un rerun est donc
 *  bon marché — sauf si on demande explicitement de les revérifier. */
const taches = [];
for (const date of dates(rng.LANCEMENT)) {
  const c = geo.cibleDe(rng.seededRng(`game7le:${date}:atlas`));
  const cle = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
  const dansPortee = !DEPUIS || date >= DEPUIS;
  if (!table[cle] || (VERIFIER && dansPortee)) taches.push({ date, cle, c, revoir: !!table[cle] });
}

console.log(
  `${avant} entrée(s) en table, ${taches.length} à résoudre ` +
    `(jusqu'à J+${HORIZON}, ${CONCURRENCE} en parallèle)`,
);

let faits = 0;
let vides = 0;
let echecs = 0;
let intactes = 0;
let reparees = 0;

/** Un travailleur pioche dans la file jusqu'à épuisement. */
async function travailleur() {
  for (;;) {
    const t = taches.shift();
    if (!t) return;
    try {
      // Revérification : une entrée encore affichable est laissée telle quelle,
      // pour ne pas déplacer la cible d'un jour sans raison.
      if (t.revoir && (await affichable(table[t.cle].id))) {
        intactes++;
        continue;
      }
      /* On descend la liste ordonnée jusqu'au premier candidat réellement
         affichable. Une seule recherche, N validations. Descendre la liste est
         indispensable et pas seulement économique : à Dubaï, TOUS les panoramas
         du quartier ont des données dérivées cassées et toutes les images
         plates sont saines — se contenter du meilleur candidat, ou le réécarter
         un par un en relançant la recherche, reste piégé dans la même famille. */
      let img = null;
      const candidats = await geo.chercheCandidats({ lat: t.c.lat, lng: t.c.lng }, token, BORNES);
      for (const c of alterne(candidats).slice(0, CANDIDATS_MAX)) {
        if (await affichable(c.id)) {
          img = c;
          break;
        }
      }
      // Une cible sans aucune image affichable n'est pas mise en table : elle
      // resterait fausse si la zone est mieux couverte d'ici là, et le runtime
      // sait déjà résoudre et se replier tout seul.
      if (img) {
        if (t.revoir && table[t.cle]?.id !== img.id) reparees++;
        table[t.cle] = { ...img, date: t.date, ville: t.c.ville.nom };
      } else {
        if (t.revoir) delete table[t.cle]; // mieux vaut pas d'entrée qu'une morte
        vides++;
      }
    } catch {
      echecs++; // réseau : la date reste à faire, un rerun la reprendra
    }
    if (++faits % 25 === 0) process.stdout.write(`  ${faits} résolue(s)…\n`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCE }, travailleur));

// Tri par date : un diff lisible vaut mieux qu'un ordre d'arrivée.
const triee = Object.fromEntries(
  Object.entries(table).sort((a, b) => String(a[1].date).localeCompare(String(b[1].date))),
);
writeFileSync(SORTIE, JSON.stringify(triee, null, 0) + '\n');

const ko = (readFileSync(SORTIE, 'utf8').length / 1024).toFixed(1);
console.log(
  `\npublic/atlas.json : ${Object.keys(triee).length} entrée(s) (${
    Object.keys(triee).length - avant >= 0 ? '+' : ''
  }${Object.keys(triee).length - avant}), ${ko} ko` +
    `\nsans image affichable : ${vides} · échecs réseau : ${echecs}` +
    (VERIFIER ? `\nrevérifiées intactes : ${intactes} · remplacées : ${reparees}` : ''),
);
