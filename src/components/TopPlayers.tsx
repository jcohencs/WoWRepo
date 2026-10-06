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
        <div className="leader-boxes">
          {ROLES.map((role) => (
            <LeaderBox key={role.metric} role={role} board={board} realm={realm.slug} onPick={(q) => onPick(q, board?.raid?.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

const ROLES = [
  { metric: 'dps' as const, label: 'Damage' },
  { metric: 'hps' as const, label: 'Healing' },
];

/** One box per role: a row per class with its icon on the left, the player in the middle and their DPS/HPS on the right. */
function LeaderBox({
  role,
  board,
  realm,
  onPick,
}: {
  role: (typeof ROLES)[number];
  board: Leaderboard | null;
  realm: string;
  onPick: (q: Query) => void;
}) {
  const classes = (board?.classes ?? CLASS_ORDER.map((className) => ({ className, leaders: [] }))).filter(
    ({ className }) => role.metric === 'dps' || HEALERS.has(className),
  );
  const pending = !board || board.updatedAt == null;
  return (
    <section className="leader-box" aria-label={`#1 ${role.label.toLowerCase()} of each class`}>
      <header className="lb-head">
        <span>{role.label}</span>
        <span className="soft">{metricLabel(role.metric)}</span>
      </header>
      <ol>
        {classes.map(({ className, leaders }) => {
          const leader = leaders.find((l) => l.metric === role.metric);
          const style = { '--class': classColor(className) } as CSSProperties;
          const icon = (
            <img className="lb-icon" src={classIconUrl(className)} alt="" width={36} height={36} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          );
          return (
            <li key={className} style={style}>
              {leader ? (
                <button
                  className="lb-row"
                  onClick={() => onPick({ region: REALM_REGION, realm, name: leader.name })}
                  title={`${leader.name} (${specLabel(leader.spec)}): in the realm's top 100 ${className}s on ${leader.bosses} of ${leader.bossCount} bosses, #1 on ${leader.firsts}`}
                >
                  {icon}
                  <span className="lb-who">
                    <span className="lb-class">{className}</span>
                    <span className="lb-name">{leader.name}</span>
                  </span>
                  <span className="lb-spec">
                    {leader.spec && <SpecIcon className={className} spec={leader.spec} size={16} />}
                    {specLabel(leader.spec)}
                  </span>
                  <span className="lb-amount">{integer(leader.perSecond)}</span>
                </button>
              ) : (
                <div className="lb-row empty">
                  {icon}
                  <span className="lb-who">
                    <span className="lb-class">{className}</span>
                    <span className="lb-name soft">{pending ? 'Pulling…' : 'No ranked kills yet'}</span>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const CLASS_ORDER = ['Druid', 'Hunter', 'Mage', 'Paladin', 'Priest', 'Rogue', 'Shaman', 'Warlock', 'Warrior'];
/** Classes with a healing spec (the others have no healing #1). */
const HEALERS = new Set(['Druid', 'Paladin', 'Priest', 'Shaman']);
