import React from 'react';
import ThemeToggle from '../ui/ThemeToggle';

export default function Header() {
  return (
    <header className="h-14 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between px-6 shrink-0">
      <div />
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
