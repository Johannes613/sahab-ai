import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../ui/Card';
import { ACTIONS } from '../../constants';

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="text-xs rounded-lg px-3 py-2"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-main)' }}
    >
      <p className="font-semibold">{d.name}</p>
      <p>{d.value} blocks</p>
      {d.key !== 'none' && <p>{d.cooling.toFixed(1)} °C total cooling available</p>}
    </div>
  );
}

export default function ActionDonut({ counts, cooling, active, onSelect }) {
  const data = Object.keys(ACTIONS).map((k) => ({
    key: k,
    name: ACTIONS[k].label,
    value: counts?.[k] || 0,
    cooling: cooling?.[k] || 0,
  }));
  return (
    <Card>
      <h3 className="text-sm font-semibold mb-1">Recommended actions</h3>
      <p className="text-xs text-[var(--text-muted)] mb-2">
        Hover for total cooling available. Click a slice to filter the table.
      </p>
      <div style={{ height: 190 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={78}
              paddingAngle={2}
              stroke="none"
              onClick={(d) => onSelect(active === d.key ? '' : d.key)}
              style={{ cursor: 'pointer' }}
            >
              {data.map((d) => (
                <Cell
                  key={d.key}
                  fill={ACTIONS[d.key].color}
                  opacity={!active || active === d.key ? 1 : 0.3}
                />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1 text-xs text-[var(--text-muted)] mt-2">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: ACTIONS[d.key].color }} />
              {d.name} ({d.value} blocks)
            </span>
            <span className="text-[var(--text-main)] font-medium">
              {d.key === 'none' ? '-' : `${d.cooling.toFixed(1)} °C total`}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
