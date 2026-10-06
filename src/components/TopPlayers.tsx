import { useEffect, useState, type CSSProperties } from 'react';
import { REALM_REGION, REALMS, type ClassLeader, type Leaderboard, type Raid } from '../../shared/types';
import { api, type Query } from '../lib/api';
import { classColor, classIconUrl } from '../lib/classes';
import { integer, metricLabel, parse, parseTier, specLabel } from '../lib/format';
import { SpecIcon } from './SpecIcon';

/** Main page: the realm's #1 player of every class in one raid, with their DPS or HPS. */
export function TopPlayers({ raids, onPick }: { raids: Raid[]; onPick: (q: Query) => void }) {
  const realm = REALMS[0];
  const [raidId, setRaidId] = useState<string | undefined>(undefined);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    api.leaders(realm.slug, raidId).then(
      (b) => live && setBoard(b),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [realm.slug, raidId]);

  return (
    <section className="top-players" aria-labelledby="top-players-title">
      <header className="section-head">
        <div>
          <h2 id="top-players-title">#1 on {realm.name}</h2>
          <p className="soft">The best player of each class{board?.raid ? ` in ${board.raid.name}` : ''}, by average parse.</p>
        </div>
        {raids.length > 0 && (
          <label className="raid-select compact">
            <span>Raid</span>
            <select value={raidId ?? board?.raid?.id ?? ''} onChange={(e) => setRaidId(e.target.value)}>
              {raids.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {error ? (
        <p className="state">{error}</p>
      ) : (
        <div className="leader-grid" aria-busy={!board}>
          {board
            ? board.classes.map(({ className, leader }) => <LeaderCard key={className} className={className} leader={leader} realm={realm.slug} onPick={onPick} />)
            : Array.from({ length: 9 }, (_, i) => <div key={i} className="leader-card skeleton-block" />)}
        </div>
      )}
    </section>
  );
}

function LeaderCard({ className, leader, realm, onPick }: { className: string; leader: ClassLeader | null; realm: string; onPick: (q: Query) => void }) {
  const style = { '--class': classColor(className) } as CSSProperties;
  const head = (
    <header>
      <img src={classIconUrl(className)} alt="" width={28} height={28} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      <span className="lc-class">{className}</span>
      <span className="lc-rank">#1</span>
    </header>
  );
  if (!leader) {
    return (
      <article className="leader-card empty" style={style}>
        {head}
        <p className="soft">No kills yet</p>
      </article>
    );
  }
  const unit = metricLabel(leader.metric);
  return (
    <button
      className="leader-card"
      style={style}
      onClick={() => onPick({ region: REALM_REGION, realm, name: leader.name })}
      title={`${leader.name}: average parse ${leader.averageParse.toFixed(1)} over ${leader.bosses} ${leader.bosses === 1 ? 'boss' : 'bosses'} as ${specLabel(leader.spec)}`}
    >
      {head}
      <span className="lc-name">{leader.name}</span>
      <span className="lc-spec">
        <SpecIcon className={className} spec={leader.spec} size={16} />
        {specLabel(leader.spec)}
      </span>
      <span className="lc-amount">
        {integer(leader.perSecond)}
        <small>{unit}</small>
      </span>
      <span className="lc-foot">
        <span className={`parse-${parseTier(leader.averageParse)}`}>{parse(leader.averageParse)} avg</span>
        {leader.topParses > 0 && (
          <span className="lc-stars" title={`${leader.topParses} top 1% ${leader.topParses === 1 ? 'parse' : 'parses'}`}>
            <span className="top-star">★</span>
            {leader.topParses}
          </span>
        )}
      </span>
    </button>
  );
}
