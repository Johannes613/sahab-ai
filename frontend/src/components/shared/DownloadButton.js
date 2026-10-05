import React from 'react';
import { Download } from 'lucide-react';
import Button from '../ui/Button';

function toCsv(rows) {
  if (!rows.length) return '';
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
