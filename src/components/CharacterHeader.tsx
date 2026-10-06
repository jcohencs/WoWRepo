import type { CSSProperties, ReactNode } from 'react';
import type { Site, ZoneReport } from '../../shared/types';
import { classIconUrl } from '../lib/classes';
import { ago, CLASS_COLORS, specLabel } from '../lib/format';
import { characterUrl } from '../lib/links';
import { SpecIcon } from './SpecIcon';

interface Props {
  report: ZoneReport;
  site: Site;
  /** The spec and raid pickers, shown in the box's bottom strip. */
  children?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshNote?: string | null;
}

/** The character's box: who they are, when the data is from, and the spec / raid pickers. */
export function CharacterHeader({ report, site, children, onRefresh, refreshing, refreshNote }: Props) {
  const { character, rows } = report;
  const specs = [...new Set(rows.filter((r) => r.best != null).map((r) => r.spec))];
  const spec = specs.length ? specs.map(specLabel).join(' / ') : specLabel(rows[0]?.spec ?? '');
  return (
    <section className="character-box" style={{ '--class': CLASS_COLORS[character.className] } as CSSProperties}>
      <div className="cb-top">
        <div className="cb-who">
          <img
            className="cb-class-icon"
            src={classIconUrl(character.className)}
            alt=""
            width={52}
            height={52}
            onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
          />
          <div>
            <h1>{character.name}</h1>
            <p>
              {specs.length === 1 && <SpecIcon className={character.className} spec={specs[0]} size={18} />}
              {spec} {character.className}
              {character.race && (
                <>
                  <span className="dot" aria-hidden>
                    ·
                  </span>
                  {character.race}
                </>
              )}
              <span className="dot" aria-hidden>
                ·
              </span>
              {character.realmName} ({character.region})
            </p>
          </div>
        </div>

        <div className="cb-tiles">
          <div className="cb-tile">
            <span className="cb-tile-label">Data from</span>
            <span className="cb-tile-value" title={new Date(report.updatedAt).toLocaleString()}>
              {ago(report.updatedAt)}
            </span>
          </div>
          {onRefresh && (
            <button className="cb-tile cb-action" onClick={onRefresh} disabled={refreshing} title="Pull this character from Warcraft Logs again now">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden className={refreshing ? 'spin' : undefined}>
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
          <a className="cb-tile cb-action" href={characterUrl(site, character.region, character.realm, character.name)} target="_blank" rel="noreferrer">
            Warcraft Logs ↗
          </a>
        </div>
      </div>
      {refreshNote && <p className="cb-note soft">{refreshNote}</p>}
      {children && <div className="cb-controls">{children}</div>}
    </section>
  );
}
