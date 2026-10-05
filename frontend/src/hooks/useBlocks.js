import { useState, useEffect } from 'react';
import { getBlocks, getSummary } from '../api/sahab';

export function useBlocks(runId, filters) {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(filters || {});

  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false;
    setLoading(true);
    getBlocks(runId, { sort: 'risk_desc', ...JSON.parse(key) })
      .then((d) => !cancelled && setBlocks(d))
      .catch(() => !cancelled && setBlocks([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [runId, key]);

  return { blocks, loading };
}

export function useSummary(runId) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false;
    setSummary(null);
    setError(false);
    getSummary(runId)
      .then((d) => !cancelled && setSummary(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return { summary, error };
}
