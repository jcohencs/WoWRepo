import type { Leaderboard, ApiStatus, Comparison, Raid, Site, ZoneReport } from '../shared/types.js';
import type { CharacterRef } from './core/input.js';

export interface Provider {
  readonly site: Site;
  readonly demo: boolean;
  status(): ApiStatus | null;
  /** Character names known on a realm (for search suggestions). */
  characterNames(realm: string): Promise<string[]>;
  raids(): Promise<Raid[]>;
  zoneReport(ref: CharacterRef, raidId?: string, spec?: string): Promise<ZoneReport>;
  compare(ref: CharacterRef, encounterId: number, spec: string, week?: number): Promise<Comparison>;
  /** The realm's #1 player of each class in a raid (main page). */
  leaders?(realm: string, raidId?: string): Promise<Leaderboard>;
  /** Pulls every released raid's #1 list now, outside the 10:00 AM schedule (admin link). */
  pullLeadersNow?(): Promise<{ raids: string[]; classesWithLeaders: number; message: string }>;
  /** Pulls the character's raid page again now (the page's Refresh button). */
  refresh(ref: CharacterRef, raidId?: string, spec?: string): Promise<ZoneReport>;
}
