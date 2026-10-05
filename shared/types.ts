export type Region = 'US' | 'EU' | 'KR' | 'TW' | 'CN';
export type Metric = 'dps' | 'hps';
export type Site = 'fresh' | 'classic';

export interface Encounter {
  id: number;
  name: string;
}

export interface Zone {
  id: number;
  name: string;
  encounters: Encounter[];
}

/** A single raid instance. Warcraft Logs groups some raids into one zone (e.g. BT + Hyjal). */
export interface Raid {
  /** `${zoneId}-${slug}` */
  id: string;
  name: string;
  zoneId: number;
  encounters: Encounter[];
}

export interface Realm {
  name: string;
  slug: string;
}

export interface Meta {
  site: Site;
  demo: boolean;
  raids: Raid[];
}

export interface Character {
  name: string;
  realm: string;
  realmName: string;
  region: Region;
  className: string;
}

export interface RankingEntry {
  name: string;
  server: string;
  amount: number;
  durationMs: number;
  reportCode: string;
  fightId: number;
}

export interface Benchmark {
  encounterId: number;
  className: string;
  spec: string;
  metric: Metric;
  /** Number of ranked parses the percentiles were read from. */
  sampleSize: number;
  p50: number;
  p99: number;
  /** The ranking entry sitting at the 99th percentile. */
  reference: RankingEntry;
}

export interface BossRow {
  encounter: Encounter;
  spec: string;
  metric: Metric;
  kills: number;
  best: number | null;
  rankPercent: number | null;
  benchmark: Benchmark | null;
  /** best − p99, and that difference as a fraction of p99. */
  gap: { absolute: number; percent: number } | null;
}

export interface ZoneSummary {
  bossesKilled: number;
  bossCount: number;
  averageParse: number | null;
  bossesAtP99: number;
  medianGapPercent: number | null;
}

export interface ZoneReport {
  character: Character;
  raid: Raid;
  rows: BossRow[];
  summary: ZoneSummary;
}

export interface AbilityStat {
  amount: number;
  /** Fraction of the player's total (0–1). */
  share: number;
  casts: number;
  cpm: number;
}

export interface AbilityLine {
  id: number;
  name: string;
  icon: string;
  you: AbilityStat | null;
  ref: AbilityStat | null;
  /** you.share − ref.share; missing side counts as 0. */
  shareDelta: number;
}

export interface FightSide {
  name: string;
  server: string;
  amount: number;
  perSecond: number;
  durationMs: number;
  /** Fraction of the fight spent casting/attacking (0–1), when known. */
  activeTime: number | null;
  reportCode: string;
  fightId: number;
}

export interface Comparison {
  encounter: Encounter;
  metric: Metric;
  className: string;
  spec: string;
  you: FightSide;
  ref: FightSide;
  abilities: AbilityLine[];
}

export interface ApiError {
  error: { code: 'bad_request' | 'not_found' | 'upstream' | 'rate_limited' | 'config'; message: string };
}
