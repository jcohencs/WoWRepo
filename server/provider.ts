import type { ApiStatus, Comparison, Raid, Site, ZoneReport } from '../shared/types.js';
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
  /** Pulls the character's raid page again now (the page's Refresh button). */
  refresh(ref: CharacterRef, raidId?: string, spec?: string): Promise<ZoneReport>;
}
