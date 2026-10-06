import type { Comparison, SchoolTotal } from '../../../shared/types';
import { compact, integer, metricLabel, percent } from '../../lib/format';
import { LineChart } from './LineChart';

const weekLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Which of your kills is compared: your best kill overall, or your best kill in the latest raid
 * week. Only these two, so a visit costs at most two comparisons.
 */
export function KillPicker({ data, week, onWeek }: { data: Comparison; week: number | null; onWeek: (week: number | null) => void }) {
  const weeks = data.weeks ?? [];
  const latest = weeks.at(-1);
  const best = weeks.length ? weeks.reduce((a, b) => (b.perSecond > a.perSecond ? b : a)) : null;
  const latestIsBest = latest != null && best != null && latest.week === best.week;
  const unit = metricLabel(data.metric);
  return (
    <section className="chart-card kill-picker">
      <div className="segmented" role="tablist" aria-label="Which kill to compare">
        <button role="tab" aria-selected={week == null} aria-pressed={week == null} onClick={() => onWeek(null)}>
          Best kill{best ? ` · ${integer(best.perSecond)} ${unit}` : ''}
        </button>
        <button
          role="tab"
          aria-selected={week != null}
          aria-pressed={week != null}
          disabled={!latest || latestIsBest}
          onClick={() => latest && onWeek(latest.week)}
          title={latestIsBest ? 'Your best kill is from the latest week' : undefined}
        >
          Latest week{latest ? ` (${weekLabel(latest.week)}) · ${integer(latest.perSecond)} ${unit}` : ''}
        </button>
      </div>
      {latestIsBest && <span className="soft kp-note">Your best kill is from the latest week.</span>}
    </section>
  );
}

/** Running total of damage over the fight, you vs the #1. */
export function FightTimeline({ data }: { data: Comparison }) {
  const sides = [
    { side: data.you, name: 'You', color: 'var(--you)' },
    ...(data.ref ? [{ side: data.ref, name: '#1', color: 'var(--ref)' }] : []),
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
    <section className="chart-card">
      <header>
        <div>
          <h3>Output over the fight</h3>
          <p className="soft">Running total of {noun} from the pull, with a dot every 15 seconds. A steeper line means more {noun} in that part of the fight.</p>
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
        series={sides.map((s) => ({ name: s.name, color: s.color, values: labels.map((_, i) => s.side.timeline!.cumulative[i] ?? null), area: s.name === 'You', dots: true, dotRadius: 3.5 }))}
      />
    </section>
  );
}

/** Damage taken per second by school, you vs the #1. */
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
        {data.ref && <Legend items={[{ name: 'You', color: 'var(--you)' }, { name: '#1', color: 'var(--ref)' }]} />}
      </header>
      <div className="vbars" role="img" aria-label="Damage taken per second by school">
        {schools.map((s) => (
          <div className="vbar-group" key={s} title={`${s}: you ${integer(get(you, s))}/s${data.ref ? `, #1 ${integer(get(ref, s))}/s` : ''}`}>
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

/** Flask/elixir and food uptime, potions and time active, you vs the #1. */
export function PrepChart({ data, compact = false }: { data: Comparison | null; compact?: boolean }) {
  if (!data) return null;
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
    <section className={compact ? 'side-card prep-card' : 'chart-card'}>
      {compact ? (
        <header className="side-card-head">
          <p className="sidebar-title">Prep &amp; uptime</p>
          {data.ref && <Legend items={[{ name: 'You', color: 'var(--you)' }, { name: '#1', color: 'var(--ref)' }]} />}
        </header>
      ) : (
        <header>
          <div>
            <h3>Preparation and uptime</h3>
            <p className="soft">Share of the fight each buff was up, and potions drunk.</p>
          </div>
          {data.ref && <Legend items={[{ name: 'You', color: 'var(--you)' }, { name: '#1', color: 'var(--ref)' }]} />}
        </header>
      )}
      {rows.map((r) => (
        <div className="casts-row prep-row" key={r.label} title={`${r.label}: you ${fmt(r.you, r.kind)}${data.ref ? `, #1 ${fmt(r.ref, r.kind)}` : ''}`}>
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

