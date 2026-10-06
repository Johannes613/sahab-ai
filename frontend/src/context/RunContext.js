import React, { createContext, useCallback, useContext, useState } from 'react';

const RunContext = createContext(null);
const KEY = 'sahab-current-run';

function read() {
  try {
    const id = localStorage.getItem(KEY) || null;
    if (id === 'demo-dubai-2026-10' || id === 'demo-riyadh-2025-05') {
      localStorage.removeItem(KEY);
      return null;
    }
    return id;
  } catch (e) {
    return null;
  }
}

export function RunProvider({ children }) {
  const [runId, setRunIdState] = useState(read);

  const setRunId = useCallback((id) => {
    setRunIdState(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch (e) {
      /* storage unavailable */
    }
  }, []);

  return <RunContext.Provider value={{ runId, setRunId }}>{children}</RunContext.Provider>;
}

export const useRun = () => useContext(RunContext);
