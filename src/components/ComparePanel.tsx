import { useEffect, useState } from 'react';
import type { AbilityLine, BossRow, Comparison, FightSide, Site } from '../../shared/types';
import { api, type Query } from '../lib/api';
import { ago, percent, specLabel } from '../lib/format';
import { abilityIcon, reportUrl } from '../lib/links';
import { AbilityPies, buildSlices } from './AbilityPies';
import { CastsChart } from './CastsChart';
import { HeadToHead } from './HeadToHead';
import { SpecIcon } from './SpecIcon';

interface Props {
  query: Query;
  row: BossRow;
  site: Site;
  demo: boolean;
}

export function ComparePanel({ query, row, site, demo }: Props) {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    api.compare(query, row.encounter.id, row.spec).then(
      (c) => live && setData(c),
      (e: Error) => {
        if (live) setError(e.message);
      },
    );
    return () => {
      live = false;
    };
  }, [query, row.encounter.id, row.spec, attempt]);

  if (error)
    return (
      <div className="compare state">
        <p>{error}</p>
        <button className="button ghost" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  if (!data) return <CompareSkeleton />;

  const noun = data.metric === 'hps' ? 'healing' : 'damage';
  const abilities = [...data.abilities].sort(
    (a, b) => (b.ref?.share ?? 0) - (a.ref?.share ?? 0) || (b.you?.share ?? 0) - (a.you?.share ?? 0),
  );
  const maxShare = Math.max(...abilities.map((a) => Math.max(a.you?.share ?? 0, a.ref?.share ?? 0)), 0.01);
  const colors = new Map(buildSlices(abilities).flatMap((s) => (s.id === 'other' ? [] : [[s.id, s.color] as const])));
  const hasRef = data.ref != null;

  return (
    <div className="compare">
      <div className="sides">
        <Side label="You" side={data.you} site={site} demo={demo} />
        {data.ref ? (
          <Side label="Top 1% player" side={data.ref} site={site} demo={demo} top />
        ) : (
          <div className="side none">
            <span className="soft">No top 1% {specLabel(data.spec)} log for this boss yet — showing your own breakdown.</span>
          </div>
        )}
      </div>

      <div className="compare-cols">
        <div className="cc-col">
          <HeadToHead data={data} />

          <div className="breakdown-head">
            <h3>
              <SpecIcon className={data.className} spec={data.spec} size={22} />
              Where your {noun} comes from <span className="soft">· {specLabel(data.spec)} {data.className}</span>
            </h3>
          </div>

          <AbilityPies abilities={abilities} noun={noun} hasRef={hasRef} />
        </div>
        <div className="cc-col">
          <CastsChart abilities={abilities} hasRef={hasRef} />

          <div className="breakdown-head sub">
            <h3>Every ability</h3>
            {hasRef && (
              <div className="legend" aria-hidden>
                <span className="legend-you">You</span>
                <span className="legend-ref">Top 1%</span>
              </div>
            )}
          </div>

          <div className="breakdown" role="table" aria-label={`Ability comparison for ${data.encounter.name}`}>
            <div className="bd-row bd-header" role="row">
              <span role="columnheader">Ability</span>
              <span role="columnheader" className="num">
                Uses per minute
                {hasRef && <small>you · top 1%</small>}
              </span>
              <span role="columnheader">Share of total {noun}</span>
        </div>
            {abilities.map((a) => (
              <AbilityRow key={a.id} a={a} maxShare={maxShare} color={colors.get(a.id)} noun={noun} hasRef={hasRef} />
            ))}
          </div>
          <p className="footnote">
            "Share" is how much of each player's total {noun} came from that ability. "Uses per minute" accounts for kill time, so a
            longer fight isn't held against you. Logs pulled {ago(data.updatedAt)}.
          </p>
        </div>
      </div>
    </div>
  );
}

function CompareSkeleton() {
  return (
    <div className="compare" aria-busy="true" aria-label="Loading comparison">
      <div className="sides">
        <div className="side skeleton-block" />
        <div className="side skeleton-block" />
      </div>
      <p className="soft loading-note">Loading your log and the top 1% log — the first time can take a few seconds…</p>
    </div>
  );
}

function Side({ label, side, site, demo, top }: { label: string; side: FightSide; site: Site; demo: boolean; top?: boolean }) {
  return (
    <div className={`side${top ? ' ref' : ' you'}`}>
      <div className="side-head">
        <span className="side-label">{label}</span>
        <span className="side-name">
          {side.name}
          {side.server && <span className="soft"> · {side.server}</span>}
        </span>
        {!demo && (
          <a href={reportUrl(site, side.reportCode, side.fightId)} target="_blank" rel="noreferrer">
            Open log ↗
          </a>
        )}
      </div>
    </div>
  );
}

function differenceTip(delta: number): string {
  const pts = Math.abs(delta * 100);
  if (pts < 0.3) return 'about the same';
  return `${pts.toFixed(1)}% ${delta > 0 ? 'more for you' : 'more for the top 1% player'}`;
}

function AbilityRow({ a, maxShare, color, noun, hasRef }: { a: AbilityLine; maxShare: number; color?: string; noun: string; hasRef: boolean }) {
  const icon = abilityIcon(a.icon);
  const hasShare = (a.you?.share ?? 0) > 0 || (a.ref?.share ?? 0) > 0;
  const notable = hasRef && hasShare && Math.abs(a.shareDelta) >= 0.02;
  const tip = !hasRef
    ? `${a.name}: ${percent(a.you?.share ?? 0)} of your ${noun}, used ${cpm(a.you?.cpm)} times per minute`
    : hasShare
      ? `${a.name}: you ${percent(a.you?.share ?? 0)}, top 1% ${percent(a.ref?.share ?? 0)} (${differenceTip(a.shareDelta)})`
      : `${a.name}: used ${cpm(a.you?.cpm)} vs ${cpm(a.ref?.cpm)} times per minute`;
  return (
    <div className={`bd-row${notable ? ' notable' : ''}`} role="row" title={tip}>
      <span className="ability" role="cell">
        {icon ? (
          <img src={icon} alt="" width={36} height={36} loading="lazy" onError={(e) => e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { className: 'icon-blank' }))} />
        ) : (
          <span className="icon-blank" />
        )}
        <span className="ability-name">{a.name}</span>
        {color && <span className="swatch" style={{ background: color }} title="Slice colour in the charts above" />}
      </span>
      <span className={`num uses${!a.you?.cpm && !a.ref?.cpm ? ' no-uses' : ''}`} role="cell">
        <strong>{cpm(a.you?.cpm)}</strong>
        {hasRef && <span className="soft"> · {cpm(a.ref?.cpm)}</span>}
      </span>
      <span className="share-chart" role="cell">
        {hasShare ? (
          <>
            <Bar value={a.you?.share} max={maxShare} kind="you" />
            {hasRef && <Bar value={a.ref?.share} max={maxShare} kind="ref" />}
          </>
        ) : (
          <span className="soft">No direct {noun}</span>
        )}
      </span>
    </div>
  );
}

function cpm(v: number | undefined) {
  return v == null || v === 0 ? '—' : v.toFixed(1);
}

function Bar({ value, max, kind }: { value: number | undefined; max: number; kind: 'you' | 'ref' }) {
  return (
    <span className={`bar bar-${kind}`}>
      <span className="bar-fill" style={{ width: `${((value ?? 0) / max) * 100}%` }} />
      <span className="bar-value">{value ? percent(value) : '—'}</span>
    </span>
  );
}

