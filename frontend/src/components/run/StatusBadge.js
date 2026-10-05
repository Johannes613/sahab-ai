import React from 'react';
import Badge from '../ui/Badge';

const MAP = {
  queued: ['default', 'Queued'],
  running: ['accent', 'Running'],
  complete: ['green', 'Complete'],
  failed: ['red', 'Failed'],
};

export default function StatusBadge({ status }) {
  const [color, label] = MAP[status] || ['default', status || 'Unknown'];
  return <Badge color={color}>{label}</Badge>;
}
