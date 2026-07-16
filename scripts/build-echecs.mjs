/**
 * Extrait des puzzles d'échecs de la base Lichess (database.lichess.org, CC0)
 * et génère src/data/echecs.ts.
 * Usage : node scripts/build-echecs.mjs
 * Télécharge une tranche partielle du .zst (~12 Mo sur 300), la décompresse en
 * flux tronqué, puis filtre : solution en un coup, sans promotion, populaire.
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

const out = [];
for (let i = 1; i < lines.length && out.length < 800; i++) {
  const f = lines[i].split(',');
  if (f.length < 8) continue;
  const [, fen, moves, rating, , popularity, nbPlays, themes] = f;
  const mv = moves.split(' ');
  if (mv.length !== 2) continue; // riposte adverse + un seul coup à trouver
  if (mv[0].length !== 4 || mv[1].length !== 4) continue; // pas de promotion
  const r = Number(rating);
  if (r < 700 || r > 1600) continue;
  if (Number(popularity) < 85 || Number(nbPlays) < 500) continue;
  if (!/[/ ]/.test(fen)) continue;
  out.push(`${fen};${mv[0]};${mv[1]};${r};${/mateIn1/.test(themes) ? 'M' : 'T'}`);
}

writeFileSync(
  new URL('../src/data/echecs.ts', import.meta.url),
  `/**
 * Puzzles extraits de la base Lichess (database.lichess.org, licence CC0).
 * Format : FEN;coup adverse;solution;classement Elo;M(at)|T(actique).
 * NE PAS ÉDITER — régénérer : node scripts/build-echecs.mjs
 */
const RAW = ${JSON.stringify(out.join('\n'))};

export interface PuzzleEchecs {
  fen: string;
  riposte: string; // coup adverse joué automatiquement (UCI)
  solution: string; // coup à trouver (UCI)
  elo: number;
  mat: boolean;
}

export const PUZZLES: PuzzleEchecs[] = RAW.split('\\n').map((l) => {
  const [fen, riposte, solution, elo, type] = l.split(';');
  return { fen, riposte, solution, elo: Number(elo), mat: type === 'M' };
});
`,
);
console.log(`Puzzles retenus : ${out.length}`);
