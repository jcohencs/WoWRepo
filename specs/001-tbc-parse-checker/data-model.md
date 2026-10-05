# Data Model

All types live in `shared/types.ts`.

- **Zone** `{ id, name, encounters: { id, name }[] }`
- **CharacterRef** `{ region, realm, name }` — realm is normalised to a WCL slug.
- **Character** `{ name, realm, region, className, classSlug }`
- **Benchmark** `{ encounterId, className, spec, metric, sampleSize, p50, p99, reference? }`
  - `reference` = ranking entry at p99: `{ name, server, amount, reportCode, fightId, duration }`
- **BossRow** `{ encounter, spec, metric, kills, best?, rankPercent?, benchmark?, gapToP99? }`
  - `gapToP99 = { absolute: best − p99, percent: (best − p99) / p99 }`
- **ZoneReport** `{ character, zone, rows: BossRow[], summary }`
  - `summary = { averageParse, bossesAtP99, bossesKilled, medianGapPercent }`
- **AbilityLine** `{ id, name, icon, you?: AbilityStat, ref?: AbilityStat, shareDelta }`
  - `AbilityStat = { amount, share, casts, cpm }`
- **FightSide** `{ name, amount, perSecond, durationMs, activeTime, reportCode, fightId }`
- **Comparison** `{ encounter, metric, spec, you: FightSide, ref: FightSide, abilities: AbilityLine[] }`

Validation: region ∈ {US, EU, KR, TW, CN}; name 2–12 letters; realm non‑empty.
