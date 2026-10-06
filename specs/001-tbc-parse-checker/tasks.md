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
- [x] T069 Remove the "Where your damage comes from" heading; "Every ability" uses the same compact rows as "Buttons pressed" so the whole list fits without scrolling
- [x] T070 Remove the footnotes under the tabs; the tab box runs down to the bottom of the pie chart with rows spread evenly; non-damage abilities show uses-per-minute bars instead of "No direct damage"

## Phase 22: Weekly view, more charts, request log

- [x] T071 `[wcl]` log line for every request: outcome, label, duration, points spent and hourly usage (`WCL_LOG=off` to silence)
- [x] T072 Kill history per boss/spec (all ranked kills), best per raid week; `week` on `/api/compare`; weekly line chart with week picker
- [x] T073 Benchmark ladder at the 10/25/50/75/90/95/99th percentiles from exact ranking positions
- [x] T074 One breakdown request now also fetches the damage graph, damage taken and buffs: output-over-the-fight, damage taken by school, preparation & uptime charts; rank ladder

## Phase 23: Resilience and pull interval

- [x] T075 If Warcraft Logs rejects the extra chart data, re-fetch the breakdown alone so it always shows; skip ranked kills from hidden/deleted logs; each chart has its own error boundary; a week that fails to load keeps the current kill on screen
- [x] T076 Background pull (and save) every 15 minutes by default (`PULL_INTERVAL_MINUTES`), with "next pull in" in the log line
- [x] T077 Fix out-of-memory crash on start: saved data is written and read one entry per line (never as one big string); old one-object files are converted in place on first start; raw Warcraft Logs replies stay in memory only (bounded); saved raid pages share benchmarks instead of each keeping a copy; `NODE_OPTIONS=--max-old-space-size=400` on Render
- [x] T078 Performance profile radar under the boss list: you vs the top 1% player on DPS/HPS, time active, damage taken (inverted), flask/elixir and food uptime, potions; axes without data are left out (no deaths/health data available)
- [x] T079 "Where you sit" in the boss header is now the percentile ladder (10th…99th) with your best kill marked; the full-width rank chart is removed
- [x] T080 Output-over-the-fight chart shows a dot at every 15-second mark
- [x] T081 Explain re-pulls in the log (new vs refreshing, per batch; opened-page refreshes); `RAIDER_REFRESH_HOURS` (default 24); test that a restart re-pulls nobody. Root cause of the churn was the old 50,000-entry cap (fixed in T077)
- [x] T082 Drop the 2-hour refresh of opened pages; everything follows the daily refresh (pages outside the sweep re-pull in the background when opened after a day). Refresh button on the character header (`POST /api/refresh`, 10-minute cooldown, refused when the allowance is low)

## Phase 24: LogsForever

- [x] T083 Rename the site to LogsForever (header, page title, log tags, README); the logo links to the home page
- [x] T084 Remove light mode and the theme toggle; remove the "TBC Anniversary" tag from the top bar
- [x] T085 Squarer corners throughout (3px radius)
- [x] T086 Classes grid on the home page: class icon and colour, a Talents link (Wowhead TBC calculator) per class, and a Guide link per spec; `/guides/<class>/<spec>` placeholder pages; Talents and Guide links in each character's header
- [x] T087 Performance profile in its own box under the boss list; "You" / "Top 1% player" boxes use the same columns and gap as the breakdown below, with space beneath them and the "Open log" link pushed right
- [x] T088 Breakdown columns are two boxes of equal height (tabs inside the right box); output-over-the-fight and damage taken share a row
- [x] T089 Prep & uptime moved to a small box under the performance profile
- [x] T090 Potions detected by spell id and icon (logs name them by effect, e.g. "Haste", "Restore Mana") and from buffs, so a potion drunk before the pull counts; flasks/elixirs told apart by lasting the fight
- [x] T091 Search bar: realm label folded into the placeholder ("Search Nightslayer characters"); no browser dropdown arrow on the name box
- [x] T092 Talents & guide box at the bottom of the sidebar, following the selected spec/boss and ending level with the last chart; header links removed
- [x] T093 Character page header is one box: class icon, name and spec/realm; tiles for data age, Refresh and Warcraft Logs; spec and raid pickers in the box's bottom strip
- [x] T094 Boss numbers: labels "Typical DPS" / "Top 1% DPS" (HPS for healers); every label and value on one line each; Talents & guide box keeps its earlier layout with a line under the class
- [x] T095 Talents & guide box is only as tall as its content (no longer stretched to the last chart)
- [x] T096 "Where you sit" follows the kill being compared (best kill or the chosen week), with its DPS in the caption; darker background, box and line colours
- [x] T097 Sidebar summary keeps only Avg parse and Killed; a gold ★ marks a top 1% parse (99+) in the boss list and the boss numbers
- [x] T098 Race next to the character (read from the Blizzard profile data Warcraft Logs keeps, `gameData`; gear is dropped right away; `npm run doctor` prints it)
- [x] T099 Performance profile: centred title between lines, explanation removed; slightly larger logo and search bar

