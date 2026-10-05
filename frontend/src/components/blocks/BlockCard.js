import React from 'react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { ACTIONS } from '../../constants';

const ACTION_BADGE = { tree_planting: 'green', cool_roofs: 'orange', both: 'blue', none: 'default' };

export default function BlockCard({ block: b, onClick }) {
  return (
    <Card onClick={onClick}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold">Block #{b.rank}</span>
        <Badge color={ACTION_BADGE[b.action]}>{ACTIONS[b.action]?.label}</Badge>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Risk {b.risk_score.toFixed(2)} · {b.dominant_material}
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        Est. cooling {b.est_cooling_C ? `${b.est_cooling_C} °C` : '-'}
      </p>
    </Card>
  );
}
