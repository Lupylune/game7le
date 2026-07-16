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
const PAR_TYPE = 400;
const mats1 = [];
const mats2 = [];
for (let i = 1; i < lines.length && (mats1.length < PAR_TYPE || mats2.length < PAR_TYPE); i++) {
  const f = lines[i].split(',');
  if (f.length < 8) continue;
  const [, fen, moves, rating, , popularity, nbPlays, themes] = f;
  const mv = moves.split(' ');
  if (!mv.every((m) => m.length === 4)) continue; // pas de promotion
  const dest = /\bmateIn1\b/.test(themes) && mv.length === 2
    ? mats1
    : /\bmateIn2\b/.test(themes) && mv.length === 4
      ? mats2
      : null;
  if (!dest || dest.length >= PAR_TYPE) continue;
  const r = Number(rating);
  if (r < 700 || r > 1600) continue;
  if (Number(popularity) < 85 || Number(nbPlays) < 500) continue;
  if (!/[/ ]/.test(fen)) continue;
  dest.push(`${fen};${moves};${r}`);
}
const out = [...mats1, ...mats2];

writeFileSync(
  new URL('../src/data/echecs.ts', import.meta.url),
  `/**
 * Puzzles extraits de la base Lichess (database.lichess.org, licence CC0).
 * Tous sont des mats (en 1 ou 2 coups). Format : FEN;coups UCI (le premier est
 * la riposte adverse, puis alternance joueur/adversaire);classement Elo.
 * NE PAS ÉDITER — régénérer : node scripts/build-echecs.mjs
 */
const RAW = ${JSON.stringify(out.join('\n'))};

export interface PuzzleEchecs {
  fen: string;
  /** Coups UCI : [riposte adverse, coup joueur, (riposte, coup joueur)…] */
  coups: string[];
  elo: number;
}

export const PUZZLES: PuzzleEchecs[] = RAW.split('\\n').map((l) => {
  const [fen, coups, elo] = l.split(';');
  return { fen, coups: coups.split(' '), elo: Number(elo) };
});
`,
);
console.log(`Puzzles retenus : ${out.length} (mats en 1 : ${mats1.length}, mats en 2 : ${mats2.length})`);
