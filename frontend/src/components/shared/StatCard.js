import React from 'react';
import Card from '../ui/Card';

export default function StatCard({ icon, label, value, sub, color = '#8100D1', badge }) {
  return (
    <Card className="flex items-center gap-4">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}1a`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--text-muted)] truncate">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold text-[var(--text-main)] leading-tight">{value}</p>
          {badge}
        </div>
        {sub && <p className="text-xs text-[var(--text-muted)] truncate">{sub}</p>}
      </div>
    </Card>
  );
}
