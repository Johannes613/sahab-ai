import React from 'react';
import { Building2, TreePine, Home, FlaskConical } from 'lucide-react';

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-[var(--bg)] px-3 py-2">
      <div className="text-[11px] text-[var(--text-muted)]">{label}</div>
      <div className="text-base font-bold text-[var(--text-main)]">{value ?? 'N/A'}</div>
    </div>
  );
}

export default function CityCard({ data }) {
  const s = data.summary || {};
  const top = (data.top_blocks || []).slice(0, 3);
  return (
    <div className="my-3 max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-main)]">
          <Building2 size={16} className="text-accent" /> {data.city} heat risk summary
        </div>
        {data.is_demo && (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
            <FlaskConical size={11} /> Simulated
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Blocks analyzed" value={s.total_blocks} />
        <Stat label="High-risk blocks" value={s.high_risk_count} />
        <Stat label="Mean surface temp" value={s.mean_lst != null ? `${s.mean_lst} °C` : null} />
        <Stat
          label="Classifier kappa"
          value={s.cohen_kappa_ensemble != null ? s.cohen_kappa_ensemble.toFixed(3) : null}
        />
      </div>

      {s.action_counts && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
          {Object.entries(s.action_counts).map(([action, count]) => (
            <span key={action} className="inline-flex items-center gap-1">
              {action.toLowerCase().includes('tree') ? <TreePine size={12} /> : <Home size={12} />}
              {action}: {count}
            </span>
          ))}
        </div>
      )}

      {top.length > 0 && (
        <div className="mt-3 border-t border-[var(--border)] pt-2">
          <div className="text-[11px] text-[var(--text-muted)] mb-1">Top blocks</div>
          {top.map((b) => (
            <div key={b.rank} className="flex items-center justify-between text-xs py-0.5">
              <span className="text-[var(--text-main)]">
                #{b.rank} · {b.action}
              </span>
              <span className="text-[var(--text-muted)]">
                risk {b.risk_score} · {b.est_cooling_c} ± {b.cooling_ci_c} °C
              </span>
            </div>
          ))}
        </div>
      )}

      {s.note && <div className="mt-2 text-[11px] italic text-[var(--text-muted)]">{s.note}</div>}
    </div>
  );
}
