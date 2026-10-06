import { useEffect, useState, type CSSProperties } from 'react';
import { REALM_REGION, REALMS, type Leaderboard, type Raid, type SpecLeaders } from '../../shared/types';
import { api, type Query } from '../lib/api';
import { classColor, classIconUrl } from '../lib/classes';
import { specLabel } from '../lib/format';
import { SpecIcon } from './SpecIcon';

const SHOWN = 5;

/** Main page: everyone on the realm with a top 1% parse, by class and spec, for one raid. */
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

  const byClass = new Map<string, SpecLeaders[]>();
  for (const s of board?.specs ?? []) byClass.set(s.className, [...(byClass.get(s.className) ?? []), s]);

  return (
    <section className="top-players" aria-labelledby="top-players-title">
      <header className="section-head">
        <div>
          <h2 id="top-players-title">Top 1% on {realm.name}</h2>
          <p className="soft">Everyone with a parse of 99 or higher{board?.raid ? ` in ${board.raid.name}` : ''}, by spec. Click a name to see their logs.</p>
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
      ) : !board ? (
        <div className="tp-grid" aria-busy="true">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="tp-class skeleton-block" />
          ))}
        </div>
      ) : (
        <div className="tp-grid">
          {[...byClass.entries()].map(([className, specs]) => (
            <article key={className} className="tp-class" style={{ '--class': classColor(className) } as CSSProperties}>
              <header>
                <img src={classIconUrl(className)} alt="" width={36} height={36} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <h3>{className}</h3>
              </header>
              {specs.map((s) => (
                <SpecList key={s.spec} leaders={s} realm={realm.slug} onPick={onPick} />
              ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SpecList({ leaders, realm, onPick }: { leaders: SpecLeaders; realm: string; onPick: (q: Query) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? leaders.players : leaders.players.slice(0, SHOWN);
  return (
    <div className="tp-spec">
      <p className="tp-spec-name">
        <SpecIcon className={leaders.className} spec={leaders.spec} size={18} />
        {specLabel(leaders.spec)}
        <span className="soft">{leaders.players.length || ''}</span>
      </p>
      {leaders.players.length === 0 ? (
        <p className="tp-none soft">No top 1% parses yet</p>
      ) : (
        <ol>
          {shown.map((p) => (
            <li key={p.name}>
              <button onClick={() => onPick({ region: REALM_REGION, realm, name: p.name })} title={`${p.name}: ${p.topParses} top 1% ${p.topParses === 1 ? 'boss' : 'bosses'}, best ${p.bestParse.toFixed(1)}, average ${p.averageParse.toFixed(1)}`}>
                <span className="tp-name">{p.name}</span>
                <span className="tp-count">
                  <span className="top-star">★</span>
                  {p.topParses}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {leaders.players.length > SHOWN && (
        <button className="tp-more" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `+${leaders.players.length - SHOWN} more`}
        </button>
      )}
    </div>
  );
}
