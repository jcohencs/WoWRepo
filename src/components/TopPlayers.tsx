import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { REALM_REGION, REALMS, type ClassLeader, type Leaderboard, type Raid } from '../../shared/types';
import { api, type Query } from '../lib/api';
import { preload } from '../lib/preload';
import { classColor, classIconUrl } from '../lib/classes';
import { integer, metricLabel, specLabel } from '../lib/format';
import { SpecIcon } from './SpecIcon';

/** Main page: the realm's #1 player of every class in one raid, with their DPS or HPS. */
export function TopPlayers({ raids, onPick }: { raids: Raid[]; onPick: (q: Query, raidId?: string) => void }) {
  const realm = REALMS[0];
  const [raidId, setRaidId] = useState<string | undefined>(undefined);
  // The server builds the saved #1 list into the page, so it shows on the first paint.
  const built = preload().leaders;
  const [board, setBoard] = useState<Leaderboard | null>(built?.realm === realm.slug ? built : null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Already have the built-in list for the default raid: no need to ask again on first load.
    if (!raidId && tick === 0 && built?.realm === realm.slug && built.updatedAt != null) return;
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

      {error ? (
        <p className="state">{error}</p>
      ) : (
        <div className="leader-layout">
          <RoleChart
            board={board}
            realm={realm.slug}
            onPick={(q) => onPick(q, board?.raid?.id)}
            picker={
              raids.length > 0 && (
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
              )
            }
          />
          <div className="leader-side">
            {ROLES.map((role) => (
              <TopOverall key={role.role} role={role} board={board} realm={realm.slug} onPick={(q) => onPick(q, board?.raid?.id)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const ROLES = [
  { role: 'damage' as const, metric: 'dps' as const, label: 'Damage', classes: null },
  { role: 'healing' as const, metric: 'hps' as const, label: 'Healing', classes: new Set(['Druid', 'Paladin', 'Priest', 'Shaman']) },
  { role: 'tank' as const, metric: 'dps' as const, label: 'Tanking', classes: new Set(['Druid', 'Paladin', 'Warrior']) },
];

type RoleDef = (typeof ROLES)[number];

/** The role's #1 of every class it applies to, best first. Lists saved before tanking existed have no role on their entries. */
function roleLeaders(board: Leaderboard | null, role: RoleDef): ClassLeader[] {
  return (board?.classes ?? [])
    .filter(({ className }) => !role.classes || role.classes.has(className))
    .flatMap(({ leaders }) => leaders.filter((l) => (l.role ?? (l.metric === 'hps' ? 'healing' : 'damage')) === role.role))
    .sort((a, b) => b.perSecond - a.perSecond);
}

/** Bar chart of each class's #1 for one role; buttons switch between damage, healing and tanking. */
function RoleChart({ board, realm, onPick, picker }: { board: Leaderboard | null; realm: string; onPick: (q: Query) => void; picker?: ReactNode }) {
  const [roleKey, setRoleKey] = useState<RoleDef['role']>('damage');
  const role = ROLES.find((r) => r.role === roleKey)!;
  const rows = roleLeaders(board, role);
  const max = Math.max(1, ...rows.map((r) => r.perSecond));
  const pending = !board || board.updatedAt == null;
  const unit = metricLabel(role.metric);
  return (
    <section className="role-chart">
      <header className="rc-head">
        <div className="segmented" role="tablist" aria-label="Role">
          {ROLES.map((r) => (
            <button key={r.role} role="tab" aria-selected={r.role === roleKey} aria-pressed={r.role === roleKey} onClick={() => setRoleKey(r.role)}>
              {r.label}
            </button>
          ))}
        </div>
        {picker}
      </header>
      {rows.length === 0 ? (
        <p className="rc-empty soft">{pending ? 'Being pulled from Warcraft Logs…' : 'No ranked kills yet.'}</p>
      ) : (
        <ol className="rc-bars" aria-label={`#1 ${role.label.toLowerCase()} of each class, ${unit}`}>
          {rows.map((l) => (
            <li key={l.className} style={{ '--class': classColor(l.className) } as CSSProperties}>
              <button
                className="rc-row"
                onClick={() => onPick({ region: REALM_REGION, realm, name: l.name })}
                title={`${l.name} (${specLabel(l.spec)} ${l.className}): ${integer(l.perSecond)} ${unit} on average, ranked on ${l.bosses} of ${l.bossCount} bosses, #1 on ${l.firsts}`}
              >
                <img src={classIconUrl(l.className)} alt="" width={26} height={26} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <span className="rc-who">
                  <span className="rc-name">{l.name}</span>
                  <span className="rc-spec">
                    {specLabel(l.spec)} {l.className}
                  </span>
                </span>
                <span className="rc-track">
                  <span className="rc-bar" style={{ width: `${(l.perSecond / max) * 100}%` }} />
                </span>
                <span className="rc-value">{integer(l.perSecond)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Small box: the best of one role across every class. */
function TopOverall({ role, board, realm, onPick }: { role: RoleDef; board: Leaderboard | null; realm: string; onPick: (q: Query) => void }) {
  const top = roleLeaders(board, role)[0];
  const title = role.role === 'damage' ? 'Top damage' : role.role === 'healing' ? 'Top healer' : 'Top tank';
  if (!top) {
    return (
      <div className="top-overall empty">
        <span className="to-label">{title}</span>
        <span className="soft">{!board || board.updatedAt == null ? 'Being pulled…' : 'No ranked kills yet'}</span>
      </div>
    );
  }
  return (
    <button className="top-overall" style={{ '--class': classColor(top.className) } as CSSProperties} onClick={() => onPick({ region: REALM_REGION, realm, name: top.name })}>
      <span className="to-label">{title}</span>
      <span className="to-main">
        <img src={classIconUrl(top.className)} alt="" width={40} height={40} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <span className="to-who">
          <span className="to-name">{top.name}</span>
          <span className="to-spec">
            {top.spec && <SpecIcon className={top.className} spec={top.spec} size={14} />}
            {specLabel(top.spec)} {top.className}
          </span>
        </span>
        <span className="to-value">
          {integer(top.perSecond)}
          <small>{metricLabel(top.metric)}</small>
        </span>
      </span>
      <span className="to-foot soft">
        {top.firsts > 0 ? `#1 ${top.className} on ${top.firsts}` : `Ranked on ${top.bosses}`} of {top.bossCount} {top.bossCount === 1 ? 'boss' : 'bosses'}
      </span>
    </button>
  );
}

