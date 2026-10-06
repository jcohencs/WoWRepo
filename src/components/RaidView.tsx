import { useEffect, useState } from 'react';
import type { BossRow, Comparison, Site, ZoneReport } from '../../shared/types';
import type { Query } from '../lib/api';
import { amount, gapText, integer, metricLabel, parse, parseTier, specLabel } from '../lib/format';
import { PrepChart } from './charts/FightCharts';
import { MiniLadder, PerformanceRadar } from './charts/Radar';
import { SpecLinksCard } from './ClassGuides';
import { ComparePanel } from './ComparePanel';
import { ErrorBoundary } from './ErrorBoundary';

interface Props {
  report: ZoneReport;
  query: Query;
  site: Site;
  demo: boolean;
  navigate: (path: string) => void;
}

/**
 * The raid page: a slim sidebar (summary + every boss with its parse bar, which doubles as the
 * "parse by boss" chart) and a main area showing the selected boss's numbers and full breakdown.
 */
export function RaidView({ report, query, site, demo, navigate }: Props) {
  const firstKill = report.rows.find((r) => r.best != null)?.encounter.id ?? null;
  const [selected, setSelected] = useState<number | null>(firstKill);

  // Keep the selection when switching spec or raid if that boss is still there; else pick the first kill.
  useEffect(() => {
    setSelected((cur) => (report.rows.some((r) => r.encounter.id === cur && r.best != null) ? cur : firstKill));
  }, [report, firstKill]);

  const row = report.rows.find((r) => r.encounter.id === selected) ?? null;
  // The comparison the main area loaded, for the profile under the boss list.
  const [shown, setShown] = useState<Comparison | null>(null);
  useEffect(() => setShown(null), [row?.encounter.id, row?.spec]);
  const s = report.summary;

  return (
    <div className="raid-view">
      <aside className="sidebar-col">
        <div className="sidebar">
        <dl className="mini-summary">
          <div>
            <dt>Avg parse</dt>
            <dd className={`parse-${parseTier(s.averageParse)}`}>{parse(s.averageParse)}</dd>
          </div>
          <div>
            <dt>Top 1% on</dt>
            <dd>
              {s.bossesAtP99}
              <small> / {s.bossesKilled}</small>
            </dd>
          </div>
          <div>
            <dt>Usual gap</dt>
            <dd className={s.medianGapPercent == null ? undefined : s.medianGapPercent >= 0 ? 'pos' : 'neg'}>{gapText(s.medianGapPercent)}</dd>
          </div>
          <div>
            <dt>Killed</dt>
            <dd>
              {s.bossesKilled}
              <small> / {s.bossCount}</small>
            </dd>
          </div>
        </dl>

        <p className="sidebar-title">Parse by boss</p>
        <ol className="boss-nav">
          {report.rows.map((r) => {
            const killed = r.best != null;
            const tier = parseTier(r.rankPercent);
            return (
              <li key={r.encounter.id}>
                <button
                  className={`boss-pick${r.encounter.id === selected ? ' active' : ''}`}
                  disabled={!killed}
                  onClick={() => setSelected(r.encounter.id)}
                  aria-current={r.encounter.id === selected ? 'true' : undefined}
                  title={killed ? `${r.encounter.name}: parse ${parse(r.rankPercent)}` : `${r.encounter.name}: not killed yet`}
                >
                  <span className="bp-name">{r.encounter.name}</span>
                  <span className={`bp-parse parse-${tier}`}>{killed ? parse(r.rankPercent) : '—'}</span>
                  <span className="bp-bar">
                    {killed && <span className={`fill-${tier}`} style={{ width: `${Math.max(r.rankPercent ?? 0, 2)}%` }} />}
                  </span>
                  <span className={`bp-gap ${r.gap ? (r.gap.absolute >= 0 ? 'pos' : 'neg') : 'soft'}`}>
                    {killed ? (r.gap ? gapText(r.gap.percent) : 'no top 1% yet') : 'not killed yet'}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        </div>

        <ErrorBoundary what="the performance profile" resetKey={shown}>
          <PerformanceRadar data={shown} />
        </ErrorBoundary>
        <ErrorBoundary what="preparation" resetKey={shown}>
          <PrepChart data={shown} compact />
        </ErrorBoundary>
        <SpecLinksCard name={report.character.className} spec={row?.spec ?? report.spec ?? report.mainSpec ?? ''} navigate={navigate} />
      </aside>

      <section className="boss-main">
        {row ? (
          <>
            <BossStats row={row} shown={shown} />
            <ErrorBoundary what="this breakdown" resetKey={`${row.encounter.id}|${row.spec}`}>
              <ComparePanel key={`${row.encounter.id}|${row.spec}|${report.updatedAt}`} query={query} row={row} site={site} demo={demo} onData={setShown} />
            </ErrorBoundary>
          </>
        ) : (
          <div className="state">No kills in this raid yet{report.spec ? ` as ${specLabel(report.spec)}` : ''}.</div>
        )}
      </section>
    </div>
  );
}

/** The selected boss's headline numbers: what used to be its row in the boss table. */
function BossStats({ row, shown }: { row: BossRow; shown: Comparison | null }) {
  // "Where you sit" follows the log being compared: the best kill, or the week picked below.
  const kill =
    shown && shown.encounter.id === row.encounter.id && shown.spec === row.spec
      ? {
          amount: shown.you.perSecond,
          label: shown.week ? `Week of ${new Date(shown.week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Best kill',
        }
      : null;
  const b = row.benchmark;
  const unit = metricLabel(row.metric);
  return (
    <header className="boss-stats">
      <div className="bs-title">
        <h2>{row.encounter.name}</h2>
        <span className="soft">
          {specLabel(row.spec)} · {row.kills} {row.kills === 1 ? 'kill' : 'kills'}
        </span>
      </div>
      <dl className="bs-tiles">
        <div>
          <dt>Parse</dt>
          <dd className={`parse-${parseTier(row.rankPercent)}`}>{parse(row.rankPercent)}</dd>
        </div>
        <div>
          <dt>Your best {unit}</dt>
          <dd>{amount(row.best)}</dd>
        </div>
        <div>
          <dt title="The median: half of players do more, half do less">Typical {unit}</dt>
          <dd className="soft">{amount(b?.p50)}</dd>
        </div>
        <div>
          <dt title="99th percentile: better than 99% of logged kills">Top 1% {unit}</dt>
          <dd>
            {amount(b?.p99)}
            {b && <small>from {integer(b.sampleSize)} logs</small>}
          </dd>
        </div>
        <div>
          <dt>You vs top 1%</dt>
          <dd className={row.gap ? (row.gap.absolute >= 0 ? 'pos' : 'neg') : 'soft'}>{row.gap ? gapText(row.gap.percent) : '—'}</dd>
        </div>
        <div className="bs-range">
          <dt>Where you sit</dt>
          <dd>{row.benchmark?.ladder && row.benchmark.ladder.length > 1 && row.best != null ? <MiniLadder row={row} kill={kill} /> : <RangeBar row={row} />}</dd>
        </div>
      </dl>
    </header>
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
