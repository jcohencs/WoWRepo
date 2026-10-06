import { useEffect, useState, type CSSProperties } from 'react';
import { REALM_REGION, REALMS, type Leaderboard, type Raid } from '../../shared/types';
import { api, type Query } from '../lib/api';
import { classColor, classIconUrl } from '../lib/classes';
import { ago, integer, metricLabel, specLabel } from '../lib/format';
import { SpecIcon } from './SpecIcon';

/** Main page: the realm's #1 player of every class in one raid, with their DPS or HPS. */
export function TopPlayers({ raids, onPick }: { raids: Raid[]; onPick: (q: Query, raidId?: string) => void }) {
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
        <LeaderTable board={board} realm={realm.slug} onPick={(q) => onPick(q, board?.raid?.id)} />
      )}
    </section>
  );
}

const ROLES = [
  { metric: 'dps' as const, label: 'Damage' },
  { metric: 'hps' as const, label: 'Healing' },
];

/** One box: a column per class, a row for damage and one for healing, lines between every cell. */
function LeaderTable({ board, realm, onPick }: { board: Leaderboard | null; realm: string; onPick: (q: Query) => void }) {
  const classes = board?.classes ?? CLASS_ORDER.map((className) => ({ className, leaders: [] }));
  const pending = !board || board.updatedAt == null;
  return (
    <div className="leader-scroll">
      <div className="leader-table" role="table" aria-label="#1 player of each class" aria-busy={!board}>
        <div className="lt-row lt-head" role="row">
          <span className="lt-label" role="columnheader" />
          {classes.map(({ className }) => (
            <span key={className} className="lt-class" role="columnheader" style={{ '--class': classColor(className) } as CSSProperties}>
              <img src={classIconUrl(className)} alt="" width={22} height={22} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              {className}
            </span>
          ))}
        </div>
        {ROLES.map((role) => (
          <div key={role.metric} className="lt-row" role="row">
            <span className="lt-label" role="rowheader">
              {role.label}
            </span>
            {classes.map(({ className, leaders }) => {
              const leader = leaders.find((l) => l.metric === role.metric);
              const style = { '--class': classColor(className) } as CSSProperties;
              if (!leader) {
                const why = role.metric === 'hps' && !HEALERS.has(className) ? '' : pending ? 'Pulling…' : '—';
                return (
                  <span key={className} className="lt-cell empty" role="cell" style={style}>
                    {why}
                  </span>
                );
              }
              return (
                <button
                  key={className}
                  className="lt-cell"
                  role="cell"
                  style={style}
                  onClick={() => onPick({ region: REALM_REGION, realm, name: leader.name })}
                  title={`${leader.name} (${specLabel(leader.spec)}): in the realm's top 100 ${className}s on ${leader.bosses} of ${leader.bossCount} bosses, #1 on ${leader.firsts}`}
                >
                  <span className="lt-name">{leader.name}</span>
                  <span className="lt-spec">
                    {leader.spec && <SpecIcon className={className} spec={leader.spec} size={14} />}
                    {specLabel(leader.spec)}
                  </span>
                  <span className="lt-amount">
                    {integer(leader.perSecond)}
                    <small>{metricLabel(leader.metric)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const CLASS_ORDER = ['Druid', 'Hunter', 'Mage', 'Paladin', 'Priest', 'Rogue', 'Shaman', 'Warlock', 'Warrior'];
/** Classes with a healing spec (the others have no healing #1). */
const HEALERS = new Set(['Druid', 'Paladin', 'Priest', 'Shaman']);
