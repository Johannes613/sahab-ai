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
    <aside className="w-56 h-full bg-[var(--sidebar)] border-r border-[var(--border)] flex flex-col py-4 shrink-0">
      <div className="px-4 mb-6">
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
      <nav className="flex-1 px-2 space-y-1">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg)]'
              }`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <p className="px-4 text-[10px] text-[var(--text-muted)]">Team Abyssinia</p>
    </aside>
  );
}
