import { useCallback, useEffect, useRef, useState } from 'react';
import type { Meta, Region, ZoneReport } from '../shared/types';
import { CharacterHeader } from './components/CharacterHeader';
import { ClassGrid, GuidePage } from './components/ClassGuides';
import { guideFromPath } from './lib/classes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RaidSelect } from './components/RaidSelect';
import { RaidView } from './components/RaidView';
import { SpecBar } from './components/SpecBar';
import { SearchBar } from './components/SearchBar';
import { TopPlayers } from './components/TopPlayers';
import { api, type Query } from './lib/api';
import { preload } from './lib/preload';

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
  history.replaceState(null, '', `/?${p}`);
}

export function App() {
  const initial = useRef(readUrl());
  const [meta, setMeta] = useState<Meta | null>(() => preload().meta);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [query, setQuery] = useState<Query | null>(initial.current.query);
  const [raidId, setRaidId] = useState<string | undefined>(initial.current.raid);
  const [spec, setSpec] = useState<string | undefined>(initial.current.spec);
  const [report, setReport] = useState<ZoneReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [path, setPath] = useState(location.pathname);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  useEffect(() => {
    if (preload().meta) return; // built into the page by the server
    api.meta().then(setMeta, (e: Error) => setMetaError(e.message));
  }, []);

  /** In-site navigation: guide pages and the home page, without reloading. */
  const navigate = useCallback((to: string) => {
    history.pushState(null, '', to);
    setPath(location.pathname);
    if (to === '/') {
      setQuery(null);
      setReport(null);
      setError(null);
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onPop = () => {
      setPath(location.pathname);
      const { query: q, raid, spec: sp } = readUrl();
      setQuery(q);
      setRaidId(raid);
      setSpec(sp);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
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

  const refresh = useCallback(() => {
    if (!query) return;
    setRefreshing(true);
    setRefreshNote(null);
    api
      .refresh(query, raidId, spec)
      .then(
        (r) => setReport(r),
        (e: Error) => setRefreshNote(e.message),
      )
      .finally(() => setRefreshing(false));
  }, [query, raidId, spec]);

  useEffect(() => setRefreshNote(null), [query, raidId, spec]);

  const search = useCallback((q: Query) => {
    if (location.pathname !== '/') history.pushState(null, '', '/');
    setPath('/');
    setQuery(q);
    setSpec(undefined);
    setAttempt((n) => n + 1);
  }, []);

  /** Opens a character on a given raid (from the #1 cards). */
  const openOnRaid = useCallback(
    (q: Query, raid?: string) => {
      if (raid) setRaidId(raid);
      search(q);
    },
    [search],
  );

  // Keep the header (and spec bar) while another raid or spec for the same character loads.
  const shown = report && query && report.character.name.toLowerCase() === query.name.toLowerCase() && report.character.realm === query.realm ? report : null;
  const activeRaid = raidId ?? shown?.raid.id;
  const guide = guideFromPath(path);
  const raidPicker = meta ? <RaidSelect raids={meta.raids} active={activeRaid} onSelect={setRaidId} /> : null;

  return (
    <div className="shell">
      <header className="masthead">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            navigate('/');
          }}
          aria-label="LogsForever home"
        >
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="brand-name">LogsForever</span>
        </a>
        <SearchBar initial={query} onSearch={search} busy={loading} />
        {meta?.demo && (
          <div className="site-tag">
            <span className="demo-tag">Demo data</span>
          </div>
        )}
      </header>

      {metaError && <p className="notice error">Could not load raids: {metaError}</p>}
      {meta?.demo && !report && !query && !guide && (
        <p className="notice">
          You're looking at made-up demo numbers because no Warcraft Logs key is set up. Search any name to try it out, or add your
          key to the <code>.env</code> file to see real logs.
        </p>
      )}

      {guide && <GuidePage name={guide.name} spec={guide.spec} navigate={navigate} />}

      {!guide && query && (
        <main className="content">
          {shown ? (
            <CharacterHeader report={shown} site={meta?.site ?? 'fresh'} onRefresh={refresh} refreshing={refreshing} refreshNote={refreshNote}>
              <div className="controls">
                {shown.specs?.length > 0 && (
                  <SpecBar className={shown.character.className} specs={shown.specs} active={spec ?? null} mainSpec={shown.mainSpec ?? ''} onSelect={(s) => setSpec(s ?? undefined)} />
                )}
                {raidPicker}
              </div>
            </CharacterHeader>
          ) : (
            <div className="controls">{raidPicker}</div>
          )}

          {error ? (
            <div className="state">
              <p>{error}</p>
              <button className="button ghost" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </div>
          ) : shown ? (
            <ErrorBoundary what="this raid" resetKey={shown}>
              <div className={loading || refreshing ? 'is-stale' : undefined}>
                <RaidView report={shown} query={query} site={meta?.site ?? 'fresh'} demo={meta?.demo ?? false} navigate={navigate} />
              </div>
            </ErrorBoundary>
          ) : (
            <TableSkeleton />
          )}
        </main>
      )}

      {!guide && !query && (
        <>
          <EmptyIntro />
          <TopPlayers raids={meta?.raids ?? []} onPick={openOnRaid} />
          <ClassGrid navigate={navigate} />
        </>
      )}

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
    <section className="welcome">
      <div className="welcome-text">
        <h1>
          Welcome to <span>LogsForever</span>
        </h1>
        <p>See detailed visual breakdowns comparing your logs with the #1 of your class and spec on Nightslayer.</p>
      </div>
      <ol className="welcome-steps">
        <li>
          <span className="ws-num">1</span>
          <strong>Find your character</strong>
          <span>Type your Nightslayer character's name in the search box above.</span>
        </li>
        <li>
          <span className="ws-num">2</span>
          <strong>See every boss</strong>
          <span>Your best kill next to the Nightslayer #1 of your spec.</span>
        </li>
        <li>
          <span className="ws-num">3</span>
          <strong>Click a boss</strong>
          <span>See which abilities the #1 gets more out of than you do.</span>
        </li>
      </ol>
    </section>
  );
}
