# Research: TBC Parse Checker

## R1 — Where TBC logs live
- **Decision**: Default to `fresh.warcraftlogs.com` (TBC Anniversary realms); allow `classic`
  via `WCL_SITE`.
- **Rationale**: Each WCL site has its own `/api/v2/client` endpoint and zone IDs. OAuth tokens
  come from `https://www.warcraftlogs.com/oauth/token` and work across sites.
- **Alternative rejected**: Hard‑coding zone IDs — they differ per site and per re‑release.
  Zones are discovered at runtime from `worldData.expansions` (filtered to "Burning Crusade"),
  with a static fallback list.

## R2 — Getting an exact 99th percentile
- **Decision**: `worldData.encounter(id).characterRankings(className, specName, metric, page)`
  returns `count` (N) and 100 entries per page sorted best‑first. The p‑th percentile
  entry is rank `r = max(1, ceil(N × (1 − p/100)))`, on page `ceil(r / 100)`, index `(r−1) mod 100`.
- **Rationale**: One extra page fetch per percentile gives the true value, and the entry
  carries `report.code` + `fightID`, which is what the ability comparison needs.
- **Cost**: Page 1 for every boss in one aliased query, then the p50/p99 pages in a second
  aliased query → 2 requests per raid/spec, cached 6h.

## R3 — Character data
- **Decision**: `characterData.character(name, serverSlug, serverRegion)` with
  `zoneRankings(zoneID, metric)` for the table and `encounterRankings(encounterID, metric)`
  for the best kill's report/fight.
- **Note**: zoneRankings is JSON: `rankings[]` with `encounter`, `rankPercent`, `bestAmount`,
  `spec`, `totalKills`.

## R4 — Ability comparison
- **Decision**: `reportData.report(code)` → `fights`, `masterData.actors` (to map player name →
  sourceID), and `table(dataType: DamageDone|Healing|Casts, fightIDs, sourceID)`.
- **Rationale**: Tables return per‑ability totals and casts directly; no event paging.

## R5 — Metric per spec
- Healing specs (Holy Paladin, Holy/Discipline Priest, Restoration Shaman/Druid) → `hps`;
  all others → `dps`. Tanks are ranked by DPS on WCL classic sites.

## R6 — Class colours / parse colours
- Standard class colours (e.g. Druid #FF7C0A, Hunter #AAD372, Mage #3FC7EB, Paladin #F48CBA,
  Priest #FFFFFF, Rogue #FFF468, Shaman #0070DD, Warlock #8788EE, Warrior #C69B6D).
- Parse colours: <25 grey, 25 green, 50 blue, 75 purple, 95 orange, 99 pink, 100 gold.
