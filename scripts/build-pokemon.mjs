/**
 * Génère src/data/pokemon.ts à partir de PokeAPI (pokeapi.co, données libres).
 * Usage : node scripts/build-pokemon.mjs
 *
 * Produit deux listes :
 * - POKEMONS : la première génération (nº 1 à 151), utilisée par le Pokédle
 *   quotidien. stade / evolueTotal calculés sur les seules évolutions internes
 *   à la Gen 1 (un bébé Gen 2 comme Pichu ne compte pas ; Golbat reste
 *   « entièrement évolué ») — À NE PAS FAIRE VARIER : le quotidien doit rester
 *   identique d'un build à l'autre.
 * - POKEMONS_TOUTES : toutes les générations (nº 1 à 1025), utilisée par le
 *   Pokédle du défi difficile. stade / evolueTotal calculés sur la chaîne
 *   d'évolution complète, et un champ `generation` (1 à 9) en plus.
 *
 * Les sprites (pixel art 96×96) de tous les Pokémon sont enregistrés en local
 * pour rester hors-ligne.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const N_GEN1 = 151;
const N_TOTAL = 1025; // dex national jusqu'à la Gen 9 (Pecharunt)
const API = 'https://pokeapi.co/api/v2';
const SPRITES = new URL('../public/sprites/pokemon/', import.meta.url);
mkdirSync(SPRITES, { recursive: true });

async function getJSON(url) {
  for (let essai = 0; essai < 5; essai++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      /* on réessaie */
    }
    await new Promise((res) => setTimeout(res, 500 * (essai + 1)));
  }
  throw new Error(`Échec du téléchargement : ${url}`);
}

const fr = (names) => names.find((x) => x.language.name === 'fr')?.name;
const idDeUrl = (url) => Number(url.split('/').filter(Boolean).pop());

// "generation-i" … "generation-ix" -> 1 … 9
const ROMAINS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'];
const numGeneration = (name) => ROMAINS.indexOf(name.replace('generation-', '')) + 1;

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
    console.log(`  …${Math.min(i + taille, items.length)}/${items.length}`);
  }
  return out;
}

// Pour chaque espèce de la chaîne, calcule le stade + « entièrement évolué »
// de deux façons : sur la chaîne complète (…All) et sur les seuls nœuds Gen 1
// (…Gen1, pour reproduire à l'identique le calcul historique du quotidien).
function analyseChaine(chain, res) {
  const walkAll = (node, stadeParent) => {
    const stade = stadeParent + 1;
    const cur = res.get(node.species.name) ?? {};
    cur.stadeAll = stade;
    cur.evoAll = node.evolves_to.length === 0;
    res.set(node.species.name, cur);
    for (const e of node.evolves_to) walkAll(e, stade);
  };
  walkAll(chain, 0);

  const walkGen1 = (node, stadeParentGen1) => {
    const gen1 = idDeUrl(node.species.url) <= N_GEN1;
    const stade = gen1 ? stadeParentGen1 + 1 : stadeParentGen1;
    const enfantsGen1 = node.evolves_to.filter((e) => idDeUrl(e.species.url) <= N_GEN1);
    if (gen1) {
      const cur = res.get(node.species.name) ?? {};
      cur.stadeGen1 = stade;
      cur.evoGen1 = enfantsGen1.length === 0;
      res.set(node.species.name, cur);
    }
    for (const e of node.evolves_to) walkGen1(e, stade);
  };
  walkGen1(chain, 0);
}

const cacheType = new Map();
const cacheCouleur = new Map();
const cacheHabitat = new Map();
const cacheChaine = new Map(); // url de chaîne -> Map(species -> {stade…, evo…})

console.log(`Récupération des ${N_TOTAL} Pokémon (toutes générations)…`);

const ids = Array.from({ length: N_TOTAL }, (_, i) => i + 1);

const pokemons = await enLots(ids, 10, async (id) => {
  const [mon, espece] = await Promise.all([
    getJSON(`${API}/pokemon/${id}/`),
    getJSON(`${API}/pokemon-species/${id}/`),
  ]);

  const types = mon.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
  const type1 = await traduction('type', types[0], cacheType);
  const type2 = await traduction('type', types[1] ?? null, cacheType);
  const couleur = await traduction('pokemon-color', espece.color?.name, cacheCouleur);
  const habitat =
    (await traduction('pokemon-habitat', espece.habitat?.name, cacheHabitat)) ?? 'Inconnu';
  const generation = numGeneration(espece.generation.name);

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
  const evo = cacheChaine.get(chaineUrl).get(espece.name) ?? {};

  return {
    num: id,
    nom: fr(espece.names) ?? mon.name,
    type1,
    type2,
    couleur,
    habitat,
    generation,
    // stade / evolueTotal selon la Gen 1 (quotidien) et selon la chaîne complète (défi)
    gen1: { stade: evo.stadeGen1 ?? 1, evolueTotal: evo.evoGen1 ?? true },
    tous: { stade: evo.stadeAll ?? 1, evolueTotal: evo.evoAll ?? true },
  };
});

pokemons.sort((a, b) => a.num - b.num);

const ligne = (p, evo, avecGen) =>
  `  { num: ${p.num}, nom: ${JSON.stringify(p.nom)}, type1: ${JSON.stringify(p.type1)}, ` +
  `type2: ${p.type2 ? JSON.stringify(p.type2) : 'null'}, stade: ${evo.stade}, ` +
  `evolueTotal: ${evo.evolueTotal}, couleur: ${JSON.stringify(p.couleur)}, ` +
  `habitat: ${JSON.stringify(p.habitat)}, generation: ${avecGen ? p.generation : 1} },`;

const lignesGen1 = pokemons
  .filter((p) => p.num <= N_GEN1)
  .map((p) => ligne(p, p.gen1, false));
const lignesToutes = pokemons.map((p) => ligne(p, p.tous, true));

const contenu = `// Généré par scripts/build-pokemon.mjs — ne pas éditer à la main.
// Source PokeAPI (pokeapi.co).
// POKEMONS : Gen 1 (nº 1 à ${N_GEN1}), stade / evolueTotal sur les seules
//   évolutions internes à la Gen 1 — utilisé par le Pokédle quotidien.
// POKEMONS_TOUTES : toutes les générations (nº 1 à ${N_TOTAL}), stade /
//   evolueTotal sur la chaîne complète, avec le champ generation — utilisé par
//   le Pokédle du défi difficile.

export interface Pokemon {
  num: number;
  nom: string;
  type1: string;
  type2: string | null;
  stade: number;
  evolueTotal: boolean;
  couleur: string;
  habitat: string;
  generation: number;
}

export const POKEMONS: Pokemon[] = [
${lignesGen1.join('\n')}
];

export const POKEMONS_TOUTES: Pokemon[] = [
${lignesToutes.join('\n')}
];
`;

writeFileSync(new URL('../src/data/pokemon.ts', import.meta.url), contenu);
console.log(
  `Écrit src/data/pokemon.ts (POKEMONS ${lignesGen1.length}, POKEMONS_TOUTES ${lignesToutes.length}).`,
);
