import type { CSSProperties, ReactNode } from 'react';
import type { Site, ZoneReport } from '../../shared/types';
import { ago, CLASS_COLORS, specLabel } from '../lib/format';
import { characterUrl } from '../lib/links';
import { SpecIcon } from './SpecIcon';

interface Props {
  report: ZoneReport;
  site: Site;
  children?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshNote?: string | null;
}

export function CharacterHeader({ report, site, children, onRefresh, refreshing, refreshNote }: Props) {
  const { character, rows } = report;
  const specs = [...new Set(rows.filter((r) => r.best != null).map((r) => r.spec))];
  const spec = specs.length ? specs.map(specLabel).join(' / ') : specLabel(rows[0]?.spec ?? '');
  return (
    <section className="character">
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
        {onRefresh && (
          <button className="refresh-button" onClick={onRefresh} disabled={refreshing} title="Pull this character from Warcraft Logs again now">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className={refreshing ? 'spin' : undefined}>
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
        {refreshNote && <span className="refresh-note soft">{refreshNote}</span>}
      </p>
      {children}
    </section>
  );
}
