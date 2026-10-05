import { useCallback, useEffect, useRef, useState } from 'react';
import type { Meta, Region, ZoneReport } from '../shared/types';
import { CharacterHeader } from './components/CharacterHeader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RaidSelect } from './components/RaidSelect';
import { RaidView } from './components/RaidView';
import { SpecBar } from './components/SpecBar';
import { ThemeToggle } from './components/ThemeToggle';
import { SearchBar } from './components/SearchBar';
import { api, type Query } from './lib/api';

function readUrl(): { query: Query | null; raid?: string; spec?: string } {
  const p = new URLSearchParams(location.search);
  const region = p.get('region')?.toUpperCase();
  const realm = p.get('realm');
  const name = p.get('name');
  // Older links used ids like "1011-black-temple"; raids are now identified by name alone.
  const raid = p.get('raid')?.replace(/^\d+-/, '') || undefined;
  const spec = p.get('spec') || undefined;
  return { query: region && realm && name ? { region: region as Region, realm, name } : null, raid, spec };
}

function writeUrl(q: Query, raid: string, spec: string | null) {
  const p = new URLSearchParams({ region: q.region.toLowerCase(), realm: q.realm, name: q.name, raid });
  if (spec) p.set('spec', spec);
  history.replaceState(null, '', `?${p}`);
}

export function App() {
  const initial = useRef(readUrl());
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [query, setQuery] = useState<Query | null>(initial.current.query);
  const [raidId, setRaidId] = useState<string | undefined>(initial.current.raid);
  const [spec, setSpec] = useState<string | undefined>(initial.current.spec);
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
      .character(query, raidId, spec, ctrl.signal)
      .then((r) => {
        setReport(r);
        writeUrl(query, r.raid.id, r.spec);
      })
      .catch((e: Error) => {
        if (ctrl.signal.aborted) return;
        setError(e.message);
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [query, raidId, spec, attempt]);

  const search = useCallback((q: Query) => {
    setQuery(q);
    setSpec(undefined);
    setAttempt((n) => n + 1);
  }, []);

  // Keep the header (and spec bar) while another raid or spec for the same character loads.
  const shown = report && query && report.character.name.toLowerCase() === query.name.toLowerCase() && report.character.realm === query.realm ? report : null;
  const activeRaid = raidId ?? shown?.raid.id;
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
        </div>
        <SearchBar initial={query} onSearch={search} busy={loading} />
        {meta && (
          <div className="site-tag">
            <ThemeToggle />
            {meta.demo ? <span className="demo-tag">Demo data</span> : null}
            <span>{meta.site === 'fresh' ? 'TBC Anniversary' : 'TBC Classic'}</span>
          </div>
        )}
      </header>

      {metaError && <p className="notice error">Could not load raids: {metaError}</p>}
      {meta?.demo && !report && !query && (
        <p className="notice">
          You're looking at made-up demo numbers because no Warcraft Logs key is set up. Search any name to try it out, or add your
          key to the <code>.env</code> file to see real logs.
        </p>
      )}

      {query && (
        <main className="content">
          {shown && <CharacterHeader report={shown} site={meta?.site ?? 'fresh'} />}
          <div className="controls">
            {shown && shown.specs?.length > 0 && (
              <SpecBar className={shown.character.className} specs={shown.specs} active={spec ?? null} mainSpec={shown.mainSpec ?? ''} onSelect={(s) => setSpec(s ?? undefined)} />
            )}
            {raidPicker}
          </div>

          {error ? (
            <div className="state">
              <p>{error}</p>
              <button className="button ghost" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </div>
          ) : shown ? (
            <ErrorBoundary what="this raid" resetKey={shown}>
              <div className={loading ? 'is-stale' : undefined}>
                <RaidView report={shown} query={query} site={meta?.site ?? 'fresh'} demo={meta?.demo ?? false} />
              </div>
            </ErrorBoundary>
          ) : (
            <TableSkeleton />
          )}
        </main>
      )}

      {!query && <EmptyIntro />}

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
          <strong>Find your character</strong> Type your Nightslayer character's name in the search box above.
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
