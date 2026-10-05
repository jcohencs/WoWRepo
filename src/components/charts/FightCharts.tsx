import type { Benchmark, Comparison, SchoolTotal } from '../../../shared/types';
import { amount, compact, integer, metricLabel, percent } from '../../lib/format';
import { LineChart } from './LineChart';

const weekLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Your best kill each raid week, against today's typical player and top 1%. Click a week to compare it. */
export function WeeklyChart({
  data,
  week,
  onWeek,
}: {
  data: Comparison;
  week: number | null;
  onWeek: (week: number | null) => void;
}) {
  const weeks = data.weeks ?? [];
  const b = data.benchmark;
  const unit = metricLabel(data.metric);
  const selected = week == null ? null : weeks.findIndex((w) => w.week === week);
  return (
    <section className="chart-card weekly">
      <header>
        <div>
          <h3>Your {unit} by week</h3>
          <p className="soft">Your best kill each raid week. Click a week (or pick one) to compare that kill.</p>
        </div>
        <label className="week-pick">
          <span>Comparing</span>
          <select value={week ?? ''} onChange={(e) => onWeek(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Best kill overall</option>
            {[...weeks].reverse().map((w) => (
              <option key={w.week} value={w.week}>
                Week of {weekLabel(w.week)} · {amount(w.perSecond)}
              </option>
            ))}
          </select>
        </label>
      </header>
      {weeks.length < 2 ? (
        <p className="soft chart-empty">Only one week of kills so far — the trend appears from the second week.</p>
      ) : (
        <LineChart
          ariaLabel={`Your ${unit} by week`}
          xLabels={weeks.map((w) => weekLabel(w.week))}
          yFormat={(v) => integer(v)}
          height={190}
          selected={selected != null && selected >= 0 ? selected : null}
          onSelect={(i) => onWeek(weeks[i].week)}
          selectHint="Click to compare this week"
          series={[
            ...(b ? [{ name: 'Top 1% (now)', color: 'var(--ref)', values: weeks.map(() => b.p99), dashed: true }] : []),
            ...(b ? [{ name: 'Typical player (now)', color: 'var(--muted)', values: weeks.map(() => b.p50), dashed: true }] : []),
            { name: 'You', color: 'var(--you)', values: weeks.map((w) => w.perSecond), dots: true, area: true },
          ]}
        />
      )}
    </section>
  );
}

/** Running total of damage over the fight, you vs the top 1% player. */
export function FightTimeline({ data }: { data: Comparison }) {
  const sides = [
    { side: data.you, name: 'You', color: 'var(--you)' },
    ...(data.ref ? [{ side: data.ref, name: 'Top 1%', color: 'var(--ref)' }] : []),
  ].filter((s) => s.side.timeline);
  if (!sides.length) return null;
  const stepMs = sides[0].side.timeline!.stepMs;
  const steps = Math.max(...sides.map((s) => s.side.timeline!.cumulative.length));
  const labels = Array.from({ length: steps }, (_, i) => {
    const sec = Math.round((i * stepMs) / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  });
  const noun = data.metric === 'hps' ? 'healing' : 'damage';
  return (
    <section className="chart-card span-2">
      <header>
        <div>
          <h3>Output over the fight</h3>
          <p className="soft">Running total of {noun} from the pull. A steeper line means more {noun} in that part of the fight.</p>
        </div>
        <Legend items={sides.map((s) => ({ name: s.name, color: s.color }))} />
      </header>
      <LineChart
        ariaLabel={`Running total of ${noun} over the fight`}
        xLabels={labels}
        yFormat={(v) => compact(v)}
        height={220}
        zeroBased
        labelEvery={Math.max(1, Math.round(steps / 8))}
        series={sides.map((s) => ({ name: s.name, color: s.color, values: labels.map((_, i) => s.side.timeline!.cumulative[i] ?? null), area: s.name === 'You' }))}
      />
    </section>
  );
}

/** Damage taken per second by school, you vs the top 1% player. */
export function TakenChart({ data }: { data: Comparison }) {
  const you = data.you.taken ?? [];
  const ref = data.ref?.taken ?? [];
  const schools = [...new Set([...you, ...ref].map((t) => t.school))];
  if (!schools.length) return null;
  const get = (list: SchoolTotal[], s: string) => list.find((t) => t.school === s)?.perSecond ?? 0;
  const max = Math.max(...schools.flatMap((s) => [get(you, s), get(ref, s)]), 1);
  return (
    <section className="chart-card">
      <header>
        <div>
          <h3>Damage taken by type</h3>
          <p className="soft">Per second, by damage school. Less is usually better.</p>
        </div>
        {data.ref && <Legend items={[{ name: 'You', color: 'var(--you)' }, { name: 'Top 1%', color: 'var(--ref)' }]} />}
      </header>
      <div className="vbars" role="img" aria-label="Damage taken per second by school">
        {schools.map((s) => (
          <div className="vbar-group" key={s} title={`${s}: you ${integer(get(you, s))}/s${data.ref ? `, top 1% ${integer(get(ref, s))}/s` : ''}`}>
            <div className="vbar-pair">
              <span className="vbar you" style={{ height: `${(get(you, s) / max) * 100}%` }}>
                <em>{integer(get(you, s))}</em>
              </span>
              {data.ref && (
                <span className="vbar ref" style={{ height: `${(get(ref, s) / max) * 100}%` }}>
                  <em>{integer(get(ref, s))}</em>
                </span>
              )}
            </div>
            <span className="vbar-label">{s}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Flask/elixir and food uptime, potions and time active, you vs the top 1% player. */
export function PrepChart({ data }: { data: Comparison }) {
  const rows: { label: string; you: number | null; ref: number | null; kind: 'pct' | 'count' }[] = [
    { label: 'Flask / elixirs', you: data.you.prep?.flask ?? null, ref: data.ref?.prep?.flask ?? null, kind: 'pct' },
    { label: 'Food buff', you: data.you.prep?.food ?? null, ref: data.ref?.prep?.food ?? null, kind: 'pct' },
    { label: 'Time active', you: data.you.activeTime, ref: data.ref?.activeTime ?? null, kind: 'pct' },
    { label: 'Potions used', you: data.you.prep?.potions ?? null, ref: data.ref?.prep?.potions ?? null, kind: 'count' },
  ];
  if (!data.you.prep) return null;
  const maxCount = Math.max(1, ...rows.filter((r) => r.kind === 'count').flatMap((r) => [r.you ?? 0, r.ref ?? 0]));
  const fmt = (v: number | null, kind: 'pct' | 'count') => (v == null ? 'none' : kind === 'pct' ? percent(v, 0) : integer(v));
  const width = (v: number | null, kind: 'pct' | 'count') => `${v == null ? 0 : kind === 'pct' ? v * 100 : (v / maxCount) * 100}%`;
  return (
    <section className="chart-card">
      <header>
        <div>
          <h3>Preparation and uptime</h3>
          <p className="soft">Share of the fight each buff was up, and potions drunk.</p>
        </div>
        {data.ref && <Legend items={[{ name: 'You', color: 'var(--you)' }, { name: 'Top 1%', color: 'var(--ref)' }]} />}
      </header>
      {rows.map((r) => (
        <div className="casts-row prep-row" key={r.label} title={`${r.label}: you ${fmt(r.you, r.kind)}${data.ref ? `, top 1% ${fmt(r.ref, r.kind)}` : ''}`}>
          <span className="casts-name">
            <span>{r.label}</span>
          </span>
          <span className="casts-bars">
            <span className="cb you" style={{ width: width(r.you, r.kind) }}>
              <em>{fmt(r.you, r.kind)}</em>
            </span>
            {data.ref && (
              <span className="cb ref" style={{ width: width(r.ref, r.kind) }}>
                <em>{fmt(r.ref, r.kind)}</em>
              </span>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

/** Your DPS placed on the real percentile ladder (10th…99th) for your spec on this boss. */
export function RankLadder({ data }: { data: Comparison }) {
  const b: Benchmark | null | undefined = data.benchmark;
  const ladder = b?.ladder ?? [];
  if (ladder.length < 2) return null;
  const you = data.you.perSecond;
  const lo = Math.min(ladder[0].amount, you) * 0.95;
  const hi = Math.max(ladder[ladder.length - 1].amount, you) * 1.03;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const above = ladder.filter((l) => you >= l.amount).pop();
  return (
    <section className="chart-card span-2">
      <header>
        <div>
          <h3>Where you rank</h3>
          <p className="soft">
            {b!.sampleSize ? `${integer(b!.sampleSize)} ranked ${metricLabel(data.metric)} logs for your spec on this boss. ` : ''}
            {above ? `This kill beats the ${ordinal(above.percentile)} percentile.` : 'This kill is below the 10th percentile.'}
          </p>
        </div>
      </header>
      <div className="ladder" role="img" aria-label={`Your ${amount(you)} against the percentile ladder`}>
        <div className="ladder-track" />
        {ladder.map((l) => (
          <div key={l.percentile} className={`ladder-step${you >= l.amount ? ' passed' : ''}`} style={{ left: pos(l.amount) }} title={`${ordinal(l.percentile)} percentile: ${amount(l.amount)}`}>
            <span className="ladder-pct">{ordinal(l.percentile)}</span>
            <span className="ladder-tick" />
            <span className="ladder-val">{integer(l.amount)}</span>
          </div>
        ))}
        <div className="ladder-you" style={{ left: pos(you) }} title={`You: ${amount(you)}`}>
          <span>You · {integer(you)}</span>
        </div>
      </div>
    </section>
  );
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="legend chart-legend" aria-hidden>
      {items.map((i) => (
        <span key={i.name}>
          <i style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

