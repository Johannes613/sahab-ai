import React from 'react';

export const MATERIAL_META = [
  { key: 'vegetation', label: 'Vegetation', color: '#22c55e' },
  { key: 'asphalt', label: 'Asphalt', color: '#4b5563' },
  { key: 'concrete', label: 'Concrete', color: '#a8a29e' },
  { key: 'reflective_roof', label: 'Reflective roof', color: '#38bdf8' },
  { key: 'bare_soil', label: 'Bare soil', color: '#d4a373' },
];

const pct = (v) => `${Math.round((v || 0) * 100)}%`;

// Pure CSS stacked bar; no chart library.
export default function MaterialBar({ materials, height = 10, legend = false, width }) {
  if (!materials) return null;
  const summary = MATERIAL_META.map((m) => `${m.label} ${pct(materials[m.key])}`).join(', ');
  return (
    <div style={{ width }}>
      <div
        className="flex overflow-hidden rounded-full bg-[var(--border)]"
        style={{ height }}
        title={summary}
        role="img"
        aria-label={summary}
      >
        {MATERIAL_META.map((m) => (
          <div
            key={m.key}
            style={{ width: `${(materials[m.key] || 0) * 100}%`, background: m.color }}
          />
        ))}
      </div>
      {legend && (
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {MATERIAL_META.map((m) => (
            <li key={m.key} className="flex items-center justify-between gap-2 text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                {m.label}
              </span>
              <span className="text-[var(--text-main)] font-medium">{pct(materials[m.key])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
