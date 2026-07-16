/**
 * Génère src/data/lexique.ts depuis la base Lexique 3.83 (lexique.org, licence CC BY-SA).
 * Usage : node scripts/build-lexique.mjs
 * Télécharge le TSV (~25 Mo) si absent de /tmp, puis produit des lexiques compacts :
 *  - DICO5   : toutes les formes de 5 lettres (validation « Le Mot »)
 *  - SOL5    : formes fréquentes (solutions « Le Mot »)
 *  - CROISES5: lemmes fréquents avec forme accentuée (grilles + définitions Wiktionnaire)
 *  - DICO6 / SOL6 : idem en 6 lettres (« Mélimélo »)
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
// stripped -> forme accentuée la plus fréquente (pour les définitions Wiktionnaire)
const croises = new Map();
const croisesFreq = new Map();

for (let i = 1; i < lines.length; i++) {
  const f = lines[i].split('\t');
  if (f.length < 15) continue;
  const ortho = f[cOrtho];
  const n = Number(f[cNblettres]);
  if ((n !== 5 && n !== 6) || !CLEAN.test(ortho)) continue;
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
  } else {
    dico6.add(w);
    if (islem && freq >= 8 && /^(NOM|ADJ|VER)/.test(cgram)) sol6.add(w);
  }
}

const sorted = (s) => [...s].sort();
const pack = (arr) => `'${arr.join(' ')}'.split(' ')`;

const croisesArr = sorted(croises.keys()).map((w) => `${w}:${croises.get(w)}`);

const out = `/**
 * Lexiques générés depuis Lexique 3.83 (http://www.lexique.org, New et Pallier, CC BY-SA).
 * NE PAS ÉDITER À LA MAIN — régénérer avec : node scripts/build-lexique.mjs
 */

/** Toutes les formes de 5 lettres (validation « Le Mot »). */
export const DICO5: string[] = ${pack(sorted(dico5))};

/** Formes fréquentes de 5 lettres (solutions « Le Mot »). */
export const SOL5: string[] = ${pack(sorted(sol5))};

/** Lemmes fréquents 5 lettres, format « STRIPPE:accentué » (Croisés + définitions). */
export const CROISES5: string[] = ${pack(croisesArr)};

/** Toutes les formes de 6 lettres (validation « Mélimélo »). */
export const DICO6: string[] = ${pack(sorted(dico6))};

/** Lemmes fréquents de 6 lettres (cibles « Mélimélo »). */
export const SOL6: string[] = ${pack(sorted(sol6))};

export const DICO5_SET = new Set(DICO5);
export const DICO6_SET = new Set(DICO6);
`;

writeFileSync(new URL('../src/data/lexique.ts', import.meta.url), out);
console.log(
  `dico5=${dico5.size} sol5=${sol5.size} croises5=${croises.size} dico6=${dico6.size} sol6=${sol6.size}`,
);
