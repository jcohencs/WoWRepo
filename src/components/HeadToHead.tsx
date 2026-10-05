import type { Comparison } from '../../shared/types';
import { amount, compact, duration, metricLabel, percent } from '../lib/format';

interface Stat {
  label: string;
  you: number;
  top: number;
  format: (v: number) => string;
  /** Kill time: shorter is better, so the comparison reads the other way round. */
  lowerIsBetter?: boolean;
}

/**
 * Meters for the headline numbers: the track is the top 1% player's value and the fill is yours,
 * so "84% of theirs" is visible at a glance.
 */
export function HeadToHead({ data }: { data: Comparison }) {
  const noun = data.metric === 'hps' ? 'healing' : 'damage';
  const stats: Stat[] = [
    { label: metricLabel(data.metric), you: data.you.perSecond, top: data.ref.perSecond, format: amount },
    { label: 'Kill time', you: data.you.durationMs, top: data.ref.durationMs, format: duration, lowerIsBetter: true },
    ...(data.you.activeTime != null && data.ref.activeTime != null
      ? [{ label: 'Time active', you: data.you.activeTime, top: data.ref.activeTime, format: (v: number) => percent(v) }]
      : []),
    { label: `Total ${noun}`, you: data.you.amount, top: data.ref.amount, format: compact },
  ];

  return (
    <div className="h2h">
      <div className="h2h-head">
        <h3>You vs the top 1%</h3>
        <div className="legend" aria-hidden>
          <span className="legend-you">You</span>
          <span className="legend-ref">Top 1%</span>
        </div>
      </div>
      {stats.map((s) => {
        const ratio = s.top > 0 ? s.you / s.top : 0;
        const max = Math.max(s.you, s.top) || 1;
        const better = s.lowerIsBetter ? s.you <= s.top : s.you >= s.top;
        const pct = Math.round(ratio * 100);
        const verdict = s.lowerIsBetter
          ? better
            ? `${Math.round((1 - ratio) * 100)}% faster`
            : `${Math.round((ratio - 1) * 100)}% slower`
          : `${pct}% of theirs`;
        return (
          <div className="h2h-row" key={s.label} title={`${s.label}: you ${s.format(s.you)}, top 1% ${s.format(s.top)}`}>
            <span className="h2h-label">{s.label}</span>
            <div className="h2h-bars">
              <span className="h2h-bar you" style={{ width: `${(s.you / max) * 100}%` }} />
              <span className="h2h-bar ref" style={{ width: `${(s.top / max) * 100}%` }} />
            </div>
            <span className="h2h-values">
              <strong>{s.format(s.you)}</strong>
              <span className="soft"> · {s.format(s.top)}</span>
            </span>
            <span className={`h2h-verdict ${better ? 'pos' : 'neg'}`}>{verdict}</span>
          </div>
        );
      })}
    </div>
  );
}
