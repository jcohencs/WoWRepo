# API Contract

All responses are JSON. Errors: `{ "error": { "code": string, "message": string } }` with
4xx/5xx status. Codes: `bad_request`, `not_found`, `upstream`, `rate_limited`.

## GET /api/meta
→ `{ site: "fresh"|"classic", demo: boolean, raids: Raid[] }` (one entry per raid instance, progression order)

## GET /api/character?region=US&realm=nightslayer&name=Foo&raid=1011-black-temple&spec=Fury
→ `ZoneReport`. `raid` optional (defaults to the latest TBC raid). `spec` optional (default: each boss's best spec).

## GET /api/compare?region=US&realm=nightslayer&name=Foo&encounter=601&spec=Fury&week=1759762800000
→ `Comparison` (incl. `weeks`, `benchmark.ladder`, and per side `timeline`, `taken`, `prep`). `week` optional: your best kill in that raid week (epoch ms of the US reset). 404 `not_found` if there is no kill.

## POST /api/refresh?region=US&realm=nightslayer&name=Foo&raid=black-temple&spec=Fury
→ `ZoneReport`, pulled again now. Forgets the character's saved comparisons so they re-pull on the next click. A page refreshed in the last 10 minutes is returned as-is. When the hourly allowance is low the pull is queued for the next pass and the saved page is returned (no error).

## GET /api/leaders?realm=nightslayer&raid=black-temple
→ `Leaderboard` — the realm's #1 player of each class in the raid (default: latest): best average parse as one spec among players with at least 3 bosses killed (fewer in a small raid, or if nobody has that many), with their average DPS/HPS. Built from saved pages; no Warcraft Logs calls.

## GET /api/status
→ `ApiStatus | null` — `{ limitPerHour, pointsSpent, resetsInSec, savedResults }` (null in demo mode).

## GET /api/characters?realm=dreamscythe
→ `string[]` — every character the site knows on that realm (search suggestions).
