import { Fragment, useState } from 'react';
import type { BossRow, Site, ZoneReport } from '../../shared/types';
import type { Query } from '../lib/api';
import { amount, gapText, integer, metricLabel, parse, parseTier, specLabel } from '../lib/format';
import { ComparePanel } from './ComparePanel';
import { ErrorBoundary } from './ErrorBoundary';

interface Props {
  report: ZoneReport;
  query: Query;
  site: Site;
  demo: boolean;
}

export function BossTable({ report, query, site, demo }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const metrics = new Set(report.rows.map((r) => r.metric));
  const unit = metrics.size === 1 ? metricLabel(report.rows[0].metric) : 'DPS / HPS';

  return (
    <>
      <div className="table-intro">
        <p>Click a boss to compare your log with a top 1% player's.</p>
        <div className="key" aria-hidden>
          <span className="key-you">Your best</span>
          <span className="key-mid">Typical player</span>
          <span className="key-top">Top 1%</span>
        </div>
      </div>
      <table className="bosses">
        <thead>
          <tr>
            <th className="col-boss">Boss</th>
            <th className="num col-parse">Parse</th>
            <th className="num">Your best {unit}</th>
            <th className="num" title="The median: half of players do more, half do less">
              Typical player
            </th>
            <th className="num" title="99th percentile: better than 99% of logged kills">
              Top 1%
            </th>
            <th className="num">You vs top 1%</th>
            <th className="col-range" aria-label="Where you sit" />
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => {
            const isOpen = open === row.encounter.id;
            const canOpen = row.best != null && row.benchmark != null;
            const toggle = () => setOpen(isOpen ? null : row.encounter.id);
            return (
              <Fragment key={row.encounter.id}>
                <tr
                  className={`boss${canOpen ? ' clickable' : ''}${isOpen ? ' open' : ''}${row.best == null ? ' unkilled' : ''}`}
                  onClick={canOpen ? toggle : undefined}
                  onKeyDown={canOpen ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle()) : undefined}
                  tabIndex={canOpen ? 0 : undefined}
                  aria-expanded={canOpen ? isOpen : undefined}
                >
                  <td className="col-boss">
                    <span className="boss-name">{row.encounter.name}</span>
                    <span className="boss-meta">
                      {specLabel(row.spec)}
                      {metrics.size > 1 && ` · ${metricLabel(row.metric)}`}
                      {row.kills > 0 ? ` · ${row.kills} ${row.kills === 1 ? 'kill' : 'kills'}` : ' · not killed yet'}
                    </span>
                  </td>
                  <td className={`num col-parse parse parse-${parseTier(row.rankPercent)}`} data-label="Parse">
                    {parse(row.rankPercent)}
                  </td>
                  <td className="num strong" data-label={`Your best ${unit}`}>
                    {amount(row.best)}
                  </td>
                  <td className="num soft" data-label="Typical player">
                    {amount(row.benchmark?.p50)}
                  </td>
                  <td className="num" data-label="Top 1%">
                    {amount(row.benchmark?.p99)}
                    {row.benchmark && <span className="sample">from {integer(row.benchmark.sampleSize)} logs</span>}
                  </td>
                  <td className={`num gap ${row.gap ? (row.gap.absolute >= 0 ? 'pos' : 'neg') : 'soft'}`} data-label="You vs top 1%">
                    {row.gap ? gapText(row.gap.percent) : '—'}
                  </td>
                  <td className="col-range">
                    <RangeBar row={row} />
                    {canOpen && <span className="chevron" aria-hidden />}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="compare-row">
                    <td colSpan={7}>
                      <ErrorBoundary what="this comparison">
                        <ComparePanel query={query} row={row} site={site} demo={demo} />
                      </ErrorBoundary>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function RangeBar({ row }: { row: BossRow }) {
  const b = row.benchmark;
  if (!b) return <div className="range empty" />;
  const max = Math.max(b.p99, row.best ?? 0) * 1.06;
  const pos = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="range" role="img" aria-label={row.best != null ? `${amount(row.best)} against top 1% ${amount(b.p99)}` : `Top 1% ${amount(b.p99)}`}>
      <div className="range-track" />
      {row.best != null && <div className={`range-fill fill-${parseTier(row.rankPercent)}`} style={{ width: pos(row.best) }} />}
      <div className="range-tick p50" style={{ left: pos(b.p50) }} title={`Typical player ${amount(b.p50)}`} />
      <div className="range-tick p99" style={{ left: pos(b.p99) }} title={`Top 1% ${amount(b.p99)}`} />
    </div>
  );
}
