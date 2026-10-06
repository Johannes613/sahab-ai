import { useState, useEffect } from 'react';
import { getStatus } from '../api/sahab';

export function useRunStatus(runId) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false;
    let timer;

    const tick = async () => {
      try {
        const data = await getStatus(runId);
        if (cancelled) return;
        setStatus(data);
        if (['complete', 'failed', 'cancelled'].includes(data.status)) return;
      } catch (err) {
        if (cancelled) return;
        setStatus({ run_id: runId, status: 'failed', progress_pct: 0, message: 'Lost connection to the server' });
        return;
      }
      timer = setTimeout(tick, 3000);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId]);

  return status;
}
