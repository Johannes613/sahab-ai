import React from 'react';
import { Download } from 'lucide-react';
import Button from '../ui/Button';

// one level of flattening so nested objects (materials) become columns
function flatten(row) {
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    if (v && typeof v === 'object') Object.entries(v).forEach(([k2, v2]) => { out[`${k}_${k2}`] = v2; });
    else out[k] = v;
  });
  return out;
}

function toCsv(input) {
  if (!input.length) return '';
  const rows = input.map(flatten);
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export default function DownloadButton({ rows, filename = 'sahab-blocks.csv', label = 'Export CSV' }) {
  const onClick = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={!rows.length}>
      <Download size={14} /> {label}
    </Button>
  );
}
