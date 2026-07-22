# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Game7le — an unofficial French adaptation of [gauntle.com](https://gauntle.com): a daily challenge
of **7 mini-games drawn at random each day out of a pool of 15**, chained under a single stopwatch.
The draw and puzzles are identical for every player on a given day (seeded PRNG, no required
backend). Bonuses reduce total time, penalties add to it; the goal is to finish the run as fast as
possible.

There is also a **weekly hard challenge** (`/defi`, « défi difficile ») : 7 games drawn from a
10-game pool (the 15 minus Paire, Ratiole, Trace, Pokédle and Atlas, which have no meaningful hard
variant), played in harder variants via the `difficile` game prop. It is identified by the **Monday of the
current week** (Europe/Paris) — seeds `game7le:defi:${lundi}:…` (`lundiStr()` in `src/lib/rng.ts`,
`jeuxDefiSemaine()` in `src/games/index.ts`) — so everyone gets the same draw all week. It has its
own leaderboard tab (`/classement?onglet=defi`, `classementDefi()`), its own localStorage bucket
(`game7le:defis` via `saveDefi()`/`loadDefis()`, same live/archive rules keyed by the Monday), and
a looser SANS-FAUTE threshold (8 min vs 5, both client and server).

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
npm run pokemon   # regenerate src/data/pokemon.ts from PokeAPI (gen 1 only)
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
  14-entry `JEUX` array and take the first `JEUX_PAR_JOUR` (7) — this is the day's game order.
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
- `difficile?: boolean` — hard variant for the weekly challenge (Chromal 16 cells, Croisés rare
  vocabulary, Dactylo 24 words, Echecs higher-rated mates in 2/3, LeMot & Mélimélo 8 letters,
  Nonogramme 15×15, Reines 8×8, Sudoku 9×9 with 28 clues). **The `false`/absent path must keep the
  exact same `rng` call sequence as before** so existing daily puzzles don't change when touching
  a generator. `GameDef.reglesDifficile` overrides the rules line shown during hard play.
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
Nonogramme, and Croises. Reines uses the same "Vérifier" button, highlighting queens "en échec"
(same row/column/region or touching) red for ~2s (+5s). Echecs uses an "Indice" button that
highlights the piece to play for the next expected move for ~2.5s (+15s) instead of revealing the
full line. Follow whichever pattern fits when adding a new puzzle-type game.

`GameIcon.tsx` renders a hand-drawn SVG glyph per game `id` (no emoji) — add a new `case` there for
any new game id.

### Run flow (`src/pages/RunPage.tsx`)

Central state machine: `intro` → `playing` → `results`, driving through `jeux` (the day's 7 draw).
Notable mechanics:

- The global stopwatch pauses during the 3-second transition screen shown between games (verdict
  of the previous game + countdown to the next) — `pausedRef`/`trans` track this so paused time is
  excluded from `rawMs`.
- `RunPage` also drives `/jouer/:date` (replay any past day) — same draw/seed logic keyed by the
  URL date instead of today — and `/defi` (`<RunPage defi />`, keyed in `App.tsx` so a daily run's
  state is never recycled), where `date` is the current week's Monday and results go through
  `saveDefi()`/`syncRun(pseudo, run, true)` instead.
- Results are persisted via `saveRun()` (`src/lib/storage.ts`, localStorage key `game7le:runs`),
  keeping the best time per day **and per type** (`enDirect`). Live = the **first attempt on the
  puzzle's day**; every replay — archives or same-day regrind — goes to the archive slot and never
  overwrites the live run, so the daily leaderboard, streak and profile stats (live-only) reflect
  first attempts.

### Optional Supabase backend (`src/lib/supabase.ts`, `src/lib/sync.ts`, `supabase/schema.sql`)

Two tables, `comptes(pseudo)` and `runs(pseudo, date, en_direct, defi, total_ms, lines)`, defined
and RLS-locked in `supabase/schema.sql` (run once in the Supabase SQL editor; includes an
idempotent migration block for bases created with the old one-row-per-day schema). There's no auth
(pseudo is chosen freely client-side, same as local storage), so direct table writes are denied by
RLS — all writes go through the `submit_run()` `SECURITY DEFINER` RPC, which upserts the `comptes`
row and only overwrites a `(pseudo, date, en_direct, defi)` row if the new time is better —
mirroring the local rule that live and archive runs never overwrite each other. The client-sent
`p_en_direct` flag is capped server-side (live requires: submitted on the puzzle's day, Europe/
Paris — or within the challenge's week when `p_defi` — and no live run already recorded for that
pseudo/date/defi — first attempt only). Weekly-challenge rows have `defi = true` and `date` = the
week's Monday (enforced server-side); every daily-oriented read in `classement.ts`/`sync.ts`
filters `defi = false`, and `classementDefi()` reads `defi = true`. Reads are public (needed for a
global leaderboard).

Since anyone can call the RPC with the public anon key, `submit_run()` trusts nothing client-sent
and rejects malformed or implausible payloads with an exception (swallowed by the fire-and-forget
`syncRun()`): pseudo format, date within launch date…today (Europe/Paris), bounded `total_ms`,
`lines` = exactly 7 distinct known game ids with plausible per-game durations and bounded string
fields, and `flawless` recomputed server-side from the lines (the client flag can only remove it).
The 15 game ids — and the 10-id hard pool used when `p_defi` — are hardcoded in the function —
keep them in sync with `src/games/index.ts` (`JEUX` / `JEUX_DEFI`) when adding a game, and keep
validation thresholds loose enough to never reject a legitimate run (a false positive is silently
lost). `submit_run()` also rate-limits by client IP (from the
Supabase-set `x-forwarded-for` header, tracked in the RLS-private `quota_ip` table, purged after
2h): max 20 submissions and 5 new pseudos per IP per hour — dimensioned so a whole household of
legitimate players never hits it (a real run takes minutes) while making scripted spam floods
ineffective. `supabase/cleanup.sql` is the rerunnable purge script (same criteria as the
validation) used after the 2026-07-18 pollution incidents.

`src/lib/supabase.ts` builds the client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see
`.env.example`); both are `undefined` unless set locally, so `supabase` is `null` and every
function in `src/lib/sync.ts` degrades to a no-op/`null` return — the app never depends on the
backend being configured or reachable. `RunPage.tsx` calls `syncRun()` right after `saveRun()`
(fire-and-forget, not awaited by the UI).

