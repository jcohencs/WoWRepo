import { useCallback, useEffect, useRef, useState } from 'react';
import type { Meta, Region, ZoneReport } from '../shared/types';
import { BossTable } from './components/BossTable';
import { CharacterHeader } from './components/CharacterHeader';
import { SearchBar } from './components/SearchBar';
import { Summary } from './components/Summary';
import { ZoneTabs } from './components/ZoneTabs';
import { api, type Query } from './lib/api';

function readUrl(): { query: Query | null; zone?: number } {
  const p = new URLSearchParams(location.search);
  const region = p.get('region')?.toUpperCase();
  const realm = p.get('realm');
  const name = p.get('name');
  const zone = Number(p.get('zone')) || undefined;
  return { query: region && realm && name ? { region: region as Region, realm, name } : null, zone };
}

function writeUrl(q: Query, zone: number) {
  const p = new URLSearchParams({ region: q.region.toLowerCase(), realm: q.realm, name: q.name, zone: String(zone) });
  history.replaceState(null, '', `?${p}`);
}

export function App() {
  const initial = useRef(readUrl());
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [query, setQuery] = useState<Query | null>(initial.current.query);
  const [zoneId, setZoneId] = useState<number | undefined>(initial.current.zone);
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
      .character(query, zoneId, ctrl.signal)
      .then((r) => {
        setReport(r);
        writeUrl(query, r.zone.id);
      })
      .catch((e: Error) => {
        if (ctrl.signal.aborted) return;
        setReport(null);
        setError(e.message);
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [query, zoneId, attempt]);

  const search = useCallback((q: Query) => {
    setQuery(q);
    setAttempt((n) => n + 1);
  }, []);

  const activeZone = report?.zone.id ?? zoneId;

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
          <span className="brand-sub">TBC · your parses against the 99th percentile of your spec</span>
        </div>
        {meta && (
          <div className="site-tag">
            {meta.demo ? <span className="demo-tag">Demo data</span> : null}
            <span>{meta.site === 'fresh' ? 'TBC Anniversary' : 'TBC Classic'}</span>
          </div>
        )}
      </header>

      <SearchBar initial={query} onSearch={search} busy={loading} />

      {metaError && <p className="notice error">Could not load raids: {metaError}</p>}
      {meta?.demo && !report && !query && (
        <p className="notice">
          No Warcraft Logs API key is configured, so the app is serving generated demo numbers. Search any name to see the layout,
          or add <code>WCL_CLIENT_ID</code> and <code>WCL_CLIENT_SECRET</code> to <code>.env</code> for real logs.
        </p>
      )}

      {query && (
        <main className="content">
          {report && <CharacterHeader report={report} site={meta?.site ?? 'fresh'} />}

          {meta && (
            <ZoneTabs
              zones={meta.zones}
              active={activeZone}
              onSelect={(id) => {
                setZoneId(id);
              }}
            />
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
        Data from Warcraft Logs. Benchmarks compare the same class, spec, boss and metric in the current phase; percentiles are read
        from the exact ranking position, not estimated.
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
          <strong>Search your character</strong> or paste your Warcraft Logs character link.
        </li>
        <li>
          <strong>See every boss</strong> with your best kill next to the median and the 99th percentile for your spec.
        </li>
        <li>
          <strong>Open a boss</strong> to line your log up against the player sitting at the 99th percentile, ability by ability.
        </li>
      </ol>
    </section>
  );
}
