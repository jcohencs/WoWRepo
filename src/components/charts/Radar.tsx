import type { BossRow, Comparison } from '../../../shared/types';
import { amount, integer, metricLabel, percent } from '../../lib/format';

interface Axis {
  label: string;
  /** You relative to the top 1% player: 1 = the same, above 1 = better. */
  ratio: number;
  detail: string;
}

/** Ratio where a smaller number is better (damage taken): flip it so outward is still better. */
const lowerIsBetter = (you: number, top: number) => (you <= 0 ? (top <= 0 ? 1 : 2) : top / you);
const higherIsBetter = (you: number, top: number) => (top <= 0 ? (you <= 0 ? 1 : 2) : you / top);

function axesFor(data: Comparison): Axis[] {
  const you = data.you;
  const top = data.ref;
  if (!top) return [];
  const unit = metricLabel(data.metric);
  const axes: Axis[] = [
    {
      label: unit,
      ratio: higherIsBetter(you.perSecond, top.perSecond),
      detail: `${amount(you.perSecond)} vs ${amount(top.perSecond)}`,
    },
  ];
  if (you.activeTime != null && top.activeTime != null) {
    axes.push({ label: 'Time active', ratio: higherIsBetter(you.activeTime, top.activeTime), detail: `${percent(you.activeTime, 0)} vs ${percent(top.activeTime, 0)}` });
  }
  if (you.taken && top.taken && (you.taken.length || top.taken.length)) {
    const sum = (t: { perSecond: number }[]) => t.reduce((n, x) => n + x.perSecond, 0);
    axes.push({
      label: 'Dmg taken',
      ratio: lowerIsBetter(sum(you.taken), sum(top.taken)),
      detail: `${integer(sum(you.taken))}/s vs ${integer(sum(top.taken))}/s (less is better)`,
    });
  }
  if (you.prep && top.prep) {
    if (top.prep.flask != null) {
      axes.push({ label: 'Flask / elixir', ratio: higherIsBetter(you.prep.flask ?? 0, top.prep.flask), detail: `${percent(you.prep.flask ?? 0, 0)} vs ${percent(top.prep.flask, 0)} uptime` });
    }
    if (top.prep.food != null) {
      axes.push({ label: 'Food buff', ratio: higherIsBetter(you.prep.food ?? 0, top.prep.food), detail: `${percent(you.prep.food ?? 0, 0)} vs ${percent(top.prep.food, 0)} uptime` });
    }
    if (you.prep.potions || top.prep.potions) {
      axes.push({ label: 'Potions', ratio: higherIsBetter(you.prep.potions, top.prep.potions), detail: `${you.prep.potions} vs ${top.prep.potions}` });
    }
  }
  return axes;
}

const MAX = 1.5; // the outer ring is 50% better than the top 1% player
const W = 300;
const H = 236;
const CX = W / 2;
const CY = H / 2 + 4;
const R = 80;

/** You against the top 1% player on each stat at once. Their line is the middle ring; outside it is better. */
export function PerformanceRadar({ data }: { data: Comparison | null }) {
  if (!data) return null;
  const axes = axesFor(data);
  if (axes.length < 3) {
    return (
      <section className="radar-card">
        <p className="sidebar-title">Performance profile</p>
        <p className="soft radar-empty">{data.ref ? 'Not enough data on this kill to compare yet.' : 'Shows once there is a top 1% log to compare with.'}</p>
      </section>
    );
  }

  const n = axes.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, ratio: number) => {
    const r = (Math.min(Math.max(ratio, 0), MAX) / MAX) * R;
    return [CX + r * Math.cos(angle(i)), CY + r * Math.sin(angle(i))] as const;
  };
  const poly = (ratio: (i: number) => number) =>
    axes.map((_, i) => point(i, ratio(i)).map((v) => v.toFixed(1)).join(',')).join(' ');

  return (
    <section className="radar-card">
      <p className="sidebar-title">Performance profile</p>
      <p className="soft radar-note">Each stat next to the top 1% player's. Their line is the dashed ring; further out is better.</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={axes.map((a) => `${a.label}: ${percent(a.ratio, 0)} of top 1%`).join('; ')}>
        {[0.5, 1, 1.5].map((ring) => (
          <polygon key={ring} points={poly(() => ring)} className={`radar-ring${ring === 1 ? ' mid' : ''}`} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, MAX);
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} className="radar-spoke" />;
        })}
        <polygon points={poly((i) => axes[i].ratio)} className="radar-you" />
        {axes.map((a, i) => {
          const [x, y] = point(i, a.ratio);
          return (
            <circle key={a.label} cx={x} cy={y} r={3.5} className="radar-dot">
              <title>{`${a.label}: ${a.detail} — ${percent(a.ratio, 0)} of the top 1% player`}</title>
            </circle>
          );
        })}
        {axes.map((a, i) => {
          const [x, y] = point(i, MAX + 0.22);
          const cos = Math.cos(angle(i));
          const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
          return (
            <text key={a.label} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="radar-label">
              <tspan x={x}>{a.label}</tspan>
              <tspan x={x} dy="13" className={a.ratio >= 1 ? 'pos' : 'neg'}>
                {percent(a.ratio, 0)}
              </tspan>
            </text>
          );
        })}
      </svg>
      <div className="legend chart-legend radar-legend" aria-hidden>
        <span>
          <i style={{ background: 'var(--you)' }} />
          You
        </span>
        <span>
          <i className="dashed" />
          Top 1%
        </span>
      </div>
    </section>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
const LABELLED = new Set([50, 75, 99]);

/** Compact percentile ladder for the boss header: where your best kill lands among everyone's. */
export function MiniLadder({ row, kill }: { row: BossRow; kill?: { amount: number; label: string } | null }) {
  const ladder = row.benchmark?.ladder ?? [];
  // The kill being compared below (best overall or a chosen week); the best kill until that loads.
  const you = kill?.amount ?? row.best;
  const what = kill?.label ?? 'Best kill';
  if (ladder.length < 2 || you == null) return null;
  const lo = Math.min(ladder[0].amount, you) * 0.97;
  const hi = Math.max(ladder[ladder.length - 1].amount, you) * 1.02;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const beaten = ladder.filter((l) => you >= l.amount).pop();
  return (
    <div className="mini-ladder" role="img" aria-label={beaten ? `${what} beats the ${ordinal(beaten.percentile)} percentile` : `${what} is below the 10th percentile`}>
      <div className="ml-track" />
      {ladder.map((l) => (
        <div key={l.percentile} className={`ml-step${you >= l.amount ? ' passed' : ''}`} style={{ left: pos(l.amount) }} title={`${ordinal(l.percentile)} percentile: ${amount(l.amount)}`}>
          {LABELLED.has(l.percentile) && <span>{ordinal(l.percentile)}</span>}
        </div>
      ))}
      <div className="ml-you" style={{ left: pos(you) }} title={`${what}: ${amount(you)}`} />
      <p className="ml-caption soft">{what} · {amount(you)} · {beaten ? `beats the ${ordinal(beaten.percentile)} percentile` : 'below the 10th percentile'}</p>
    </div>
  );
}
