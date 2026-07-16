# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Game7le — an unofficial French adaptation of [gauntle.com](https://gauntle.com): a daily challenge
of **7 mini-games drawn at random each day out of a pool of 13**, chained under a single stopwatch.
The draw and puzzles are identical for every player on a given day (seeded PRNG, no required
backend). Bonuses reduce total time, penalties add to it; the goal is to finish the run as fast as
possible.

Vite + React 19 + TypeScript, statically hosted. Language of the UI, code comments, and
commit-worthy content is **French** — keep new user-facing strings in French. An optional Supabase
backend (see below) mirrors local runs for a real global leaderboard, but the app is fully
functional offline/without it (localStorage only).

## Commands

```bash
npm run dev       # dev server
npm run build     # tsc -b && vite build → dist/
npm run preview   # serve the production build (used by tests, port 4183)
npm run lint      # oxlint
npm test          # node scripts/smoke.mjs && node scripts/full-run.mjs
                  # requires `npm run preview` running on port 4183 first
npm run lexique   # regenerate src/data/{lexique,definitions}.ts from Lexique 3.83 + Wiktionary
npm run echecs    # regenerate src/data/echecs.ts from the Lichess puzzle database
```

There is no unit test runner — `npm test` is two Playwright scripts (see Testing below). To run
just one: `node scripts/smoke.mjs` or `node scripts/full-run.mjs` (preview server must be up).

Node version is pinned via `.node-version` (nodenv). If `npm`/`node` aren't found in a shell, run
`eval "$(nodenv init -)"` first.

## Architecture

### Daily draw and determinism

Everything that must be "the same puzzle for everyone today" is derived from a PRNG seeded by a
string key, via `seededRng()` in `src/lib/rng.ts` (xmur3 hash → mulberry32). This is the core
mechanic and touches most of the app:

- `jeuxDuJour(date)` in `src/games/index.ts` seeds on `game7le:${date}:selection` to shuffle the
  13-entry `JEUX` array and take the first `JEUX_PAR_JOUR` (7) — this is the day's game order.
- Each individual game's RNG is seeded on `game7le:${date}:${jeu.id}` (see `RunPage.tsx`), so the
  puzzle content (word, grid, board…) is also fixed per day per game.
- The fake global leaderboard (`src/lib/classement.ts`) is seeded the same way, purely for demo
  flavor — it is not real multiplayer data.
- Practice mode (`src/pages/Entrainement.tsx`) seeds on a random nonce instead of the date, so
  grids differ every attempt.

When adding a new game or changing draw logic, preserve this determinism: never call
`Math.random()` directly in game logic — always thread the `rng: RNG` prop through.

### Game plugin contract

Every mini-game is a self-contained component in `src/games/*.tsx` implementing `GameProps` /
registered as a `GameDef` in `src/games/index.ts` (see `src/games/types.ts`):

- `rng: RNG` — the seeded generator described above; use it for all randomness (grid gen, word
  choice, shuffling) so the game is reproducible for a given seed.
- `onAdjust(ms, label)` — report an intermediate time adjustment (bonus/penalty) that shows as a
  floating toast during play, without ending the game (e.g. a wrong guess, a hint revealed).
- `onDone(result)` — end the game once, with a final `GameResult` (`adjustMs`, human-readable
  `detail`, and `status: 'success' | 'fail' | 'skip'`). Do not double-count adjustments already
  reported via `onAdjust` in the final `adjustMs`.
- `GameDef.skip` — `{ apresS, penaliteS } | null` controls whether/when the "skip" button appears
  in `RunPage`; games with a single irreversible attempt (Ratiole, Trace) set it to `null`.

Games needing a "did I get it right" affordance without spoiling the solution use a **"Vérifier"
(verify) button** that flags wrong cells red for ~2s and costs a small time penalty (+5s), rather
than a "Révéler" (reveal) button that shows the answer — this pattern is used in Sudoku, Paire,
Nonogramme, and Croises. Reines and Echecs still use reveal since there's no partial-fill state to
check. Follow whichever pattern fits when adding a new puzzle-type game.

`GameIcon.tsx` renders a hand-drawn SVG glyph per game `id` (no emoji) — add a new `case` there for
any new game id.

