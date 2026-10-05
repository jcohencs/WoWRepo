import type { Site } from '../../shared/types';

export const wclBase = (site: Site) => `https://${site}.warcraftlogs.com`;

export const reportUrl = (site: Site, code: string, fightId: number) => `${wclBase(site)}/reports/${code}#fight=${fightId}`;

export const characterUrl = (site: Site, region: string, realm: string, name: string) =>
  `${wclBase(site)}/character/${region.toLowerCase()}/${realm}/${encodeURIComponent(name.toLowerCase())}`;

export const abilityIcon = (icon: string) => (icon ? `https://assets.rpglogs.com/img/warcraft/abilities/${icon}` : '');
