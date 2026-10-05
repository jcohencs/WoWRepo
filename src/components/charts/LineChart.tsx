import { useEffect, useRef, useState } from 'react';

export interface LineSeries {
  name: string;
  /** CSS colour, e.g. 'var(--you)'. */
  color: string;
  /** One value per x position; null leaves a gap. */
  values: (number | null)[];
  dashed?: boolean;
  /** Shade the area under the line. */
  area?: boolean;
  /** Draw a dot on each point. */
  dots?: boolean;
  /** Dot size (default 4). */
  dotRadius?: number;
}

interface Props {
  series: LineSeries[];
  xLabels: string[];
  yFormat: (v: number) => string;
  height?: number;
  /** Start the y axis at zero instead of just below the smallest value. */
  zeroBased?: boolean;
  /** Index of a highlighted x position (e.g. the selected week). */
  selected?: number | null;
  onSelect?: (index: number) => void;
  /** Show only every n-th x label so they don't collide. */
  labelEvery?: number;
  /** Hint shown in the tooltip when points are clickable. */
  selectHint?: string;
  ariaLabel: string;
}

const PAD = { top: 12, right: 16, bottom: 26, left: 56 };

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const mult = [1, 2, 2.5, 5, 10].find((m) => span / (step * m) <= count) ?? 10;
  const s = step * mult;
  const start = Math.floor(min / s) * s;
  const ticks: number[] = [];
  for (let v = start; v <= max + s * 0.5; v += s) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/** Small dependency-free SVG line chart that fills its container's width. */
export function LineChart({ series, xLabels, yFormat, height = 200, zeroBased, selected, onSelect, labelEvery = 1, selectHint, ariaLabel }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = xLabels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (!n || !all.length) return <div ref={box} className="chart-empty soft">Not enough data yet.</div>;

  const rawMin = zeroBased ? 0 : Math.min(...all);
  const rawMax = Math.max(...all);
  const pad = (rawMax - rawMin) * 0.08 || rawMax * 0.1 || 1;
  const ticks = niceTicks(zeroBased ? 0 : rawMin - pad, rawMax + pad);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => PAD.top + h - ((v - yMin) / (yMax - yMin || 1)) * h;

  const path = (values: (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  // Hover: nearest x position to the pointer.
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - PAD.left;
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / (w || 1)) * (n - 1)))));
  };

  const tipIndex = hover ?? null;
  return (
    <div ref={box} className="line-chart">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={onSelect && hover != null ? () => onSelect(hover) : undefined}
        style={{ cursor: onSelect ? 'pointer' : undefined }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="lc-grid" />
            <text x={PAD.left - 8} y={y(t)} className="lc-tick" textAnchor="end" dominantBaseline="middle">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xLabels.map((l, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={height - 6} className="lc-tick" textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
        {selected != null && <line x1={x(selected)} x2={x(selected)} y1={PAD.top} y2={PAD.top + h} className="lc-selected" />}
        {series.map((s) =>
          s.area ? (
            <path
              key={`${s.name}-area`}
              d={`${path(s.values)}L${x(s.values.length - 1)},${y(yMin)}L${x(0)},${y(yMin)}Z`}
              style={{ fill: s.color }}
              className="lc-area"
            />
          ) : null,
        )}
        {series.map((s) => (
          <path key={s.name} d={path(s.values)} style={{ stroke: s.color }} className={`lc-line${s.dashed ? ' dashed' : ''}`} />
        ))}
        {series.map((s) =>
          s.dots
            ? s.values.map((v, i) =>
                v == null ? null : (
                  <circle key={`${s.name}-${i}`} cx={x(i)} cy={y(v)} r={i === selected ? (s.dotRadius ?? 4) + 2 : (s.dotRadius ?? 4)} style={{ fill: s.color }} className="lc-dot" />
                ),
              )
            : null,
        )}
        {tipIndex != null && <line x1={x(tipIndex)} x2={x(tipIndex)} y1={PAD.top} y2={PAD.top + h} className="lc-hover" />}
      </svg>
      {tipIndex != null && (
        <div className="lc-tip" style={{ left: Math.min(Math.max(x(tipIndex), 90), width - 90) }}>
          <strong>{xLabels[tipIndex]}</strong>
          {series.map((s) =>
            s.values[tipIndex] != null ? (
              <span key={s.name}>
                <i style={{ background: s.color }} />
                {s.name}: {yFormat(s.values[tipIndex]!)}
              </span>
            ) : null,
          )}
          {onSelect && selectHint && <em>{selectHint}</em>}
        </div>
      )}
    </div>
  );
}
