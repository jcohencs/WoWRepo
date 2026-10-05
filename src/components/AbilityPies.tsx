import { useState } from 'react';
import type { AbilityLine } from '../../shared/types';
import { percent } from '../lib/format';

/** Categorical slots (validated for the dark surface: CVD ΔE ≥ 8.4, normal-vision ΔE ≥ 19.3, ≥ 3:1 contrast). */
export const SLICE_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
const OTHER_COLOR = '#5b616b';
const MAX_NAMED = SLICE_COLORS.length;

export interface Slice {
  id: number | 'other';
  name: string;
  color: string;
  you: number;
  ref: number;
}

/**
 * The top abilities by the top 1% player's share, in a fixed order and colour shared by both
 * charts, plus one grey "Other" slice for everything else. A pie stays readable at ≤ 6 slices.
 */
export function buildSlices(abilities: AbilityLine[]): Slice[] {
  const ranked = abilities
    .filter((a) => (a.you?.share ?? 0) > 0 || (a.ref?.share ?? 0) > 0)
    .sort((a, b) => (b.ref?.share ?? 0) - (a.ref?.share ?? 0) || (b.you?.share ?? 0) - (a.you?.share ?? 0));
  const named = ranked.slice(0, MAX_NAMED);
  const rest = ranked.slice(MAX_NAMED);
  const slices: Slice[] = named.map((a, i) => ({ id: a.id, name: a.name, color: SLICE_COLORS[i], you: a.you?.share ?? 0, ref: a.ref?.share ?? 0 }));
  const other = { you: rest.reduce((s, a) => s + (a.you?.share ?? 0), 0), ref: rest.reduce((s, a) => s + (a.ref?.share ?? 0), 0) };
  if (other.you > 0.0005 || other.ref > 0.0005) slices.push({ id: 'other', name: 'Everything else', color: OTHER_COLOR, ...other });
  return slices;
}

export function AbilityPies({ abilities, noun }: { abilities: AbilityLine[]; noun: string }) {
  const slices = buildSlices(abilities);
  const [active, setActive] = useState<Slice['id'] | null>(null);
  if (!slices.length) return null;

  return (
    <div className="pies">
      <div className="pie-pair">
        <Donut label="You" slices={slices} pick={(s) => s.you} active={active} onHover={setActive} kind="you" />
        <Donut label="Top 1%" slices={slices} pick={(s) => s.ref} active={active} onHover={setActive} kind="ref" />
      </div>
      <table className="pie-legend">
        <thead>
          <tr>
            <th>Share of total {noun}</th>
            <th className="num">You</th>
            <th className="num">Top 1%</th>
            <th className="num">Difference</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s) => {
            const delta = s.you - s.ref;
            const pts = Math.abs(delta * 100);
            return (
              <tr
                key={s.id}
                className={active === s.id ? 'active' : active != null ? 'dim' : undefined}
                onPointerEnter={() => setActive(s.id)}
                onPointerLeave={() => setActive(null)}
              >
                <td>
                  <span className="swatch" style={{ background: s.color }} />
                  {s.name}
                </td>
                <td className="num">{percent(s.you)}</td>
                <td className="num">{percent(s.ref)}</td>
                <td className={`num pie-diff${pts >= 2 ? ' big' : ''}`}>
                  {pts < 0.3 ? 'same' : `${delta > 0 ? '+' : '−'}${pts.toFixed(1)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const SIZE = 168;
const STROKE = 26;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
/** Surface-coloured gap between slices, in px along the ring. */
const GAP = 2;

function Donut({
  label,
  slices,
  pick,
  active,
  onHover,
  kind,
}: {
  label: string;
  slices: Slice[];
  pick: (s: Slice) => number;
  active: Slice['id'] | null;
  onHover: (id: Slice['id'] | null) => void;
  kind: 'you' | 'ref';
}) {
  const total = slices.reduce((sum, s) => sum + pick(s), 0) || 1;
  let offset = 0;
  const focus = active != null ? slices.find((s) => s.id === active) : undefined;
  return (
    <figure className={`donut donut-${kind}`}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`${label}: ${slices.map((s) => `${s.name} ${percent(pick(s))}`).join(', ')}`}>
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {slices.map((s) => {
            const len = (pick(s) / total) * CIRC;
            const seg = Math.max(len - GAP, 0);
            const el = (
              <circle
                key={s.id}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={active === s.id ? STROKE + 6 : STROKE}
                strokeDasharray={`${seg} ${CIRC - seg}`}
                strokeDashoffset={-offset}
                opacity={active != null && active !== s.id ? 0.35 : 1}
                onPointerEnter={() => onHover(s.id)}
                onPointerLeave={() => onHover(null)}
              >
                <title>{`${s.name}: ${percent(pick(s))}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="50%" y="47%" textAnchor="middle" className="donut-value">
          {focus ? percent(pick(focus)) : label}
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="donut-sub">
          {focus ? (focus.name.length > 16 ? `${focus.name.slice(0, 15)}…` : focus.name) : 'of total'}
        </text>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
