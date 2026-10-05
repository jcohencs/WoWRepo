import type { ZoneSummary } from '../../shared/types';
import { gapText, parse, parseTier } from '../lib/format';

export function Summary({ summary }: { summary: ZoneSummary }) {
  const gap = summary.medianGapPercent;
  return (
    <dl className="summary">
      <div>
        <dt>Average parse</dt>
        <dd className={`parse-${parseTier(summary.averageParse)}`}>{parse(summary.averageParse)}</dd>
      </div>
      <div>
        <dt>Bosses where you're top 1%</dt>
        <dd>
          {summary.bossesAtP99}
          <small> of {summary.bossesKilled}</small>
        </dd>
      </div>
      <div>
        <dt>Usual distance from top 1%</dt>
        <dd className={gap == null ? undefined : gap >= 0 ? 'pos' : 'neg'}>{gapText(gap)}</dd>
      </div>
      <div>
        <dt>Bosses killed</dt>
        <dd>
          {summary.bossesKilled}
          <small> of {summary.bossCount}</small>
        </dd>
      </div>
    </dl>
  );
}
