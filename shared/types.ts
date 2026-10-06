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

/** Warcraft Logs hourly allowance as last reported; nulls until the first request this run. */
export interface ApiStatus {
  limitPerHour: number | null;
  pointsSpent: number | null;
  resetsInSec: number | null;
  savedResults: number;
  /** Lookups waiting for the next scheduled pull. */
  queued?: number;
  nextUpdateInSec?: number;
  /** Realm-wide sweep progress: raiders found, and how many are current for the latest raid. */
  realms?: { realm: string; characters: number; current: number }[];
}

export interface Meta {
  site: Site;
  demo: boolean;
  raids: Raid[];
  /** Short commit id of the running version. */
  version?: string;
}

export interface Character {
  name: string;
  realm: string;
  realmName: string;
  region: Region;
  className: string;
  /** e.g. "Orc"; null when Warcraft Logs has no profile data for the character. */
  race?: string | null;
}

export interface RankingEntry {
  name: string;
  server: string;
  amount: number;
  durationMs: number;
  reportCode: string;
  fightId: number;
}

/** Your best kill of a boss in one raid week (weeks start on the US reset, Tuesday). */
/** The extra charts of one side of a comparison, fetched after the first click. */
export interface SideExtras {
  timeline?: FightSide['timeline'];
  taken?: FightSide['taken'];
  prep?: FightSide['prep'];
}

export interface WeekPoint {
  /** Epoch ms of the week's reset. */
  week: number;
  perSecond: number;
  rankPercent: number | null;
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
  /** Amounts at fixed percentiles (10th … 99th), each read from its exact ranking position. */
  ladder?: { percentile: number; amount: number }[];
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
  /** When this character's data was pulled from Warcraft Logs (epoch ms). */
  updatedAt: number;
  /** The spec chosen with the spec bar, or null when each boss uses the character's best spec. */
  spec: string | null;
  /** The spec this page mostly shows (the chosen one, or the one the character plays most). */
  mainSpec: string;
  /** Every spec the character's class has, for the spec bar. */
  specs: string[];
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

/** Damage (or healing) taken, grouped by magic school. */
export interface SchoolTotal {
  school: string;
  perSecond: number;
}

/** Consumables and buffs during the kill. Uptimes are fractions of the fight (0–1). */
export interface Preparation {
  flask: number | null;
  food: number | null;
  potions: number;
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
  /** Running total of damage/healing, one point per `stepMs` from the pull. */
  timeline?: { stepMs: number; cumulative: number[] };
  taken?: SchoolTotal[];
  prep?: Preparation;
}

export interface Comparison {
  encounter: Encounter;
  metric: Metric;
  className: string;
  spec: string;
  you: FightSide;
  /** The top 1% player's kill, or null when there is no ranked log to compare against. */
  ref: FightSide | null;
  abilities: AbilityLine[];
  /** When these logs were pulled from Warcraft Logs (epoch ms). */
  updatedAt: number;
  /** Your best kill in each week you killed this boss, oldest first. */
  weeks?: WeekPoint[];
  /** The week being compared (epoch ms), or null for your best kill overall. */
  week?: number | null;
  /** p50/p99 and the percentile ladder for this boss and spec. */
  benchmark?: Benchmark | null;
}

export interface ApiError {
  error: { code: 'bad_request' | 'not_found' | 'upstream' | 'rate_limited' | 'config'; message: string };
}

/** The realms this app supports (US TBC Anniversary). Add entries here to support more. */
export const REALMS: readonly { name: string; slug: string }[] = [{ name: 'Nightslayer', slug: 'nightslayer' }];
export const REALM_REGION: Region = 'US';

export type Role = 'damage' | 'healing' | 'tank';

/** The realm's best player of one class and role (damage, healing or tanking) in a raid, from Warcraft Logs' realm rankings. */
export interface ClassLeader {
  className: string;
  role: Role;
  name: string;
  /** The spec they're ranked as most often. */
  spec: string;
  metric: Metric;
  /** Average of their DPS / HPS on the bosses they're ranked on. */
  perSecond: number;
  /** Bosses they're in the realm's top 100 for. */
  bosses: number;
  /** Bosses where they're the realm's #1 for their class. */
  firsts: number;
  /** Bosses in the raid. */
  bossCount: number;
}

/** The #1 players of every class on the realm in one raid. */
export interface Leaderboard {
  realm: string;
  raid: { id: string; name: string } | null;
  /** One entry per class, in class order: the damage #1, plus the healing and tanking #1 where the class has those specs. */
  classes: { className: string; leaders: ClassLeader[] }[];
  /** When Warcraft Logs was last asked; null if never. */
  updatedAt: number | null;
}
