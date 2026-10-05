import { useState, useEffect, useCallback } from 'react';
import { getCities, getCityHistory } from '../api/sahab';

export function useCities() {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return getCities()
      .then(setCities)
      .catch(() => setCities([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { cities, loading, reload };
}

export function useCityHistory(cityId) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cityId) {
      setHistory([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    getCityHistory(cityId)
      .then((d) => !cancelled && setHistory(d))
      .catch(() => !cancelled && setHistory([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  return { history, loading };
}
