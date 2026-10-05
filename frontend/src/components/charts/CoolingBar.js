import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Card from '../ui/Card';
import { ACTIONS } from '../../constants';
import { axisProps, tooltipStyle } from './chartTheme';

const COLORS = [ACTIONS.tree_planting.color, ACTIONS.cool_roofs.color, ACTIONS.both.color];

export default function CoolingBar({ data }) {
  return (
    <Card>
      <h3 className="text-sm font-semibold mb-1">Estimated cooling by action</h3>
      <p className="text-xs text-[var(--text-muted)] mb-2">Summed surface cooling (°C) across blocks</p>
      <div style={{ height: 140 }}>
        <ResponsiveContainer>
          <BarChart data={data || []} layout="vertical" margin={{ left: 10, right: 12 }}>
            <XAxis type="number" {...axisProps} />
            <YAxis type="category" dataKey="action" width={90} {...axisProps} />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(129,0,209,0.08)' }} />
            <Bar dataKey="cooling" name="Cooling (°C)" radius={[0, 4, 4, 0]}>
              {(data || []).map((d, i) => (
                <Cell key={d.action} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
