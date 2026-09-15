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
 * Usage : npm run atlas [-- --horizon 365] [--force] [--concurrence 4]
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
const FORCE = argv.includes('--force'); // re-résoudre même les dates déjà en table

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

/** Les points à résoudre, déjà connus retirés : un rerun est donc bon marché. */
const taches = [];
for (const date of dates(rng.LANCEMENT)) {
  const c = geo.cibleDe(rng.seededRng(`game7le:${date}:atlas`));
  const cle = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
  if (!table[cle]) taches.push({ date, cle, c });
}

console.log(
  `${avant} entrée(s) en table, ${taches.length} à résoudre ` +
    `(jusqu'à J+${HORIZON}, ${CONCURRENCE} en parallèle)`,
);

let faits = 0;
let vides = 0;
let echecs = 0;

/** Un travailleur pioche dans la file jusqu'à épuisement. */
async function travailleur() {
  for (;;) {
    const t = taches.shift();
    if (!t) return;
    try {
      const img = await geo.chercheImage({ lat: t.c.lat, lng: t.c.lng }, token, BORNES);
      // Une cible sans couverture n'est pas mise en table : elle resterait
      // fausse si Mapillary couvre la zone d'ici là, et le runtime sait déjà
      // annoncer l'absence de panorama.
      if (img) table[t.cle] = { ...img, date: t.date, ville: t.c.ville.nom };
      else vides++;
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
  `\npublic/atlas.json : ${Object.keys(triee).length} entrée(s) (+${
    Object.keys(triee).length - avant
  }), ${ko} ko` + `\nsans couverture : ${vides} · échecs réseau : ${echecs}`,
);
