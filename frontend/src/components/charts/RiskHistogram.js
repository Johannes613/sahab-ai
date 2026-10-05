import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Card from '../ui/Card';
import { ACCENT } from '../../constants';
import { axisProps, tooltipStyle } from './chartTheme';

export default function RiskHistogram({ blocks }) {
  const data = useMemo(() => {
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`,
      count: 0,
    }));
    blocks.forEach((b) => {
      buckets[Math.min(9, Math.floor(b.risk_score * 10))].count += 1;
    });
    return buckets;
  }, [blocks]);

  return (
    <Card>
      <h3 className="text-sm font-semibold mb-2">Risk score distribution</h3>
      <div style={{ height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: -20, right: 4, top: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="range" {...axisProps} interval={1} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(129,0,209,0.08)' }} />
            <Bar dataKey="count" name="Blocks" fill={ACCENT} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
