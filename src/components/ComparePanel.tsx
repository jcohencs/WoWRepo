import { useEffect, useState } from 'react';
import type { AbilityLine, BossRow, Comparison, FightSide, Site } from '../../shared/types';
import { api, type Query } from '../lib/api';
import { ago, percent, specLabel } from '../lib/format';
import { abilityIcon, reportUrl } from '../lib/links';
import { AbilityPies, buildSlices } from './AbilityPies';
import { CastsChart } from './CastsChart';
import { HeadToHead } from './HeadToHead';

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
  const [tab, setTab] = useState<'casts' | 'abilities'>('casts');

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


          <AbilityPies abilities={abilities} noun={noun} hasRef={hasRef} />
        </div>
        <div className="cc-col">
          <div className="tab-head">
            <div className="segmented" role="tablist" aria-label="Breakdown view">
              <button role="tab" aria-selected={tab === 'casts'} aria-pressed={tab === 'casts'} onClick={() => setTab('casts')}>
                Buttons pressed
              </button>
              <button role="tab" aria-selected={tab === 'abilities'} aria-pressed={tab === 'abilities'} onClick={() => setTab('abilities')}>
                Every ability
              </button>
            </div>
            {hasRef && (
              <div className="legend" aria-hidden>
                <span className="legend-you">You</span>
                <span className="legend-ref">Top 1%</span>
              </div>
            )}
          </div>

          {tab === 'casts' ? (
            <CastsChart abilities={abilities} hasRef={hasRef} bare />
          ) : (
            <div className="casts abilities-list" role="table" aria-label={`Ability breakdown for ${data.encounter.name}`}>
              <div className="casts-row ab-head" role="row">
                <span role="columnheader">Ability</span>
                <span role="columnheader">Share of total {noun}</span>
                <span role="columnheader" className="num" title={hasRef ? 'Uses per minute: you · top 1%' : 'Uses per minute'}>
                  Per min
                </span>
              </div>
              {abilities.map((a) => (
                <AbilityRow key={a.id} a={a} maxShare={maxShare} color={colors.get(a.id)} noun={noun} hasRef={hasRef} />
              ))}
            </div>
          )}
          <p className="footnote">
            {tab === 'casts'
              ? 'Uses per minute accounts for kill time, so a longer fight isn\'t held against you.'
              : `"Share" is how much of each player's total ${noun} came from that ability.`}{' '}
            Logs pulled {ago(data.updatedAt)}.
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
  const tip = !hasRef
    ? `${a.name}: ${percent(a.you?.share ?? 0)} of your ${noun}, used ${cpm(a.you?.cpm)} times per minute`
    : hasShare
      ? `${a.name}: you ${percent(a.you?.share ?? 0)}, top 1% ${percent(a.ref?.share ?? 0)} (${differenceTip(a.shareDelta)})`
      : `${a.name}: used ${cpm(a.you?.cpm)} vs ${cpm(a.ref?.cpm)} times per minute`;
  return (
    <div className="casts-row" role="row" title={tip}>
      <span className="casts-name" role="cell">
        {icon ? (
          <img src={icon} alt="" width={24} height={24} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        ) : (
          <span className="icon-blank sm" />
        )}
        <span>{a.name}</span>
        {color && <span className="swatch" style={{ background: color }} title="Slice colour in the pie charts" />}
      </span>
      <span className="casts-bars" role="cell">
        {hasShare ? (
          <>
            <span className="cb you" style={{ width: `${((a.you?.share ?? 0) / maxShare) * 100}%` }}>
              <em>{a.you?.share ? percent(a.you.share) : '—'}</em>
            </span>
            {hasRef && (
              <span className="cb ref" style={{ width: `${((a.ref?.share ?? 0) / maxShare) * 100}%` }}>
                <em>{a.ref?.share ? percent(a.ref.share) : '—'}</em>
              </span>
            )}
          </>
        ) : (
          <span className="soft ab-utility">No direct {noun}</span>
        )}
      </span>
      <span className="ab-uses num" role="cell">
        <strong>{cpm(a.you?.cpm)}</strong>
        {hasRef && <span className="soft"> · {cpm(a.ref?.cpm)}</span>}
      </span>
    </div>
  );
}

function cpm(v: number | undefined) {
  return v == null || v === 0 ? '—' : v.toFixed(1);
}

