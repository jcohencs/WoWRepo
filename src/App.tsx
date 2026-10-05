import { useCallback, useEffect, useRef, useState } from 'react';
import type { Meta, Region, ZoneReport } from '../shared/types';
import { BossTable } from './components/BossTable';
import { CharacterHeader } from './components/CharacterHeader';
import { RaidSelect } from './components/RaidSelect';
import { Allowance } from './components/Allowance';
import { SearchBar } from './components/SearchBar';
import { Summary } from './components/Summary';
import { api, type Query } from './lib/api';

function readUrl(): { query: Query | null; raid?: string } {
  const p = new URLSearchParams(location.search);
  const region = p.get('region')?.toUpperCase();
  const realm = p.get('realm');
  const name = p.get('name');
  const raid = p.get('raid') || undefined;
  return { query: region && realm && name ? { region: region as Region, realm, name } : null, raid };
}

function writeUrl(q: Query, raid: string) {
  const p = new URLSearchParams({ region: q.region.toLowerCase(), realm: q.realm, name: q.name, raid });
  history.replaceState(null, '', `?${p}`);
}

export function App() {
  const initial = useRef(readUrl());
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [query, setQuery] = useState<Query | null>(initial.current.query);
  const [raidId, setRaidId] = useState<string | undefined>(initial.current.raid);
  const [report, setReport] = useState<ZoneReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api.meta().then(setMeta, (e: Error) => setMetaError(e.message));
  }, []);

  useEffect(() => {
    if (!query) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api
      .character(query, raidId, ctrl.signal)
      .then((r) => {
        setReport(r);
        writeUrl(query, r.raid.id);
      })
      .catch((e: Error) => {
        if (ctrl.signal.aborted) return;
        setReport(null);
        setError(e.message);
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [query, raidId, attempt]);

  const search = useCallback((q: Query) => {
    setQuery(q);
    setAttempt((n) => n + 1);
  }, []);

  const activeRaid = report?.raid.id ?? raidId;
  const raidPicker = meta ? <RaidSelect raids={meta.raids} active={activeRaid} onSelect={setRaidId} /> : null;

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="brand-name">Parsecheck</span>
          <span className="brand-sub">How close are your TBC parses to the top 1% of your spec?</span>
        </div>
        {meta && (
          <div className="site-tag">
            {meta.demo ? <span className="demo-tag">Demo data</span> : <Allowance refreshKey={`${loading}`} />}
            <span>{meta.site === 'fresh' ? 'TBC Anniversary' : 'TBC Classic'}</span>
          </div>
        )}
      </header>

      <SearchBar initial={query} onSearch={search} busy={loading} />

      {metaError && <p className="notice error">Could not load raids: {metaError}</p>}
      {meta?.demo && !report && !query && (
        <p className="notice">
          You're looking at made-up demo numbers because no Warcraft Logs key is set up. Search any name to try it out, or add your
          key to the <code>.env</code> file to see real logs.
        </p>
      )}

      {query && (
        <main className="content">
          {report ? (
            <CharacterHeader report={report} site={meta?.site ?? 'fresh'}>
              {raidPicker}
            </CharacterHeader>
          ) : (
            <div className="character-placeholder">{raidPicker}</div>
          )}

          {error ? (
            <div className="state">
              <p>{error}</p>
              <button className="button ghost" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </div>
          ) : report ? (
            <div className={loading ? 'is-stale' : undefined}>
              <Summary summary={report.summary} />
              <BossTable report={report} query={query} site={meta?.site ?? 'fresh'} demo={meta?.demo ?? false} />
            </div>
          ) : (
            <TableSkeleton />
          )}
        </main>
      )}

      {!query && <EmptyIntro />}

      <footer className="footer">
        Numbers come from Warcraft Logs. You are only compared with players of the same class and spec, on the same boss, in the
        current phase. "Top 1%" is the real log sitting at the 99th percentile, not an estimate.
      </footer>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}

function EmptyIntro() {
  return (
    <section className="intro">
      <ol>
        <li>
          <strong>Find your character</strong> Pick Dreamscythe or Nightslayer, then type your name.
        </li>
        <li>
          <strong>See every boss</strong> Your best kill next to a typical player and the top 1% of your spec.
        </li>
        <li>
          <strong>Click a boss</strong> See which abilities a top 1% player gets more out of than you do.
        </li>
      </ol>
    </section>
  );
}
