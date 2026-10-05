import type { BossRow } from '../../shared/types';
import { amount, gapText, parse, parseTier } from '../lib/format';

/** Gridlines at the parse colour boundaries players care about. */
const TIERS = [25, 50, 75, 95];

/** Short boss names for the axis ("High Warlord Naj'entus" → "Naj'entus"); the full name is in the tooltip. */
export function shortBossName(name: string): string {
  const cleaned = name.replace(/^(The|High Warlord|High King|High Astromancer|Lady|Fathom-Lord|Hex Lord|Shade of|Reliquary of|Mother)\s+/i, '');
  const words = cleaned.split(/\s+/);
  return cleaned.length <= 12 ? cleaned : words[0].length >= 5 ? words[0] : words[words.length - 1];
}

/** Column chart of your parse on every boss in the raid, coloured like Warcraft Logs. */
export function ParseChart({ rows }: { rows: BossRow[] }) {
  return (
    <figure className="parse-chart">
      <figcaption>
        <span>Parse by boss</span>
        <span className="soft">0–100, higher is better</span>
      </figcaption>
      <div className="pc-plot">
        <div className="pc-grid" aria-hidden>
          {TIERS.map((t) => (
            <span key={t} style={{ bottom: `${t}%` }}>
              <em>{t}</em>
            </span>
          ))}
        </div>
        <ol className="pc-bars">
          {rows.map((r) => {
            const p = r.rankPercent;
            const tip =
              p == null
                ? `${r.encounter.name}: not killed yet`
                : `${r.encounter.name}: parse ${parse(p)}, best ${amount(r.best)}${r.gap ? `, ${gapText(r.gap.percent)} the top 1%` : ''}`;
            return (
              <li key={r.encounter.id} title={tip}>
                <div className="pc-col">
                  {p != null ? (
                    <>
                      <span className={`pc-value parse-${parseTier(p)}`} style={{ bottom: `${Math.max(p, 2)}%` }}>
                        {parse(p)}
                      </span>
                      <span className={`pc-bar fill-${parseTier(p)}`} style={{ height: `${Math.max(p, 2)}%` }} />
                    </>
                  ) : (
                    <span className="pc-value pc-none" style={{ bottom: 0 }}>
                      —
                    </span>
                  )}
                </div>
                <span className="pc-label">{shortBossName(r.encounter.name)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </figure>
  );
}
