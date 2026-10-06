import { useEffect, useState, type CSSProperties } from 'react';
import { REALM_REGION, REALMS, type ClassLeader, type Leaderboard, type Raid } from '../../shared/types';
import { api, type Query } from '../lib/api';
import { classColor, classIconUrl } from '../lib/classes';
import { ago, integer, metricLabel, specLabel } from '../lib/format';
import { SpecIcon } from './SpecIcon';

/** Main page: the realm's #1 player of every class in one raid, with their DPS or HPS. */
export function TopPlayers({ raids, onPick }: { raids: Raid[]; onPick: (q: Query) => void }) {
  const realm = REALMS[0];
  const [raidId, setRaidId] = useState<string | undefined>(undefined);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

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
  }, [realm.slug, raidId, tick]);

  // While the list is still being pulled from Warcraft Logs, look again every minute.
  const pending = board != null && board.updatedAt == null;
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setTick((n) => n + 1), 60_000);
    return () => clearTimeout(t);
  }, [pending, tick]);

  return (
    <section className="top-players" aria-labelledby="top-players-title">
      <header className="section-head">
        <div>
          <h2 id="top-players-title">#1 on {realm.name}</h2>
          <p className="soft">
            Each class's best player{board?.raid ? ` in ${board.raid.name}` : ''} from Warcraft Logs' {realm.name} rankings, with a healing #1 for hybrid classes.
            <span className="tp-when"> Updated daily at 10:00 AM Eastern{board?.updatedAt ? ` · last ${ago(board.updatedAt)}` : ''}.</span>
          </p>
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
            ? board.classes.map(({ className, leaders }) => (
                <LeaderCard key={className} className={className} leaders={leaders} pending={board.updatedAt == null} realm={realm.slug} onPick={onPick} />
              ))
            : Array.from({ length: 9 }, (_, i) => <div key={i} className="leader-card skeleton-block" />)}
        </div>
      )}
    </section>
  );
}

function LeaderCard({
  className,
  leaders,
  pending,
  realm,
  onPick,
}: {
  className: string;
  leaders: ClassLeader[];
  pending: boolean;
  realm: string;
  onPick: (q: Query) => void;
}) {
  return (
    <article className="leader-card" style={{ '--class': classColor(className) } as CSSProperties}>
      <header>
        <img src={classIconUrl(className)} alt="" width={28} height={28} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <span className="lc-class">{className}</span>
        <span className="lc-rank">#1</span>
      </header>
      {leaders.length === 0 ? (
        <p className="lc-none soft">{pending ? 'Being pulled from Warcraft Logs…' : 'No ranked kills yet'}</p>
      ) : (
        leaders.map((l) => <LeaderRow key={l.metric} leader={l} realm={realm} onPick={onPick} showRole={leaders.length > 1 || l.metric === 'hps'} />)
      )}
    </article>
  );
}

function LeaderRow({ leader, realm, onPick, showRole }: { leader: ClassLeader; realm: string; onPick: (q: Query) => void; showRole: boolean }) {
  const unit = metricLabel(leader.metric);
  return (
    <button
      className="lc-row"
      onClick={() => onPick({ region: REALM_REGION, realm, name: leader.name })}
      title={`${leader.name}: in the realm's top 100 ${leader.className}s on ${leader.bosses} of ${leader.bossCount} bosses, #1 on ${leader.firsts}`}
    >
      {showRole && <span className="lc-role">{leader.metric === 'hps' ? 'Healing' : 'Damage'}</span>}
      <span className="lc-name">{leader.name}</span>
      <span className="lc-spec">
        {leader.spec && <SpecIcon className={leader.className} spec={leader.spec} size={16} />}
        {leader.spec ? specLabel(leader.spec) : leader.className}
      </span>
      <span className="lc-amount">
        {integer(leader.perSecond)}
        <small>{unit}</small>
      </span>
      <span className="lc-foot soft">
        {leader.firsts > 0 ? `#1 on ${leader.firsts}` : `Ranked on ${leader.bosses}`} of {leader.bossCount} {leader.bossCount === 1 ? 'boss' : 'bosses'}
      </span>
    </button>
  );
}

