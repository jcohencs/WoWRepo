import type { ZoneSummary } from '../../shared/types';
import { parse, parseTier, signedPercent } from '../lib/format';

export function Summary({ summary }: { summary: ZoneSummary }) {
  const gap = summary.medianGapPercent;
  return (
    <dl className="summary">
      <div>
        <dt>Average parse</dt>
        <dd className={`parse-${parseTier(summary.averageParse)}`}>{parse(summary.averageParse)}</dd>
      </div>
      <div>
        <dt>At or above p99</dt>
        <dd>
          {summary.bossesAtP99}
          <small> / {summary.bossesKilled}</small>
        </dd>
      </div>
      <div>
        <dt>Median gap to p99</dt>
        <dd className={gap == null ? undefined : gap >= 0 ? 'pos' : 'neg'}>{signedPercent(gap)}</dd>
      </div>
      <div>
        <dt>Bosses killed</dt>
        <dd>
          {summary.bossesKilled}
          <small> / {summary.bossCount}</small>
        </dd>
      </div>
    </dl>
  );
}
