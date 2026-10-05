import type { AbilityLine } from '../../shared/types';
import { abilityIcon } from '../lib/links';

/**
 * Paired bars of how often each ability is used per minute, you vs the top 1% player.
 * Missed casts on core abilities are the most common reason for a gap.
 */
export function CastsChart({ abilities, hasRef = true }: { abilities: AbilityLine[]; hasRef?: boolean }) {
  const rows = abilities
    .filter((a) => (a.you?.cpm ?? 0) > 0 || (a.ref?.cpm ?? 0) > 0)
    .sort((a, b) => (b.ref?.cpm ?? 0) - (a.ref?.cpm ?? 0) || (b.you?.cpm ?? 0) - (a.you?.cpm ?? 0));
  if (!rows.length) return null;
  const max = Math.max(...rows.map((a) => Math.max(a.you?.cpm ?? 0, a.ref?.cpm ?? 0)));

  return (
    <figure className="casts">
      <figcaption>
        <span>Buttons pressed per minute</span>
        {hasRef && (
          <span className="legend" aria-hidden>
            <span className="legend-you">You</span>
            <span className="legend-ref">Top 1%</span>
          </span>
        )}
      </figcaption>
      {rows.map((a) => {
        const you = a.you?.cpm ?? 0;
        const top = a.ref?.cpm ?? 0;
        const diff = you - top;
        const icon = abilityIcon(a.icon);
        return (
          <div className="casts-row" key={a.id} title={hasRef ? `${a.name}: you ${you.toFixed(1)}, top 1% ${top.toFixed(1)} per minute` : `${a.name}: ${you.toFixed(1)} per minute`}>
            <span className="casts-name">
              {icon ? <img src={icon} alt="" width={24} height={24} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="icon-blank sm" />}
              <span>{a.name}</span>
            </span>
            <span className="casts-bars">
              <span className="cb you" style={{ width: `${(you / max) * 100}%` }}>
                <em>{you ? you.toFixed(1) : '—'}</em>
              </span>
              {hasRef && (
                <span className="cb ref" style={{ width: `${(top / max) * 100}%` }}>
                  <em>{top ? top.toFixed(1) : '—'}</em>
                </span>
              )}
            </span>
            <span className={`casts-diff ${!hasRef || Math.abs(diff) < 0.3 ? 'soft' : diff < 0 ? 'neg' : 'pos'}`}>
              {!hasRef ? '' : Math.abs(diff) < 0.3 ? 'same' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)}`}
            </span>
          </div>
        );
      })}
    </figure>
  );
}
