export const ACTIONS = {
  tree_planting: { label: 'Tree planting', color: '#22c55e' },
  cool_roofs: { label: 'Cool roofs', color: '#f59e0b' },
  both: { label: 'Both', color: '#3b82f6' },
  none: { label: 'No action', color: '#9ca3af' },
};

export const ACTION_KEYS = Object.keys(ACTIONS);
export const ACCENT = '#8100D1';

// The analysis the dashboard opens on when nothing else is selected. It ships with the backend
// (sahab-api/seed) so a fresh install is never empty.
export const DEFAULT_RUN_ID = 'riyadh-2025-05-15';
