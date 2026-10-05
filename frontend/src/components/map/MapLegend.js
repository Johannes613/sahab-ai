import React from 'react';
import { ACTIONS } from '../../constants';

export default function MapLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-[1000] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs">
      <p className="font-semibold mb-1 text-[var(--text-main)]">Recommended action</p>
      {Object.entries(ACTIONS).map(([k, { label, color }]) => (
        <div key={k} className="flex items-center gap-2 text-[var(--text-muted)]">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          {label}
        </div>
      ))}
      <p className="mt-1 text-[10px] text-[var(--text-muted)]">Circle size = risk score</p>
    </div>
  );
}