### Run flow (`src/pages/RunPage.tsx`)

Central state machine: `intro` → `playing` → `results`, driving through `jeux` (the day's 7 draw).
Notable mechanics:

- The global stopwatch pauses during the 3-second transition screen shown between games (verdict
  of the previous game + countdown to the next) — `pausedRef`/`trans` track this so paused time is
  excluded from `rawMs`.
- `RunPage` also drives `/jouer/:date` (replay any past day) — same draw/seed logic keyed by the
  URL date instead of today.
- Results are persisted via `saveRun()` (`src/lib/storage.ts`, localStorage key `game7le:runs`),
  keeping only the best time per day.

### Optional Supabase backend (`src/lib/supabase.ts`, `src/lib/sync.ts`, `supabase/schema.sql`)

Two tables, `comptes(pseudo)` and `runs(pseudo, date, total_ms, lines)`, defined and RLS-locked in
`supabase/schema.sql` (run once in the Supabase SQL editor). There's no auth (pseudo is chosen
freely client-side, same as local storage), so direct table writes are denied by RLS — all writes
go through the `submit_run()` `SECURITY DEFINER` RPC, which upserts the `comptes` row and only
overwrites a day's `runs` row if the new time is better. Reads are public (needed for a global
leaderboard).

`src/lib/supabase.ts` builds the client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see
`.env.example`); both are `undefined` unless set locally, so `supabase` is `null` and every
function in `src/lib/sync.ts` degrades to a no-op/`null` return — the app never depends on the
backend being configured or reachable. `RunPage.tsx` calls `syncRun()` right after `saveRun()`
(fire-and-forget, not awaited by the UI).

`src/lib/classement.ts`'s `classementJour(date, n)` reads real `runs` rows for that day (public
SELECT, no auth needed) and falls back to the seeded fake peloton (`classementSimule`) when the
backend is absent or nobody has played yet that day — used by `Home.tsx` and `Classement.tsx`.
`src/lib/stats.ts`'s `calculeStats(historique, today)` is a pure function over a
`RunPourStats[]` history; `Profil.tsx` fetches that history by pseudo via
`sync.ts`'s `fetchRunsParPseudo()` (so stats follow the pseudo across browsers/devices) and falls
back to the local `loadRuns()` history when the backend is unavailable. `rangEstime()` (estimated
rank shown in the profile) still compares against the simulated peloton only, by design — it's
explicitly labeled as an estimate in the UI.

### Content pipelines (generated, not hand-authored)

`src/data/lexique.ts`, `src/data/definitions.ts`, and `src/data/echecs.ts` are **generated files**
committed to the repo, not written by hand — regenerate them via `npm run lexique` / `npm run
echecs` rather than editing directly:

- `scripts/build-lexique.mjs` downloads Lexique 3.83 (lexique.org) and derives word lists (Le Mot
  solutions/dictionary, Mélimélo anagram targets, Croisés crossword vocabulary) filtered by
  frequency and cleanliness.
- `scripts/build-defs.mjs` fetches French Wiktionary definitions (batched, cached, resumable) for
  the Croisés vocabulary, used as crossword clues; `src/lib/croisesgen.ts` assembles actual 5×5
  grids from that word+clue pool at runtime (via the seeded RNG), not from a fixed grid set.
- `scripts/build-echecs.mjs` pulls a byte-range slice of the Lichess puzzle database (CC0),
  filtering to one-move, no-promotion, rated puzzles for the Echecs game.

### Testing (`scripts/smoke.mjs`, `scripts/full-run.mjs`)

No component/unit test framework — end-to-end via Playwright driving the built app on
`localhost:4183` (`npm run preview` must be running first):

- `smoke.mjs`: loads every page and every game's practice route, asserts no console/page errors.
- `full-run.mjs`: plays through an entire day's draw (7 games) using `page.clock` to fast-forward
  the skip-timer and simulated drag gestures for draw-based games, then checks the results screen
  and localStorage persistence. Because the draw is random per day, it reads the on-screen game
  name at each step and dispatches to a matching action (skip vs. drag) rather than hardcoding an
  order.
