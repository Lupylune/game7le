/* Copie Leaflet et mapillary-js depuis node_modules vers public/vendor/.
 *
 * Atlas charge ces deux libs par <script>, hors du bundle : elles ne servent
 * qu'à cette épreuve et pèsent 1 Mo à elles deux. Les servir depuis notre
 * propre domaine plutôt que depuis unpkg supprime un point de défaillance —
 * unpkg est gratuit et sans garantie, une panne de son côté rendait Atlas
 * injouable alors que tout le reste du site était servi normalement — et fait
 * gagner une poignée de main TLS vers un tiers.
 *
 * Le dossier produit est volontairement gitignoré : committer 1 Mo de bundle
 * minifié, et un blob de plus à chaque montée de version, alourdirait
 * l'historique pour rien. La version fait foi dans package.json ; ce script
 * vérifie qu'elle correspond aux constantes de `geo.ts`, qui pilotent l'URL du
 * miroir CDN de secours — un écart les ferait diverger en silence.
 *
 * Lancé par `predev` et `prebuild`, donc jamais à lancer à la main.
 */
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const racine = new URL('..', import.meta.url);
const geo = readFileSync(new URL('src/lib/geo.ts', racine), 'utf8');

/** Version déclarée dans geo.ts pour le miroir CDN. */
function versionAttendue(constante) {
  const m = geo.match(new RegExp(`const ${constante} = '([^']+)'`));
  if (!m) throw new Error(`${constante} introuvable dans src/lib/geo.ts`);
  return m[1];
}

const LIBS = [
  {
    nom: 'leaflet',
    constante: 'LEAFLET_VER',
    fichiers: ['leaflet.js', 'leaflet.css'],
    dossiers: ['images'], // référencées par leaflet.css
  },
  {
    nom: 'mapillary-js',
    dest: 'mapillary',
    constante: 'MAPILLARY_VER',
    fichiers: ['mapillary.js', 'mapillary.css'],
    dossiers: [],
  },
];

for (const lib of LIBS) {
  const pkg = require(`${lib.nom}/package.json`);
  const attendue = versionAttendue(lib.constante);
  if (pkg.version !== attendue) {
    throw new Error(
      `${lib.nom} : ${pkg.version} installée, ${attendue} attendue par ${lib.constante} ` +
        `(src/lib/geo.ts). Alignez les deux — la constante décide de l'URL du miroir.`,
    );
  }
  const src = new URL(`node_modules/${lib.nom}/dist/`, racine);
  const dest = new URL(`public/vendor/${lib.dest ?? lib.nom}/`, racine);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const f of lib.fichiers) copyFileSync(new URL(f, src), new URL(f, dest));
  for (const d of lib.dossiers) cpSync(new URL(`${d}/`, src), new URL(`${d}/`, dest), { recursive: true });
  console.log(`✓ ${lib.nom}@${pkg.version} → public/vendor/${lib.dest ?? lib.nom}/`);
}
