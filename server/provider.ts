import type { ApiStatus, Comparison, Raid, Site, ZoneReport } from '../shared/types.js';
import type { CharacterRef } from './core/input.js';

export interface Provider {
  readonly site: Site;
  readonly demo: boolean;
  status(): ApiStatus | null;
  /** Character names known on a realm (for search suggestions). */
  characterNames(realm: string): Promise<string[]>;
  raids(): Promise<Raid[]>;
  zoneReport(ref: CharacterRef, raidId?: string): Promise<ZoneReport>;
  compare(ref: CharacterRef, encounterId: number, spec: string): Promise<Comparison>;
}
