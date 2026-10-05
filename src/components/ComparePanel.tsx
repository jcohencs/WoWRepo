import { useEffect, useMemo, useState } from 'react';
import type { AbilityLine, BossRow, Comparison, FightSide, Site } from '../../shared/types';
import { api, type Query } from '../lib/api';
import { amount, compact, duration, metricLabel, percent, signed, specLabel } from '../lib/format';
import { abilityIcon, reportUrl } from '../lib/links';

interface Props {
  query: Query;
  row: BossRow;
  site: Site;
  demo: boolean;
}

type Sort = 'impact' | 'difference';

export function ComparePanel({ query, row, site, demo }: Props) {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('difference');

  useEffect(() => {
    const ctrl = new AbortController();
    api.compare(query, row.encounter.id, row.spec, ctrl.signal).then(setData, (e: Error) => !ctrl.signal.aborted && setError(e.message));
    return () => ctrl.abort();
  }, [query, row.encounter.id, row.spec]);

  const abilities = useMemo(() => {
    if (!data) return [];
    const list = [...data.abilities];
    if (sort === 'difference') list.sort((a, b) => Math.abs(b.shareDelta) - Math.abs(a.shareDelta) || cpmGap(b) - cpmGap(a));
    return list;
  }, [data, sort]);

  if (error) return <div className="compare state">{error}</div>;
  if (!data) return <div className="compare state muted">Loading both logs…</div>;

  const unit = metricLabel(data.metric);
  const maxShare = Math.max(...data.abilities.map((a) => Math.max(a.you?.share ?? 0, a.ref?.share ?? 0)), 0.01);

  return (
    <div className="compare">
      <div className="sides">
        <Side label="You" side={data.you} site={site} demo={demo} unit={unit} />
        <Side label="99th percentile" side={data.ref} site={site} demo={demo} unit={unit} other={data.you} />
      </div>

      <div className="compare-toolbar">
        <h3>
          Ability breakdown <span className="muted">· {specLabel(data.spec)} {data.className}</span>
        </h3>
        <div className="segmented" role="group" aria-label="Sort abilities">
          <button aria-pressed={sort === 'difference'} onClick={() => setSort('difference')}>
            Biggest difference
          </button>
          <button aria-pressed={sort === 'impact'} onClick={() => setSort('impact')}>
            Share of {data.metric === 'hps' ? 'healing' : 'damage'}
          </button>
        </div>
      </div>

      <table className="abilities">
        <thead>
          <tr>
            <th>Ability</th>
            <th className="col-share">
              Share <span className="legend you">you</span> <span className="legend ref">p99</span>
            </th>
            <th className="num" title="Percentage points">Δ pts</th>
            <th className="num">Casts / min</th>
            <th className="num">Δ cpm</th>
          </tr>
        </thead>
        <tbody>
          {abilities.map((a) => (
            <AbilityRow key={a.id} a={a} maxShare={maxShare} />
          ))}
        </tbody>
      </table>
      <p className="footnote">
        Share is each ability's part of the player's total {data.metric === 'hps' ? 'healing' : 'damage'} on the kill. Casts per minute
        are normalised by fight length, so different kill times compare fairly.
      </p>
    </div>
  );
}

function cpmGap(a: AbilityLine) {
  return Math.abs((a.you?.cpm ?? 0) - (a.ref?.cpm ?? 0));
}

function Side({ label, side, site, demo, unit, other }: { label: string; side: FightSide; site: Site; demo: boolean; unit: string; other?: FightSide }) {
  return (
    <div className={`side${other ? ' ref' : ' you'}`}>
      <div className="side-head">
        <span className="side-label">{label}</span>
        <span className="side-name">
          {side.name}
          {side.server && <span className="muted"> · {side.server}</span>}
        </span>
        {!demo && (
          <a href={reportUrl(site, side.reportCode, side.fightId)} target="_blank" rel="noreferrer">
            Log ↗
          </a>
        )}
      </div>
      <dl className="side-stats">
        <div>
          <dt>{unit}</dt>
          <dd>{amount(side.perSecond)}</dd>
        </div>
        <div>
          <dt>Kill time</dt>
          <dd>{duration(side.durationMs)}</dd>
        </div>
        <div>
          <dt>Active</dt>
          <dd>{percent(side.activeTime)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{compact(side.amount)}</dd>
        </div>
      </dl>
    </div>
  );
}

function AbilityRow({ a, maxShare }: { a: AbilityLine; maxShare: number }) {
  const icon = abilityIcon(a.icon);
  const cpmDelta = a.you?.cpm != null && a.ref?.cpm != null && (a.you.cpm > 0 || a.ref.cpm > 0) ? a.you.cpm - a.ref.cpm : null;
  const shareKnown = (a.you?.share ?? 0) > 0 || (a.ref?.share ?? 0) > 0;
  return (
    <tr>
      <td className="ability">
        {icon ? <img src={icon} alt="" width={20} height={20} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="icon-blank" />}
        <span>{a.name}</span>
      </td>
      <td className="col-share">
        {shareKnown ? (
          <div className="share">
            <Bar value={a.you?.share} max={maxShare} kind="you" />
            <Bar value={a.ref?.share} max={maxShare} kind="ref" />
          </div>
        ) : (
          <span className="muted">utility</span>
        )}
      </td>
      <td className={`num ${deltaClass(a.shareDelta, 0.005)}`}>{shareKnown ? signed(a.shareDelta * 100) : '—'}</td>
      <td className="num">
        {cpmCell(a.you?.cpm)} <span className="muted">/ {cpmCell(a.ref?.cpm)}</span>
      </td>
      <td className={`num ${cpmDelta == null ? '' : deltaClass(cpmDelta, 0.3)}`}>{cpmDelta == null ? '—' : signed(cpmDelta)}</td>
    </tr>
  );
}

function cpmCell(v: number | undefined) {
  return v == null || v === 0 ? '—' : v.toFixed(1);
}

function deltaClass(v: number, threshold: number) {
  if (Math.abs(v) < threshold) return 'muted';
  return v > 0 ? 'pos' : 'neg';
}

function Bar({ value, max, kind }: { value: number | undefined; max: number; kind: 'you' | 'ref' }) {
  return (
    <div className={`share-bar ${kind}`}>
      <div style={{ width: `${((value ?? 0) / max) * 100}%` }} />
      <span>{value ? percent(value) : '—'}</span>
    </div>
  );
}
