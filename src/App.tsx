import { useCallback, useEffect, useRef, useState } from 'react';
import type { Meta, Region, ZoneReport } from '../shared/types';
import { BossTable } from './components/BossTable';
import { CharacterHeader } from './components/CharacterHeader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ParseChart } from './components/ParseChart';
import { Pending } from './components/Pending';
import { RaidSelect } from './components/RaidSelect';
import { SpecBar } from './components/SpecBar';
import { SearchBar } from './components/SearchBar';
import { Summary } from './components/Summary';
import { api, PendingError, type Query } from './lib/api';

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
  const [pending, setPending] = useState<PendingError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api.meta().then(setMeta, (e: Error) => setMetaError(e.message));
  }, []);

  useEffect(() => {
    if (!query) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setPending(null);
    api
      .character(query, raidId, spec, ctrl.signal)
      .then((r) => {
        setReport(r);
        writeUrl(query, r.raid.id, r.spec);
      })
      .catch((e: Error) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof PendingError) setPending(e);
        else setError(e.message);
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [query, raidId, spec, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

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
          <span className="brand-sub">How close are your TBC parses to the top 1% of your spec?</span>
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
          You're looking at made-up demo numbers because no Warcraft Logs key is set up. Search any name to try it out, or add your
          key to the <code>.env</code> file to see real logs.
        </p>
      )}

      {query && (
        <main className="content">
          {shown ? (
            <>
              <CharacterHeader report={shown} site={meta?.site ?? 'fresh'}>
                {raidPicker}
              </CharacterHeader>
              {shown.specs?.length > 0 && (
                <SpecBar specs={shown.specs} active={spec ?? null} mainSpec={shown.mainSpec ?? ''} onSelect={(s) => setSpec(s ?? undefined)} />
              )}
            </>
          ) : (
            <div className="character-placeholder">{raidPicker}</div>
          )}

          {pending ? (
            <Pending pending={pending} what={query.name} onRetry={retry} />
          ) : error ? (
            <div className="state">
              <p>{error}</p>
              <button className="button ghost" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </div>
          ) : shown ? (
            <ErrorBoundary what="this raid" resetKey={shown}>
              <div className={loading ? 'is-stale' : undefined}>
                <Summary summary={shown.summary} />
                <ParseChart rows={shown.rows} />
                <BossTable report={shown} query={query} site={meta?.site ?? 'fresh'} demo={meta?.demo ?? false} />
              </div>
            </ErrorBoundary>
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
          <strong>Find your character</strong> Type your Nightslayer character's name.
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
