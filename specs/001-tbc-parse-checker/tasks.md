---
description: "Task list for TBC Parse Checker"
---

# Tasks: TBC Parse Checker

**Input**: Design documents from `/specs/001-tbc-parse-checker/`

**Tests**: Unit tests for the pure core (Constitution IV).

## Phase 1: Setup

- [x] T001 Initialise package, TypeScript, Vite, Vitest config in `package.json`, `tsconfig.json`, `vite.config.ts`
- [x] T002 [P] Add `.env.example`, `.gitignore`, `README.md`

## Phase 2: Foundational

- [x] T003 Define API contract types in `shared/types.ts`
- [x] T004 [P] Class/spec table, metric selection, colours in `server/core/classes.ts`
- [x] T005 [P] Percentile rank math in `server/core/percentile.ts` + `tests/unit/percentile.test.ts`
- [x] T006 [P] Input parsing (realm slug, WCL URL) in `server/core/input.ts` + `tests/unit/input.test.ts`
- [x] T007 TTL cache in `server/cache.ts`
- [x] T008 WCL OAuth + GraphQL client in `server/wcl/client.ts`
- [x] T009 `Provider` interface in `server/provider.ts`; demo provider in `server/demo/`
- [x] T010 API router in `server/handler.ts`; Vite middleware + `server/index.ts`

## Phase 3: User Story 1 — p99 table (P1) 🎯 MVP

- [x] T011 [US1] Zone discovery + character zone rankings in `server/wcl/provider.ts`
- [x] T012 [US1] Batched benchmark lookup (page 1 → percentile pages) in `server/wcl/provider.ts`
- [x] T013 [US1] Row + summary assembly in `server/core/report.ts` + `tests/unit/report.test.ts`
- [x] T014 [US1] Search bar, raid tabs, boss table UI in `src/components/`

## Phase 4: User Story 2 — ability comparison (P2)

- [x] T015 [US2] Ability diff in `server/core/compare.ts` + `tests/unit/compare.test.ts`
- [x] T016 [US2] Report tables fetch in `server/wcl/provider.ts`
- [x] T017 [US2] Comparison panel UI in `src/components/ComparePanel.tsx`

## Phase 5: User Story 3 — raid summary (P3)

- [x] T018 [US3] Summary strip in `src/components/Summary.tsx`

## Phase 6: Polish

- [x] T019 Handler tests in demo mode `tests/unit/handler.test.ts`
- [x] T020 360px layout pass, empty/error/loading states

## Phase 7: Feedback round 1

- [x] T021 Split combined WCL zones into single raids (BT / Hyjal, SSC / TK, Gruul / Mag) in `server/core/raids.ts`; raid dropdown replaces tabs
- [x] T022 Realm dropdown (superseded by T026)
- [x] T023 Ability breakdown: one view, share chart + difference on the right, no sort tabs
- [x] T024 Plain-language labels ("Top 1%", "Typical player", "9% behind"), larger type, higher-contrast secondary text
- [x] T025 Faster comparison: best-kill lookups warmed with the raid report, both logs loaded in parallel and cached per report, results cached server-side, prefetch on hover client-side

## Phase 8: Feedback round 2

- [x] T026 Realms limited to Dreamscythe and Nightslayer (US); region picker and `/api/realms` removed
- [x] T027 Difference column becomes a diverging bar (left/orange = top 1% more, right/grey = you more) with the value at the bar end
- [x] T028 Ability icons enlarged to 36px

## Phase 9: Feedback round 3

- [x] T029 Replace the diverging difference bars with two donut charts (You / Top 1%) sharing one colour per ability: top five abilities plus "Everything else", validated categorical palette, hover links slices and legend, legend lists you / top 1% / difference

## Phase 10: Rate limit

- [x] T030 Persist the response cache to `.cache/wcl-<site>.json`; reports kept 30 days, benchmarks 1 day; serve stale data when the allowance is used up
- [x] T031 Read `rateLimitData` with every query, refuse new requests near the limit with the reset time, show usage in the header (`/api/status`)
- [x] T032 `npm run sync -- --class X --spec Y [--raid ...]` pre-downloads benchmarks within the hourly budget and resumes on the next run
- [x] T033 Remove hover prefetch; skip warming best kills that are already saved

## Phase 11: Public site

- [x] T034 Remove the allowance readout from the UI
- [x] T035 Stale-while-revalidate cache: visitors always get the most recent saved pull; stale data refreshes in the background only while ≥35% of the hourly allowance is left
- [x] T036 Track searched characters and refresh them every 10 minutes, stalest first; show "Updated … ago"
- [x] T037 Deployment: `render.yaml` (Starter + disk), `Dockerfile`, `CACHE_DIR`, security headers (CSP, nosniff, referrer policy)

