import React, { createContext, useCallback, useContext, useState } from 'react';

const RunContext = createContext(null);
const KEY = 'sahab-current-run';

function read() {
  try {
    return localStorage.getItem(KEY) || null;
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
