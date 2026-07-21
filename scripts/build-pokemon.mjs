/**
 * Génère src/data/pokemon.ts à partir de PokeAPI (pokeapi.co, données libres).
 * Usage : node scripts/build-pokemon.mjs
 *
 * Ne garde que la première génération (nº 1 à 151). Pour chaque Pokémon on
 * récupère : nom FR, type(s) FR, couleur FR, habitat FR, stade d'évolution et
 * « entièrement évolué » — ces deux derniers calculés en ne considérant QUE les
 * relations d'évolution internes à la génération 1 (un bébé Gen 2 comme Pichu
 * ne compte pas ; Roucool → Roucoups → Roucarnage donne bien 3 stades).
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const N = 151;
const API = 'https://pokeapi.co/api/v2';
const SPRITES = new URL('../public/sprites/pokemon/', import.meta.url);
mkdirSync(SPRITES, { recursive: true });

async function getJSON(url) {
  for (let essai = 0; essai < 4; essai++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      /* on réessaie */
    }
    await new Promise((res) => setTimeout(res, 400 * (essai + 1)));
  }
  throw new Error(`Échec du téléchargement : ${url}`);
}

const fr = (names) => names.find((x) => x.language.name === 'fr')?.name;
const idDeUrl = (url) => Number(url.split('/').filter(Boolean).pop());

// Traductions FR des types, couleurs et habitats (mises en cache).
async function traduction(endpoint, name, cache) {
  if (name == null) return null;
  if (cache.has(name)) return cache.get(name);
  const data = await getJSON(`${API}/${endpoint}/${name}/`);
  const t = fr(data.names) ?? name;
  cache.set(name, t);
  return t;
}

// Petit ordonnanceur à concurrence limitée pour ne pas marteler l'API.
async function enLots(items, taille, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += taille) {
    out.push(...(await Promise.all(items.slice(i, i + taille).map(fn))));
  }
  return out;
}

// Calcule stade + entièrement évolué pour toutes les espèces d'une chaîne,
// en ne suivant que les nœuds Gen 1 (id <= 151).
function analyseChaine(chain, res) {
  const walk = (node, stadeParentGen1) => {
    const gen1 = idDeUrl(node.species.url) <= N;
    const stade = gen1 ? stadeParentGen1 + 1 : stadeParentGen1;
    const enfantsGen1 = node.evolves_to.filter((e) => idDeUrl(e.species.url) <= N);
    if (gen1) {
      res.set(node.species.name, { stade, evolueTotal: enfantsGen1.length === 0 });
    }
    for (const e of node.evolves_to) walk(e, stade);
  };
  walk(chain, 0);
}

const cacheType = new Map();
const cacheCouleur = new Map();
const cacheHabitat = new Map();
const cacheChaine = new Map(); // url de chaîne -> Map(species -> {stade, evolueTotal})

console.log(`Récupération des ${N} Pokémon de la génération 1…`);

const ids = Array.from({ length: N }, (_, i) => i + 1);

const pokemons = await enLots(ids, 8, async (id) => {
  const [mon, espece] = await Promise.all([
    getJSON(`${API}/pokemon/${id}/`),
    getJSON(`${API}/pokemon-species/${id}/`),
  ]);

  const types = mon.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
  const type1 = await traduction('type', types[0], cacheType);
  const type2 = await traduction('type', types[1] ?? null, cacheType);
  const couleur = await traduction('pokemon-color', espece.color?.name, cacheCouleur);
  const habitat = (await traduction('pokemon-habitat', espece.habitat?.name, cacheHabitat)) ??
    'Inconnu';

  // Sprite officiel (pixel art 96×96), enregistré en local pour rester hors-ligne.
  const spriteUrl = mon.sprites?.front_default;
  if (spriteUrl) {
    const img = Buffer.from(await (await fetch(spriteUrl)).arrayBuffer());
    writeFileSync(new URL(`${id}.png`, SPRITES), img);
  }

  const chaineUrl = espece.evolution_chain.url;
  if (!cacheChaine.has(chaineUrl)) {
    const map = new Map();
    analyseChaine((await getJSON(chaineUrl)).chain, map);
    cacheChaine.set(chaineUrl, map);
  }
  const evo = cacheChaine.get(chaineUrl).get(espece.name) ?? { stade: 1, evolueTotal: true };

  return {
    num: id,
    nom: fr(espece.names) ?? mon.name,
    type1,
    type2,
    stade: evo.stade,
    evolueTotal: evo.evolueTotal,
    couleur,
    habitat,
  };
});

pokemons.sort((a, b) => a.num - b.num);

const lignes = pokemons.map(
  (p) =>
    `  { num: ${p.num}, nom: ${JSON.stringify(p.nom)}, type1: ${JSON.stringify(p.type1)}, ` +
    `type2: ${p.type2 ? JSON.stringify(p.type2) : 'null'}, stade: ${p.stade}, ` +
    `evolueTotal: ${p.evolueTotal}, couleur: ${JSON.stringify(p.couleur)}, ` +
    `habitat: ${JSON.stringify(p.habitat)} },`,
);

const contenu = `// Généré par scripts/build-pokemon.mjs — ne pas éditer à la main.
// Pokémon de la première génération (nº 1 à ${N}), source PokeAPI (pokeapi.co).
// stade / evolueTotal : calculés sur les seules évolutions internes à la Gen 1.

export interface Pokemon {
  num: number;
  nom: string;
  type1: string;
  type2: string | null;
  stade: number;
  evolueTotal: boolean;
  couleur: string;
  habitat: string;
}

export const POKEMONS: Pokemon[] = [
${lignes.join('\n')}
];
`;

writeFileSync(new URL('../src/data/pokemon.ts', import.meta.url), contenu);
console.log(`Écrit src/data/pokemon.ts (${pokemons.length} Pokémon).`);
