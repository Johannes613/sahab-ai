import React, { useState } from 'react';
import Card from '../ui/Card';

const TABS = [
  ['material_map', 'Materials'],
  ['temperature_map', 'Temperature'],
  ['risk_map', 'Risk'],
  ['change_map', 'Change'],
];

export default function ImageViewer({ images }) {
  const available = TABS.filter(([k]) => images?.[k]);
  const [active, setActive] = useState(null);
  if (!available.length) return null;
  const current = active && images[active] ? active : available[0][0];

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold mr-2">Output maps</h3>
        {available.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setActive(k)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              current === k ? 'bg-accent/10 text-accent' : 'text-[var(--text-muted)] hover:bg-[var(--bg)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <img src={images[current]} alt={current} className="w-full rounded-lg border border-[var(--border)] bg-gray-300 dark:bg-gray-700" />
    </Card>
  );
}
