import type { ReactNode } from 'react';
import type { Site, ZoneReport } from '../../shared/types';
import { CLASS_COLORS, specLabel } from '../lib/format';
import { characterUrl } from '../lib/links';

export function CharacterHeader({ report, site, children }: { report: ZoneReport; site: Site; children?: ReactNode }) {
  const { character, rows } = report;
  const specs = [...new Set(rows.filter((r) => r.best != null).map((r) => r.spec))];
  const spec = specs.length ? specs.map(specLabel).join(' / ') : specLabel(rows[0]?.spec ?? '');
  return (
    <section className="character">
      <div>
      <h1 style={{ color: CLASS_COLORS[character.className] }}>{character.name}</h1>
      <p>
        {spec} {character.className}
        <span className="dot" aria-hidden>
          ·
        </span>
        {character.realmName} ({character.region})
        <span className="dot" aria-hidden>
          ·
        </span>
        <a href={characterUrl(site, character.region, character.realm, character.name)} target="_blank" rel="noreferrer">
          View on Warcraft Logs ↗
        </a>
      </p>
      </div>
      {children}
    </section>
  );
}