## Phase 12: Scheduled pulls only

- [x] T038 `SnapshotProvider`: visitors read finished saved pages only; unknown lookups are queued (HTTP 202 with place in line and time to next update)
- [x] T039 `Puller`: every `PULL_INTERVAL_MINUTES` pull the queue in order, then re-pull stale saved pages (zone 2h, compare 12h) while 15% of the allowance remains; remember "not found"
- [x] T040 UI "not pulled yet" state with countdown and automatic re-check; drop the background warm-up and per-request refreshes

## Phase 13: Pull everyone on the realms

- [x] T041 Roster discovery: realm-filtered rankings for the first boss of every raid (DPS + HPS), paged, resumable, refreshed daily
- [x] T042 Realm sweep: batch 10 characters per request, newest raid first, refresh daily, after queued and opened pages; progress logged each run
- [x] T043 `GET /api/characters?realm=` and name suggestions in the search box

## Phase 14: Nightslayer only + more charts

- [x] T044 Limit realms to Nightslayer (fixed realm field instead of a dropdown when only one realm)
- [x] T045 "Parse by boss" column chart above the boss table (parse colours, tier gridlines, vertical labels on phones)
- [x] T046 Head-to-head meters in the comparison (DPS, kill time, time active, total) replacing the stat grids
- [x] T047 "Buttons pressed per minute" paired bar chart in the comparison

## Phase 15: One listing per raid + spec bar

- [x] T048 Deduplicate raids by name, preferring the regular listing over 25-man / "full raid" zones, then the newest
- [x] T049 Spec bar: `spec` on `/api/character`, `specName`-filtered zone rankings, one saved page per spec; header and bar stay while another spec loads

## Phase 16: Pull fixes

- [x] T050 Find TBC raid zones by their bosses, not the expansion name (TBC Anniversary); only cache a successful raid list, retry a failed one after 10 minutes
- [x] T051 Log the real Warcraft Logs error for failed pulls and retry them after 15 minutes instead of hiding them for 6 hours
- [x] T052 Upgrade pages saved by older versions on read (spec fields, updatedAt); error boundaries so a display error never blanks the page
- [x] T053 `npm run doctor` checks every request type with the configured key
- [x] T054 After an HTTP 429 with no known reset, back off 5 minutes (not an hour); never report a 0-point limit
- [x] T055 Realm discovery/sweep stop at 40% allowance left (`SWEEP_RESERVE`) so visitors and checks always have room

## Phase 17: Raid ids and unreleased raids

- [x] T056 Raid ids are the raid's name (`black-temple`) so the visitor side and the puller always agree; old numbered ids still accepted
- [x] T057 Only list raids whose first boss has ranked kills (checked daily, saved as `raids-v1`), so unreleased raids like Sunwell stay hidden and the default is the newest released raid

## Phase 18: No waiting line

- [x] T058 Replace the queue with on-demand pulls for anything not saved (shared between simultaneous visitors); rate-limited requests are queued silently for after the reset
- [x] T059 Sweep keeps only 20% back (`SWEEP_RESERVE`); skip characters Warcraft Logs recently couldn't find
- [x] T060 `npm run prefill`: pull the whole realm across hourly resets with progress/ETA, then write `data/seed-<site>.json.gz`; servers with no saved data start from the seed

## Phase 19: UI round

- [x] T061 Breakdown opens for any killed boss; comparison `ref` is optional (no benchmark or unloadable log → your side only: "Your kill" tiles, single pie, your casts and abilities)
- [x] T062 Spec icons (Wowhead icon set) in the spec bar, character line and breakdown heading; CSP allows wow.zamimg.com
- [x] T063 Light mode: theme tokens incl. validated light slice palette and darkened parse/class colours; sun/moon toggle, follows system, remembered
- [x] T064 Search icon button; remove the footer text

## Phase 20: Side panel

- [x] T065 Boss breakdown opens in a sticky panel to the right of the boss list (list keeps its key columns, page widens, × closes, clicking another boss switches); stacks below 1100px
- [x] T066 Full-width page; right-pointing arrow column; every list column (typical player, sample size, range bar) stays visible beside the panel; panel shows everything at full height (no inner scroll), scrolls into view when opened

## Phase 21: Raid view layout

- [x] T067 Replace the summary strip, parse chart and boss table with a slim sticky sidebar (mini summary + boss list with parse bars, doubling as parse-by-boss) and a main area that always shows the selected boss (first kill by default): stat strip plus the full breakdown in two columns
- [x] T068 Tabs to swap "Buttons pressed" and "Every ability"; compact search in the top bar; character header on one line; spec bar and raid picker on one row; tighter spacing so the breakdown starts higher
