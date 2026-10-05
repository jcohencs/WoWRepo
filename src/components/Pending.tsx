import { useEffect, useState } from 'react';
import type { PendingError } from '../lib/api';

/** "Not pulled yet" message with a live countdown; calls onRetry when the next update should be done. */
export function Pending({ pending, what, onRetry }: { pending: PendingError; what: string; onRetry: () => void }) {
  const [left, setLeft] = useState(pending.nextUpdateInSec);

  useEffect(() => {
    setLeft(pending.nextUpdateInSec);
    const started = Date.now();
    const tick = setInterval(() => setLeft(Math.max(0, pending.nextUpdateInSec - Math.round((Date.now() - started) / 1000))), 1000);
    // Check back a little after the scheduled pull, then every minute.
    const retry = setTimeout(onRetry, (pending.nextUpdateInSec + 20) * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(retry);
    };
  }, [pending, onRetry]);

  const mins = Math.ceil(left / 60);
  return (
    <div className="state pending">
      <p className="pending-title">{what} hasn't been pulled from Warcraft Logs yet.</p>
      <p>
        {pending.position > 1 ? `It's number ${pending.position} in line for the next update` : "It's first in line for the next update"},{' '}
        {left > 0 ? `in about ${mins} minute${mins === 1 ? '' : 's'}` : 'which is running now'}. This page will fill in by itself.
      </p>
    </div>
  );
}
