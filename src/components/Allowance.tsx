import { useEffect, useState } from 'react';
import type { ApiStatus } from '../../shared/types';
import { api } from '../lib/api';

/** Shows how much of this hour's Warcraft Logs allowance is used. Refreshes after each load and every minute. */
export function Allowance({ refreshKey }: { refreshKey: string }) {
  const [status, setStatus] = useState<ApiStatus | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => api.status().then((s) => live && setStatus(s), () => undefined);
    void load();
    const timer = setInterval(load, 60_000);
    const onDone = () => void load();
    window.addEventListener('parsecheck:loaded', onDone);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('parsecheck:loaded', onDone);
    };
  }, [refreshKey]);

  if (!status || status.limitPerHour == null || status.pointsSpent == null) return null;
  const used = status.pointsSpent / status.limitPerHour;
  const mins = Math.ceil((status.resetsInSec ?? 0) / 60);
  return (
    <span
      className={`allowance${used >= 0.97 ? ' out' : used >= 0.8 ? ' low' : ''}`}
      title={`Warcraft Logs lets this app use ${status.limitPerHour} points per hour. Saved results don't cost anything. ${status.savedResults} results saved.`}
    >
      <span className="allowance-bar">
        <span style={{ width: `${Math.min(used, 1) * 100}%` }} />
      </span>
      {Math.round(status.pointsSpent)} / {status.limitPerHour} pts{mins > 0 ? ` · resets in ${mins}m` : ''}
    </span>
  );
}