## Phase 25: Main page

- [x] T100 Refresh never shows a "busy" message: with the allowance low it queues the pull and shows the saved page
- [x] T101 "Top 1% on Nightslayer" on the main page: per class and spec, everyone with a 99+ parse in the chosen raid (`GET /api/leaders`, from saved pages), click a name to open their logs
- [x] T102 Classes section moved below it and redesigned as square tiles with large class icons, spec guide icons and a Talents link
- [x] T103 Main page reworked: welcome box ("Welcome to LogsForever") with the three steps; "#1 on Nightslayer" shows each class's best player (average parse, average DPS/HPS, top 1% count); classes and guides at the bottom
- [x] T104 "#1 on Nightslayer" now comes from Warcraft Logs' realm rankings (each class, every boss): a damage #1 for every class and a healing #1 for Druid, Paladin, Priest and Shaman; pulled daily by the background job and saved
- [x] T105 #1 list: pulled right after the queue each pass (not held back by the sweep's reserve); a raid a visitor opens while the allowance is used up is remembered and pulled first next pass; the page re-checks every minute while it says "Being pulled"; log label "#1 of each class (N boss rankings)"
- [x] T106 #1 lists are pulled once a day at 10:00 AM Eastern (daylight saving handled), never on visits; a raid never pulled is pulled once on first view
- [x] T107 Manual #1 pull: `/api/admin/pull-leaders?key=…`, enabled by an `ADMIN_KEY` setting (12+ characters, constant-time check, 404 otherwise)
- [x] T108 #1 lists cover every released raid (daily at 10:00 AM, and the admin link pulls them all); clicking a #1 player opens their page on the raid selected in that section
- [x] T109 #1 section is a single box: a column per class, a Damage row and a Healing row, lines between every cell
- [x] T110 #1 section split into a Damage box and a Healing box; one row per class with the class icon on the left, then class and player, spec, and DPS/HPS on the right
- [x] T111 Tanking #1 (Protection Warrior, Protection Paladin, Guardian Druid; ranked by DPS like Warcraft Logs ranks TBC tanks) in its own box under Healing; tanks left out of the damage list; saved lists re-pulled once for the new role
- [x] T112 #1 section: bar chart of each class's #1 with Damage / Healing / Tanking buttons (class-coloured bars, best first, click to open), and three small boxes with the overall top damage, healer and tank; both sides line up and don't move when switching
- [x] T113 #1 pulls: newest raid first; a batch Warcraft Logs rejects is retried one lookup at a time and only the rejected ones are skipped (logged), so the list is always saved
- [x] T114 Admin link explains what's wrong (no ADMIN_KEY, too short, missing or wrong key); `/api/meta` and the startup log show the running version; startup log says whether the admin link is on
- [x] T115 The server builds the raid list and the saved #1 list into the page (a JSON block the CSP allows), so the main page shows them on the first paint with no extra requests; visitors never wait on Warcraft Logs for a #1 list (unsaved ones are fetched in the background)
- [x] T116 #1 section: heading and description removed, raid picker in the chart header; opens on Black Temple by default (`LEADERS_DEFAULT_RAID`), or the newest raid if Black Temple isn't out
- [x] T117 No more realm-wide raider pulls by default (`RAIDER_SWEEP=on` to re-enable; prefill still does it): characters are pulled when searched, and re-pulled on a search once their page is an hour old; background job only runs the queue and the daily #1 pull; name suggestions come from everyone the site has saved
- [x] T118 Fewer API points: fight logs (both players' tables and fight lookups) saved to disk, trimmed, kept a year (logs never change; the top 1% log is shared); top 1% numbers kept 3 days instead of 1; ladder drops the 10th/25th percentiles (the deepest, most expensive ranking pages)
- [x] T119 Cheaper first comparison: the first click fetches only damage and casts; the timeline, damage taken and buffs come from `/api/compare-extras` when the charts are scrolled to or "Load profile" is clicked, and are saved into the comparison
- [x] T120 Round log line says what the round did (waiting lookups, #1 lists pulled or up to date); the realm progress only appears when RAIDER_SWEEP is on
