import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import Card from '../ui/Card';
import { ACCENT } from '../../constants';
import { axisProps, tooltipStyle } from './chartTheme';

// buckets: ten counts for risk 0-0.1 ... 0.9-1.0, computed by the backend over every block
export default function RiskHistogram({ buckets, cityAvg }) {
  const { data, avgLabel } = useMemo(() => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      range: `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`,
      count: buckets ? buckets[i] || 0 : 0,
    }));
    const idx = cityAvg == null ? -1 : Math.min(9, Math.floor(cityAvg * 10));
    return { data: rows, avgLabel: idx >= 0 ? rows[idx].range : null };
  }, [buckets, cityAvg]);

  return (
    <Card>
      <h3 className="text-sm font-semibold mb-2">Risk score distribution</h3>
      <div style={{ height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: -20, right: 4, top: 14 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="range" {...axisProps} interval={1} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(129,0,209,0.08)' }} />
            <Bar dataKey="count" name="Blocks" fill={ACCENT} radius={[4, 4, 0, 0]} />
            {avgLabel && (
              <ReferenceLine
                x={avgLabel}
                stroke="#f59e0b"
                strokeDasharray="4 3"
                strokeWidth={2}
                label={{
                  value: `City avg ${cityAvg.toFixed(2)}`,
                  position: 'top',
                  fill: 'var(--text-muted)',
                  fontSize: 10,
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
