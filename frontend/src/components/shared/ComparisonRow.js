import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import Card from '../ui/Card';

function Item({ label, current, previous, unit = '', decimals = 0 }) {
  if (current == null || previous == null) return null;
  const fmt = (v) => `${Number(v).toFixed(decimals)}${unit}`;
  const d = +(current - previous).toFixed(decimals);
  const flat = d === 0;
  // for every metric here, lower is better
  const good = d < 0;
  const color = flat ? 'text-[var(--text-muted)]' : good ? 'text-green-500' : 'text-red-500';
  const Arrow = flat ? Minus : d > 0 ? ArrowUp : ArrowDown;
  return (
    <div className="min-w-0">
      <p className="text-xs text-[var(--text-muted)] truncate">{label}</p>
      <p className="text-xl font-bold leading-tight">{fmt(current)}</p>
      <p className={`text-xs flex items-center gap-1 ${color}`}>
        <Arrow size={12} />
        {flat ? 'unchanged' : `${good ? 'down' : 'up'} from ${fmt(previous)}`}
      </p>
    </div>
  );
}

export default function ComparisonRow({ current, previous, previousDate }) {
  if (!current || !previous) return null;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
        <h3 className="text-sm font-semibold">Change since the previous run</h3>
        <span className="text-xs text-[var(--text-muted)]">vs run of {previousDate}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Item label="Mean LST" current={current.mean_lst} previous={previous.mean_lst} unit=" °C" decimals={1} />
        <Item label="High-risk blocks" current={current.high_risk_count} previous={previous.high_risk_count} />
        <Item label="Blocks needing action" current={current.top_action_count} previous={previous.top_action_count} />
        <Item
          label="Top-20 temp above baseline"
          current={current.mean_lst_delta_top20}
          previous={previous.mean_lst_delta_top20}
          unit=" °C"
          decimals={1}
        />
      </div>
    </Card>
  );
}
