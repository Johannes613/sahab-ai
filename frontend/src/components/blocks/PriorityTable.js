import React, { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel, flexRender,
} from '@tanstack/react-table';
import { Eye, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import Badge from '../ui/Badge';
import MaterialBar from './MaterialBar';
import Button from '../ui/Button';
import { ACTIONS } from '../../constants';

const ACTION_BADGE = { tree_planting: 'green', cool_roofs: 'orange', both: 'blue', none: 'default' };

export default function PriorityTable({ blocks, onView }) {
  const [sorting, setSorting] = useState([{ id: 'rank', desc: false }]);

  const columns = useMemo(
    () => [
      { accessorKey: 'rank', header: 'Rank' },
      { accessorKey: 'risk_score', header: 'Risk Score', cell: (c) => c.getValue().toFixed(2) },
      {
        accessorKey: 'population_exposure',
        header: 'Population exposure',
        cell: (c) => c.getValue().toFixed(2),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: (c) => <Badge color={ACTION_BADGE[c.getValue()]}>{ACTIONS[c.getValue()]?.label}</Badge>,
      },
      {
        accessorKey: 'est_cooling_C',
        header: 'Est. Cooling (°C)',
        cell: ({ row }) => (row.original.action === 'none' ? '-' : row.original.est_cooling_C.toFixed(2)),
      },
      {
        accessorKey: 'est_cooling_ci',
        header: 'Cooling interval',
        cell: ({ row }) => {
          const { action, est_cooling_C: c, est_cooling_ci: ci } = row.original;
          return action === 'none' ? '-' : `${c.toFixed(2)} ± ${ci.toFixed(2)} °C`;
        },
      },
      {
        id: 'materials',
        header: 'Materials',
        enableSorting: false,
        cell: ({ row }) => <MaterialBar materials={row.original.materials} width={120} height={10} />,
      },
      { accessorKey: 'lat', header: 'Lat', cell: (c) => c.getValue().toFixed(4) },
      { accessorKey: 'lon', header: 'Lon', cell: (c) => c.getValue().toFixed(4) },
      {
        id: 'view',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <button
            title="Show on map"
            aria-label={`Show block ${row.original.rank} on map`}
            onClick={() => onView(row.original)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-accent hover:bg-accent/10"
          >
            <Eye size={16} />
          </button>
        ),
      },
    ],
    [onView]
  );

  const table = useReactTable({
    data: blocks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const { pageIndex } = table.getState().pagination;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-[var(--border)]">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      onClick={h.column.getToggleSortingHandler()}
                      className={`text-left text-xs font-medium text-[var(--text-muted)] px-3 py-2 whitespace-nowrap ${
                        h.column.getCanSort() ? 'cursor-pointer select-none hover:text-[var(--text-main)]' : ''
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getCanSort() &&
                          (sorted === 'asc' ? <ArrowUp size={12} />
                            : sorted === 'desc' ? <ArrowDown size={12} />
                            : <ChevronsUpDown size={12} className="opacity-40" />)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border)] hover:bg-[var(--bg)]">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {!blocks.length && (
              <tr>
                <td colSpan={columns.length} className="text-center text-[var(--text-muted)] py-8">
                  No blocks match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-[var(--text-muted)]">
        <span>{blocks.length} blocks</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Prev
          </Button>
          <span>Page {pageIndex + 1} of {Math.max(1, table.getPageCount())}</span>
          <Button variant="secondary" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
