import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import Card from '../ui/Card';
import { ACCENT } from '../../constants';
import { axisProps, tooltipStyle } from './chartTheme';

export default function TrendLine({ data }) {
  if (!data?.length) return null;
  return (
    <Card>
      <h3 className="text-sm font-semibold mb-1">Vegetation vs built-up trend</h3>
      <p className="text-xs text-[var(--text-muted)] mb-2">Sentinel-2 NDVI and NDBI by year</p>
      <div style={{ height: 180 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: -10, right: 4, top: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis yAxisId="l" {...axisProps} domain={['auto', 'auto']} />
            <YAxis yAxisId="r" orientation="right" {...axisProps} domain={['auto', 'auto']} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="l" type="monotone" dataKey="ndvi" name="NDVI" stroke="#22c55e" strokeWidth={2} dot={false} />
            <Line yAxisId="r" type="monotone" dataKey="ndbi" name="NDBI" stroke={ACCENT} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
