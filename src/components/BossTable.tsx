import { Fragment, useState } from 'react';
import type { BossRow, Site, ZoneReport } from '../../shared/types';
import type { Query } from '../lib/api';
import { amount, integer, metricLabel, parse, parseTier, signedPercent, specLabel } from '../lib/format';
import { ComparePanel } from './ComparePanel';

interface Props {
  report: ZoneReport;
  query: Query;
  site: Site;
  demo: boolean;
}

export function BossTable({ report, query, site, demo }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const metrics = new Set(report.rows.map((r) => r.metric));
  const unit = metrics.size === 1 ? metricLabel(report.rows[0].metric) : 'Amount';

  return (
    <table className="bosses">
      <thead>
        <tr>
          <th className="col-boss">Boss</th>
          <th className="num col-parse">Parse</th>
          <th className="num">Your best {unit}</th>
          <th className="num">Median</th>
          <th className="num">99th pct</th>
          <th className="num">Gap to p99</th>
          <th className="col-range" aria-label="Position against median and 99th percentile" />
        </tr>
      </thead>
      <tbody>
        {report.rows.map((row) => {
          const isOpen = open === row.encounter.id;
          const canOpen = row.best != null && row.benchmark != null;
          return (
            <Fragment key={row.encounter.id}>
              <tr
                className={`boss${canOpen ? ' clickable' : ''}${isOpen ? ' open' : ''}${row.best == null ? ' unkilled' : ''}`}
                onClick={canOpen ? () => setOpen(isOpen ? null : row.encounter.id) : undefined}
                onKeyDown={canOpen ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(isOpen ? null : row.encounter.id)) : undefined}
                tabIndex={canOpen ? 0 : undefined}
                aria-expanded={canOpen ? isOpen : undefined}
              >
                <td className="col-boss">
                  <span className="boss-name">{row.encounter.name}</span>
                  <span className="boss-meta">
                    {specLabel(row.spec)}
                    {metrics.size > 1 && ` · ${metricLabel(row.metric)}`}
                    {row.kills > 0 ? ` · ${row.kills} ${row.kills === 1 ? 'kill' : 'kills'}` : ' · No kill'}
                  </span>
                </td>
                <td className={`num col-parse parse parse-${parseTier(row.rankPercent)}`} data-label="Parse">
                  {parse(row.rankPercent)}
                </td>
                <td className="num strong" data-label={`Best ${unit}`}>
                  {amount(row.best)}
                </td>
                <td className="num muted" data-label="Median">
                  {amount(row.benchmark?.p50)}
                </td>
                <td className="num" data-label="99th pct">
                  {amount(row.benchmark?.p99)}
                  {row.benchmark && <span className="sample">n = {integer(row.benchmark.sampleSize)}</span>}
                </td>
                <td className={`num gap ${row.gap ? (row.gap.absolute >= 0 ? 'pos' : 'neg') : ''}`} data-label="Gap">
                  {row.gap ? signedPercent(row.gap.percent) : '—'}
                </td>
                <td className="col-range">
                  <RangeBar row={row} />
                  {canOpen && <span className="chevron" aria-hidden />}
                </td>
              </tr>
              {isOpen && (
                <tr className="compare-row">
                  <td colSpan={7}>
                    <ComparePanel query={query} row={row} site={site} demo={demo} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function RangeBar({ row }: { row: BossRow }) {
  const b = row.benchmark;
  if (!b) return <div className="range empty" />;
  const max = Math.max(b.p99, row.best ?? 0) * 1.06;
  const pos = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="range" role="img" aria-label={row.best != null ? `${amount(row.best)} against p99 ${amount(b.p99)}` : `p99 ${amount(b.p99)}`}>
      <div className="range-track" />
      {row.best != null && <div className={`range-fill fill-${parseTier(row.rankPercent)}`} style={{ width: pos(row.best) }} />}
      <div className="range-tick p50" style={{ left: pos(b.p50) }} title={`Median ${amount(b.p50)}`} />
      <div className="range-tick p99" style={{ left: pos(b.p99) }} title={`99th percentile ${amount(b.p99)}`} />
    </div>
  );
}
