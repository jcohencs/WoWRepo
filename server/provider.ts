import type { Comparison, Site, Zone, ZoneReport } from '../shared/types.js';
import type { CharacterRef } from './core/input.js';

export interface Provider {
  readonly site: Site;
  readonly demo: boolean;
  zones(): Promise<Zone[]>;
  zoneReport(ref: CharacterRef, zoneId?: number): Promise<ZoneReport>;
  compare(ref: CharacterRef, encounterId: number, spec: string): Promise<Comparison>;
}
