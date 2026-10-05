import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import Card from '../ui/Card';
import { ACCENT } from '../../constants';
import { axisProps, tooltipStyle } from './chartTheme';

const yearOf = (d) => (/^\d{4}/.test(d || '') ? Number(d.slice(0, 4)) : null);

export default function TrendLine({ data, sources }) {
  if (!data?.length) return null;
  const years = new Set(data.map((d) => d.year));
  const marks = [
    ['T1', yearOf(sources?.tanager_t1), sources?.tanager_t1],
    ['T2', yearOf(sources?.tanager_t2), sources?.tanager_t2],
  ].filter(([, y]) => y && years.has(y));

  return (
    <Card>
      <h3 className="text-sm font-semibold mb-1">Vegetation vs built-up trend</h3>
      <p className="text-xs text-[var(--text-muted)] mb-2">
        Sentinel-2 NDVI and NDBI by year. Dashed lines mark the two Tanager scenes.
      </p>
      <div style={{ height: 190 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: -10, right: 4, top: 16 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis yAxisId="l" {...axisProps} domain={['auto', 'auto']} />
            <YAxis yAxisId="r" orientation="right" {...axisProps} domain={['auto', 'auto']} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {marks.map(([label, year, date]) => (
              <ReferenceLine
                key={label}
                yAxisId="l"
                x={year}
                stroke="#f59e0b"
                strokeDasharray="4 3"
                label={{ value: `${label} ${date}`, position: 'top', fill: 'var(--text-muted)', fontSize: 10 }}
              />
            ))}
            <Line yAxisId="l" type="monotone" dataKey="ndvi" name="NDVI" stroke="#22c55e" strokeWidth={2} dot={false} />
            <Line yAxisId="r" type="monotone" dataKey="ndbi" name="NDBI" stroke={ACCENT} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
