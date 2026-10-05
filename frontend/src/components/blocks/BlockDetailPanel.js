import React, { useEffect, useRef } from 'react';
import { X, ArrowUp, ArrowDown, Minus, Lightbulb } from 'lucide-react';
import Badge from '../ui/Badge';
import MaterialBar from './MaterialBar';
import { ACTIONS } from '../../constants';

const ACTION_BADGE = { tree_planting: 'green', cool_roofs: 'orange', both: 'blue', none: 'default' };

function riskColor(r) {
  return r >= 0.7 ? '#dc2626' : r >= 0.4 ? '#f97316' : '#eab308';
}

function Section({ title, children }) {
  return (
    <section className="py-4 border-b border-[var(--border)] last:border-0">
      <h4 className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-2">{title}</h4>
      {children}
    </section>
  );
}

function CompareRow({ label, value, avg, format, higherIsWorse }) {
  const d = value - avg;
  const flat = Math.abs(d) < 1e-9;
  const worse = higherIsWorse ? d > 0 : d < 0;
  const color = flat ? 'text-[var(--text-muted)]' : worse ? 'text-red-500' : 'text-green-500';
  const Arrow = flat ? Minus : d > 0 ? ArrowUp : ArrowDown;
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-2 text-[var(--text-muted)]">{label}</td>
      <td className="py-2 text-right font-medium">{format(value)}</td>
      <td className="py-2 text-right text-[var(--text-muted)]">{format(avg)}</td>
      <td className={`py-2 text-right ${color}`}>
        <span className="inline-flex items-center gap-0.5">
          <Arrow size={12} />
          {format(Math.abs(d))}
        </span>
      </td>
    </tr>
  );
}

export default function BlockDetailPanel({ block: b, cityAvg, onClose }) {
  const open = Boolean(b);
  const last = useRef(b);
  if (b) last.current = b;
  const block = last.current; // keep content mounted while sliding out

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <aside
      aria-hidden={!open}
      className={`fixed top-0 right-0 h-full w-full sm:w-[400px] z-[1200] bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl overflow-y-auto transition-transform duration-300 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {block && (
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-[var(--text-muted)]">Priority block</p>
              <h2 className="text-2xl font-bold">#{block.rank}</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {block.lat.toFixed(4)}, {block.lon.toFixed(4)} · {Number(block.area_m2).toLocaleString()} m²
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close block details"
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg)]"
            >
              <X size={18} />
            </button>
          </div>

          <Section title="Risk score">
            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-bold" style={{ color: riskColor(block.risk_score) }}>
                {block.risk_score.toFixed(2)}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                heat × population × green deficit
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${block.risk_score * 100}%`, background: riskColor(block.risk_score) }}
              />
              {cityAvg && (
                <div
                  className="absolute -top-1 w-0.5 bg-[var(--text-main)]"
                  style={{ left: `${cityAvg.risk_score * 100}%`, height: 18 }}
                  title={`City average ${cityAvg.risk_score.toFixed(2)}`}
                />
              )}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Black tick = city average</p>
          </Section>

          <Section title="Material breakdown">
            <MaterialBar materials={block.materials} height={14} legend />
          </Section>

          <Section title="Estimated surface cooling">
            {block.est_cooling_C ? (
              <>
                <p className="text-2xl font-bold">
                  {block.est_cooling_C.toFixed(1)}{' '}
                  <span className="text-base font-medium text-[var(--text-muted)]">
                    ± {block.est_cooling_ci.toFixed(1)} °C
                  </span>
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Plausible range {(block.est_cooling_C - block.est_cooling_ci).toFixed(1)} to{' '}
                  {(block.est_cooling_C + block.est_cooling_ci).toFixed(1)} °C (Gaussian Process, 95% interval)
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No intervention recommended.</p>
            )}
          </Section>

          <Section title="Recommended action">
            <div className="mb-2">
              <Badge color={ACTION_BADGE[block.action]}>{ACTIONS[block.action]?.label}</Badge>
            </div>
            <p className="flex gap-2 text-sm leading-relaxed">
              <Lightbulb size={16} className="shrink-0 mt-0.5 text-accent" />
              {block.action_rationale}
            </p>
          </Section>

          {cityAvg && (
            <Section title="Compare with city average">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--text-muted)] text-right">
                    <th className="text-left font-medium pb-1" />
                    <th className="font-medium pb-1">Block</th>
                    <th className="font-medium pb-1">City</th>
                    <th className="font-medium pb-1">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  <CompareRow
                    label="Risk score" value={block.risk_score} avg={cityAvg.risk_score}
                    format={(v) => v.toFixed(2)} higherIsWorse
                  />
                  <CompareRow
                    label="Temp vs baseline" value={block.lst_delta} avg={cityAvg.lst_delta}
                    format={(v) => `${v.toFixed(1)} °C`} higherIsWorse
                  />
                  <CompareRow
                    label="Vegetation" value={block.materials.vegetation} avg={cityAvg.vegetation}
                    format={(v) => `${Math.round(v * 100)}%`} higherIsWorse={false}
                  />
                  <CompareRow
                    label="Population exposure" value={block.population_exposure} avg={cityAvg.population_exposure}
                    format={(v) => v.toFixed(2)} higherIsWorse
                  />
                </tbody>
              </table>
            </Section>
          )}
        </div>
      )}
    </aside>
  );
}
