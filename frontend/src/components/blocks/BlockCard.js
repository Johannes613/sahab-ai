import React from 'react';
import Badge from '../ui/Badge';
import MaterialBar from './MaterialBar';
import { ACTIONS } from '../../constants';

const ACTION_BADGE = { tree_planting: 'purple', cool_roofs: 'purple', both: 'purple', none: 'default' };

function riskColor(r) {
  return '#8100D1';
}

export default function BlockCard({ block: b, onClick, selected }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 transition-all hover:border-accent/50 hover:bg-accent/5 ${
        selected ? 'border-accent bg-accent/5' : 'border-[var(--border)]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold text-white"
          style={{ background: riskColor(b.risk_score) }}
        >
          {b.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Badge color={ACTION_BADGE[b.action]}>{ACTIONS[b.action]?.label}</Badge>
            <span className="text-xs text-[var(--text-muted)]">Risk {b.risk_score.toFixed(2)}</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1 truncate">
            {b.est_cooling_C
              ? `Est. cooling ${b.est_cooling_C.toFixed(1)} ± ${b.est_cooling_ci.toFixed(1)} °C`
              : 'No intervention'}
            {' · '}
            {b.lst_delta >= 0 ? '+' : ''}{b.lst_delta.toFixed(1)} °C vs baseline
          </p>
        </div>
      </div>
      <div className="mt-2">
        <MaterialBar materials={b.materials} height={6} />
      </div>
    </button>
  );
}
