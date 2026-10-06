import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlayCircle, History, Info, CloudSun, Bot } from 'lucide-react';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/run', icon: PlayCircle, label: 'Run Analysis' },
  { to: '/chat', icon: Bot, label: 'Agent Chat' },
  { to: '/history', icon: History, label: 'City History' },
  { to: '/about', icon: Info, label: 'About' },
];

export default function Sidebar() {
  return (
    <aside className="w-full md:w-56 h-auto md:h-full bg-[var(--sidebar)] border-t md:border-t-0 md:border-r border-[var(--border)] flex flex-row md:flex-col py-2 md:py-4 shrink-0 overflow-x-auto z-50">
      <div className="hidden md:block px-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center text-white">
            <CloudSun size={20} />
          </div>
          <span className="text-lg font-bold tracking-tight text-[var(--text-main)]">
            Sahab<span className="text-accent"> AI</span>
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-2">Urban heat risk intelligence</p>
      </div>
      <nav className="flex flex-row md:flex-col flex-1 px-2 space-y-0 md:space-y-1 justify-around md:justify-start w-full">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-3 py-2 rounded-lg text-[10px] md:text-sm font-medium transition-all ${
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg)]'
              }`
            }
          >
            <Icon className="w-5 h-5 md:w-[18px] md:h-[18px]" />
            <span className="whitespace-nowrap">{label}</span>
          </NavLink>
        ))}
      </nav>
      <p className="hidden md:block px-4 text-[10px] text-[var(--text-muted)]">Team Abyssinia</p>
    </aside>
  );
}
