import React from 'react';
import ThemeToggle from '../ui/ThemeToggle';
import { USE_MOCK } from '../../api/sahab';

export default function Header() {
  return (
    <header className="h-14 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between px-6 shrink-0">
      <div>
        {USE_MOCK && (
          <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
            Demo data
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-bold">
            P
          </div>
          <span className="text-sm text-[var(--text-main)] font-medium">City Planner</span>
        </div>
      </div>
    </header>
  );
}
