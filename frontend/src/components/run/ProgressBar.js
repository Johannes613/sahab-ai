import React, { useRef } from 'react';
import { Check, Loader2 } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { PIPELINE_STAGES } from '../../api/sahab';

function formatEta(seconds) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export default function ProgressBar({ status }) {
  const startedAt = useRef(Date.now());
  const pct = status?.progress_pct ?? 0;
  const done = status?.status === 'complete';
  const activeIdx = Math.min(PIPELINE_STAGES.length - 1, Math.floor((pct / 100) * PIPELINE_STAGES.length));

  const elapsed = (Date.now() - startedAt.current) / 1000;
  const eta = pct >= 10 && !done ? (elapsed / pct) * (100 - pct) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={status?.status} />
          <span className="text-sm text-[var(--text-muted)]">{status?.message}</span>
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
        {PIPELINE_STAGES.map((s, i) => {
          const complete = done || i < activeIdx;
          const active = !done && i === activeIdx;
          return (
            <li key={s} className="flex items-center gap-3 text-sm">
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
              <span className={active ? 'font-medium' : complete ? '' : 'text-[var(--text-muted)]'}>{s}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
