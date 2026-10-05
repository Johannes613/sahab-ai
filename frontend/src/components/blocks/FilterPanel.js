import React from 'react';
import { Search } from 'lucide-react';
import { ACTIONS } from '../../constants';

const field =
  'px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-main)] text-sm focus:outline-none focus:ring-2 focus:ring-accent/40';

export default function FilterPanel({ filters, onChange, search, onSearch }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-wrap items-end gap-4 mb-4">
      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">Action</label>
        <select
          className={field}
          value={filters.action || ''}
          onChange={(e) => set({ action: e.target.value })}
        >
          <option value="">All actions</option>
          {Object.entries(ACTIONS).map(([k, { label }]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">
          Min risk: {Number(filters.min_risk || 0).toFixed(2)}
        </label>
        <input
          type="range" min="0" max="1" step="0.05"
          value={filters.min_risk || 0}
          onChange={(e) => set({ min_risk: Number(e.target.value) })}
          className="w-40 accent-[#8100D1]"
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--text-muted)] mb-1">
          Min population: {Number(filters.min_population || 0).toLocaleString()}
        </label>
        <input
          type="range" min="0" max="5000" step="250"
          value={filters.min_population || 0}
          onChange={(e) => set({ min_population: Number(e.target.value) })}
          className="w-40 accent-[#8100D1]"
        />
      </div>

      <div className="relative ml-auto">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          className={`${field} pl-8 w-56`}
          placeholder="Search lat / lon / material"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
    </div>
  );
}
