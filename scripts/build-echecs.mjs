/**
 * Extrait des puzzles d'échecs de la base Lichess (database.lichess.org, CC0)
 * et génère src/data/echecs.ts.
 * Usage : node scripts/build-echecs.mjs
 * Télécharge une tranche partielle du .zst (~12 Mo sur 300), la décompresse en
 * flux tronqué, puis filtre : mats en 1 ou 2 coups, sans promotion, populaires.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const CSV = '/tmp/lichess-puzzles-partiel.csv';
if (!existsSync(CSV)) {
  console.log('Téléchargement partiel de la base Lichess…');
  execSync(
    `curl -s -r 0-12000000 https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -d --stdout 2>/dev/null > ${CSV} || true`,
    { maxBuffer: 1024 * 1024 * 512 },
  );
}

// PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
const lines = readFileSync(CSV, 'utf8').split('\n');
console.log(`Lignes décompressées : ${lines.length}`);

// Mélange équilibré : mats en 1 (2 coups listés) et mats en 2 (4 coups listés).
// Pool « difficile » (défi hebdomadaire) : mats en 2 mieux cotés et mats en 3.
const PAR_TYPE = 400;
const PAR_TYPE_DIFF = 300;
const mats1 = [];
const mats2 = [];
const durs2 = [];
const durs3 = [];
const plein = () =>
  mats1.length >= PAR_TYPE && mats2.length >= PAR_TYPE &&
  durs2.length >= PAR_TYPE_DIFF && durs3.length >= PAR_TYPE_DIFF;
for (let i = 1; i < lines.length && !plein(); i++) {
  const f = lines[i].split(',');
  if (f.length < 8) continue;
  const [, fen, moves, rating, , popularity, nbPlays, themes] = f;
  const mv = moves.split(' ');
  if (!mv.every((m) => m.length === 4)) continue; // pas de promotion
  if (!/[/ ]/.test(fen)) continue;
  const r = Number(rating);
  let dest = null;
  if (/\bmateIn1\b/.test(themes) && mv.length === 2 && r >= 700 && r <= 1600) dest = mats1;
  else if (/\bmateIn2\b/.test(themes) && mv.length === 4 && r >= 700 && r <= 1600) dest = mats2;
  else if (/\bmateIn2\b/.test(themes) && mv.length === 4 && r > 1600 && r <= 2400) dest = durs2;
  else if (/\bmateIn3\b/.test(themes) && mv.length === 6 && r >= 1200 && r <= 2400) dest = durs3;
  const seuilPop = dest === durs2 || dest === durs3 ? 80 : 85;
  const seuilJeux = dest === durs2 || dest === durs3 ? 200 : 500;
  const max = dest === durs2 || dest === durs3 ? PAR_TYPE_DIFF : PAR_TYPE;
  if (!dest || dest.length >= max) continue;
  if (Number(popularity) < seuilPop || Number(nbPlays) < seuilJeux) continue;
  dest.push(`${fen};${moves};${r}`);
}
const out = [...mats1, ...mats2];
const outDiff = [...durs2, ...durs3];

writeFileSync(
  new URL('../src/data/echecs.ts', import.meta.url),
  `/**
 * Puzzles extraits de la base Lichess (database.lichess.org, licence CC0).
 * Tous sont des mats (en 1, 2 ou 3 coups). Format : FEN;coups UCI (le premier
 * est la riposte adverse, puis alternance joueur/adversaire);classement Elo.
 * NE PAS ÉDITER — régénérer : node scripts/build-echecs.mjs
 */
const RAW = ${JSON.stringify(out.join('\n'))};

const RAW_DIFFICILES = ${JSON.stringify(outDiff.join('\n'))};

export interface PuzzleEchecs {
  fen: string;
  /** Coups UCI : [riposte adverse, coup joueur, (riposte, coup joueur)…] */
  coups: string[];
  elo: number;
}

const parse = (raw: string): PuzzleEchecs[] =>
  raw.split('\\n').map((l) => {
    const [fen, coups, elo] = l.split(';');
    return { fen, coups: coups.split(' '), elo: Number(elo) };
  });

/** Pool quotidien : mats en 1 ou 2, 700–1600 Elo. */
export const PUZZLES: PuzzleEchecs[] = parse(RAW);

/** Pool du défi difficile : mats en 2 mieux cotés (1600–2400) et mats en 3. */
export const PUZZLES_DIFFICILES: PuzzleEchecs[] = parse(RAW_DIFFICILES);
`,
);
console.log(
  `Puzzles retenus : ${out.length} (mats en 1 : ${mats1.length}, mats en 2 : ${mats2.length}) · difficiles : ${outDiff.length} (mats en 2 : ${durs2.length}, mats en 3 : ${durs3.length})`,
);
