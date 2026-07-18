/**
 * Génère src/data/lexique.ts depuis la base Lexique 3.83 (lexique.org, licence CC BY-SA).
 * Usage : node scripts/build-lexique.mjs
 * Télécharge le TSV (~25 Mo) si absent de /tmp, puis produit des lexiques compacts :
 *  - DICO5   : toutes les formes de 5 lettres (validation « Le Mot »)
 *  - SOL5    : formes fréquentes (solutions « Le Mot »)
 *  - CROISES5: lemmes courants avec forme accentuée (Croisés quotidien + définitions Wiktionnaire)
 *  - CROISES5_RARE : lemmes moins courants (Croisés du défi difficile)
 *  - DICO6 / SOL6 : idem en 6 lettres (« Mélimélo », Dactylo)
 *  - DICO8 / SOL8 : idem en 8 lettres (« Le Mot » et « Mélimélo » du défi difficile)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const TSV = '/tmp/lexique383.tsv';
const TSV_URL = 'http://www.lexique.org/databases/Lexique383/Lexique383.tsv';

if (!existsSync(TSV)) {
  console.log('Téléchargement de Lexique 3.83…');
  execSync(`curl -sL --max-time 120 "${TSV_URL}" -o ${TSV}`);
}

const strip = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

const CLEAN = /^[a-zàâäéèêëîïôöùûüç]+$/;

const lines = readFileSync(TSV, 'utf8').split('\n');
const header = lines[0].split('\t');
const col = (name) => header.indexOf(name);
const [cOrtho, cLemme, cCgram, cFreqF, cFreqL, cIslem, cNblettres] = [
  col('ortho'), col('lemme'), col('cgram'), col('freqfilms2'), col('freqlivres'), col('islem'), col('nblettres'),
];

const dico5 = new Set();
const sol5 = new Set();
const dico6 = new Set();
const sol6 = new Set();
const dico8 = new Set();
const sol8 = new Set();
// stripped -> forme accentuée la plus fréquente (pour les définitions Wiktionnaire)
const croises = new Map();
const croisesFreq = new Map();

// Seuil de fréquence (films/livres, par million) séparant les Croisés du
// quotidien (mots courants) de ceux du défi difficile (mots plus rares).
const SEUIL_CROISES_COURANT = 8;

for (let i = 1; i < lines.length; i++) {
  const f = lines[i].split('\t');
  if (f.length < 15) continue;
  const ortho = f[cOrtho];
  const n = Number(f[cNblettres]);
  if ((n !== 5 && n !== 6 && n !== 8) || !CLEAN.test(ortho)) continue;
  const w = strip(ortho);
  if (w.length !== n) continue;
  const freq = Math.max(Number(f[cFreqF]) || 0, Number(f[cFreqL]) || 0);
  const islem = f[cIslem] === '1';
  const cgram = f[cCgram];

  if (n === 5) {
    dico5.add(w);
    if (freq >= 8 && !['ONO', 'ART:def'].includes(cgram)) sol5.add(w);
    if (islem && freq >= 2 && /^(NOM|ADJ|VER)/.test(cgram)) {
      if (!croisesFreq.has(w) || freq > croisesFreq.get(w)) {
        croises.set(w, ortho);
        croisesFreq.set(w, freq);
      }
    }
  } else if (n === 6) {
    dico6.add(w);
    if (islem && freq >= 8 && /^(NOM|ADJ|VER)/.test(cgram)) sol6.add(w);
  } else {
    dico8.add(w);
    if (islem && freq >= 8 && /^(NOM|ADJ|VER)/.test(cgram)) sol8.add(w);
  }
}

const sorted = (s) => [...s].sort();
const pack = (arr) => `'${arr.join(' ')}'.split(' ')`;

const croisesCourant = sorted(croises.keys()).filter((w) => croisesFreq.get(w) >= SEUIL_CROISES_COURANT);
const croisesRare = sorted(croises.keys()).filter((w) => croisesFreq.get(w) < SEUIL_CROISES_COURANT);
const croisesArr = croisesCourant.map((w) => `${w}:${croises.get(w)}`);
const croisesRareArr = croisesRare.map((w) => `${w}:${croises.get(w)}`);

const out = `/**
 * Lexiques générés depuis Lexique 3.83 (http://www.lexique.org, New et Pallier, CC BY-SA).
 * NE PAS ÉDITER À LA MAIN — régénérer avec : node scripts/build-lexique.mjs
 */

/** Toutes les formes de 5 lettres (validation « Le Mot »). */
export const DICO5: string[] = ${pack(sorted(dico5))};

/** Formes fréquentes de 5 lettres (solutions « Le Mot »). */
export const SOL5: string[] = ${pack(sorted(sol5))};

/** Lemmes courants 5 lettres, format « STRIPPE:accentué » (Croisés quotidien + définitions). */
export const CROISES5: string[] = ${pack(croisesArr)};

/** Lemmes moins courants 5 lettres, même format (Croisés du défi difficile). */
export const CROISES5_RARE: string[] = ${pack(croisesRareArr)};

/** Toutes les formes de 6 lettres (validation « Mélimélo »). */
export const DICO6: string[] = ${pack(sorted(dico6))};

/** Lemmes fréquents de 6 lettres (cibles « Mélimélo »). */
export const SOL6: string[] = ${pack(sorted(sol6))};

/** Toutes les formes de 8 lettres (validation « Le Mot » et « Mélimélo » difficiles). */
export const DICO8: string[] = ${pack(sorted(dico8))};

/** Lemmes fréquents de 8 lettres (solutions du défi difficile). */
export const SOL8: string[] = ${pack(sorted(sol8))};

export const DICO5_SET = new Set(DICO5);
export const DICO6_SET = new Set(DICO6);
export const DICO8_SET = new Set(DICO8);
`;

writeFileSync(new URL('../src/data/lexique.ts', import.meta.url), out);
console.log(
  `dico5=${dico5.size} sol5=${sol5.size} croises5=${croisesCourant.length} croises5rare=${croisesRare.length} dico6=${dico6.size} sol6=${sol6.size} dico8=${dico8.size} sol8=${sol8.size}`,
);
