import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

function initialTheme() {
  try {
    const saved = localStorage.getItem('sahab-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) {
    /* storage unavailable */
  }
  return 'light'; // Always default to white theme instead of OS preference
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    try {
      localStorage.setItem('sahab-theme', theme);
    } catch (e) {
      /* storage unavailable */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