`src/lib/classement.ts`'s `classementJour(date, n)` reads real `runs` rows for that day (public
SELECT, no auth needed) and falls back to the seeded fake peloton (`classementSimule`) when the
backend is absent or nobody has played yet that day — used by `Home.tsx` and `Classement.tsx`.

`src/lib/useHistorique.ts`'s `useHistorique(pseudo)` hook is the shared way pages read "my run
history": it fetches by pseudo via `sync.ts`'s `fetchRunsParPseudo()` (so history follows the
pseudo across browsers/devices) and falls back to the local `loadRuns()` history when the backend
is unavailable, returning a `Record<date, RunPourStats>`. Used by `Home.tsx`/`Classement.tsx`
("did I play today"), `Archives.tsx` (per-day archive list), and `Profil.tsx` (fed into
`stats.ts`'s pure `calculeStats(historique, today)`). `rangEstime()` (estimated rank shown in the
profile) still compares against the simulated peloton only, by design — it's explicitly labeled
as an estimate in the UI.

### Content pipelines (generated, not hand-authored)

`src/data/lexique.ts`, `src/data/definitions.ts`, `src/data/echecs.ts`, and `src/data/pokemon.ts`
are **generated files** committed to the repo, not written by hand — regenerate them via `npm run
lexique` / `npm run echecs` / `npm run pokemon` rather than editing directly:

- `scripts/build-lexique.mjs` downloads Lexique 3.83 (lexique.org) and derives word lists (Le Mot
  solutions/dictionary in 5 and 8 letters, Mélimélo anagram targets in 6 and 8, Croisés crossword
  vocabulary) filtered by frequency and cleanliness. The Croisés pool is split by frequency:
  `CROISES5` (common words, daily grids) vs `CROISES5_RARE` (rarer words, hard-challenge grids).
- `scripts/build-defs.mjs` fetches French Wiktionary definitions (batched, cached, resumable) for
  both Croisés pools, used as crossword clues; `src/lib/croisesgen.ts` assembles actual 5×5
  grids from that word+clue pool at runtime (via the seeded RNG), not from a fixed grid set.
- `scripts/build-echecs.mjs` pulls a byte-range slice of the Lichess puzzle database (CC0),
  filtering to no-promotion, rated mate puzzles: `PUZZLES` (mates in 1–2, 700–1600 Elo, daily) and
  `PUZZLES_DIFFICILES` (mates in 2 at 1600–2400 Elo plus mates in 3, hard challenge).
- `scripts/build-pokemon.mjs` fetches the 151 gen-1 Pokémon from PokeAPI (`POKEMONS` in
  `src/data/pokemon.ts`): French name, type(s), color, habitat, and evolution stage / fully-evolved
  — the latter two computed over gen-1-only evolution relationships (a gen-2 baby like Pichu is
  ignored, and Golbat/Onix/Snorlax count as fully evolved). Feeds the `pokedle` game (Pokédle);
  gen 1 only, no hard variant so it's excluded from the weekly challenge pool.

### Testing (`scripts/smoke.mjs`, `scripts/full-run.mjs`)

No component/unit test framework — end-to-end via Playwright driving the built app on
`localhost:4183` (`npm run preview` must be running first):

- `smoke.mjs`: loads every page and every game's practice route, asserts no console/page errors.
- `full-run.mjs`: plays through an entire day's draw (7 games) using `page.clock` to fast-forward
  the skip-timer and simulated drag gestures for draw-based games, then checks the results screen
  and localStorage persistence. Because the draw is random per day, it reads the on-screen game
  name at each step and dispatches to a matching action (skip vs. drag) rather than hardcoding an
  order.
