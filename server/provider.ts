import type { Comparison, Raid, Realm, Region, Site, ZoneReport } from '../shared/types.js';
import type { CharacterRef } from './core/input.js';

export interface Provider {
  readonly site: Site;
  readonly demo: boolean;
  raids(): Promise<Raid[]>;
  realms(region: Region): Promise<Realm[]>;
  zoneReport(ref: CharacterRef, raidId?: string): Promise<ZoneReport>;
  compare(ref: CharacterRef, encounterId: number, spec: string): Promise<Comparison>;
}
