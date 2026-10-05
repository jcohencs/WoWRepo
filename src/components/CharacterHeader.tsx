import type { CSSProperties, ReactNode } from 'react';
import type { Site, ZoneReport } from '../../shared/types';
import { ago, CLASS_COLORS, specLabel } from '../lib/format';
import { characterUrl } from '../lib/links';
import { SpecIcon } from './SpecIcon';

export function CharacterHeader({ report, site, children }: { report: ZoneReport; site: Site; children?: ReactNode }) {
  const { character, rows } = report;
  const specs = [...new Set(rows.filter((r) => r.best != null).map((r) => r.spec))];
  const spec = specs.length ? specs.map(specLabel).join(' / ') : specLabel(rows[0]?.spec ?? '');
  return (
    <section className="character">
      <div>
      <h1 style={{ '--class': CLASS_COLORS[character.className] } as CSSProperties}>{character.name}</h1>
      <p>
        {specs.length === 1 && <SpecIcon className={character.className} spec={specs[0]} size={20} />}
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
        <span className="dot" aria-hidden>
          ·
        </span>
        <span className="soft" title={new Date(report.updatedAt).toLocaleString()}>
          Updated {ago(report.updatedAt)}
        </span>
      </p>
      </div>
      {children}
    </section>
  );
}
