import React, { useRef } from 'react';
import { Check, Loader2 } from 'lucide-react';
import StatusBadge from './StatusBadge';

// The backend reports its current step as text; match it to a stage to highlight.
const STAGES = [
  { label: 'Loading scene metadata', test: /metadata/i },
  { label: 'Downloading satellite scenes', test: /download/i },
  { label: 'Quality masks and spectral indices', test: /mask|band|index|indices/i },
  { label: 'Classifying surface materials', test: /classif/i },
  { label: 'Land surface temperature', test: /temperature|change detection|skipping/i },
  { label: 'Block-level heat risk', test: /aggregat|block-level|risk/i },
  { label: 'Cooling estimates and interventions', test: /cooling|intervention|validation|block list|ranking/i },
  { label: 'Sentinel-2 vegetation trend', test: /sentinel/i },
  { label: 'Rendering maps and saving', test: /render|saving|done/i },
];

function formatEta(seconds) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export default function ProgressBar({ status }) {
  const startedAt = useRef(Date.now());
  const pct = status?.progress_pct ?? 0;
  const done = status?.status === 'complete';
  const message = status?.message || '';

  let activeIdx = STAGES.findIndex((s) => s.test.test(message));
  if (activeIdx < 0) activeIdx = Math.min(STAGES.length - 1, Math.floor((pct / 100) * STAGES.length));

  const elapsed = (Date.now() - startedAt.current) / 1000;
  const eta = pct >= 15 && !done ? (elapsed / pct) * (100 - pct) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status={status?.status} />
          <span className="text-sm text-[var(--text-muted)] truncate">{message}</span>
        </div>
        <span className="text-sm font-bold">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-[var(--text-muted)] mt-2">
        {done ? 'Finished' : eta ? `About ${formatEta(eta)} remaining` : 'Estimating time remaining…'}
      </p>

      <ol className="mt-6 space-y-2">
        {STAGES.map((s, i) => {
          const complete = done || i < activeIdx;
          const active = !done && i === activeIdx;
          return (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  complete
                    ? 'bg-accent text-white'
                    : active
                    ? 'border-2 border-accent text-accent'
                    : 'border border-[var(--border)] text-[var(--text-muted)]'
                }`}
              >
                {complete ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : i + 1}
              </span>
              <span className={active ? 'font-medium' : complete ? '' : 'text-[var(--text-muted)]'}>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
