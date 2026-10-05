import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../ui/Card';
import { ACTIONS } from '../../constants';
import { tooltipStyle } from './chartTheme';

export default function ActionDonut({ counts, active, onSelect }) {
  const data = Object.keys(ACTIONS).map((k) => ({ key: k, name: ACTIONS[k].label, value: counts?.[k] || 0 }));
  return (
    <Card>
      <h3 className="text-sm font-semibold mb-1">Recommended actions</h3>
      <p className="text-xs text-[var(--text-muted)] mb-2">Click a slice to filter the table</p>
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
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs text-[var(--text-muted)]">
        {data.map((d) => (
          <span key={d.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: ACTIONS[d.key].color }} />
            {d.name} ({d.value})
          </span>
        ))}
      </div>
    </Card>
  );
}
