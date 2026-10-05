import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Thermometer, AlertTriangle, Layers, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useCities, useCityHistory } from '../hooks/useCity';
import { useRun } from '../context/RunContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import CompareMaps from '../components/map/CompareMaps';

function Delta({ a, b, unit = '', inverse = true }) {
  const d = +(b - a).toFixed(1);
  if (d === 0) return <span className="text-[var(--text-muted)] inline-flex items-center gap-1"><Minus size={12} />0{unit}</span>;
  const worse = inverse ? d > 0 : d < 0;
  return (
    <span className={`inline-flex items-center gap-1 ${worse ? 'text-red-500' : 'text-green-500'}`}>
      {d > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(d)}{unit}
    </span>
  );
}

export default function CityHistory() {
  const navigate = useNavigate();
  const { setRunId } = useRun();
  const { cities } = useCities();
  const [cityId, setCityId] = useState('');
  const { history, loading } = useCityHistory(cityId);
  const [cmp, setCmp] = useState([]);

  useEffect(() => {
    if (!cityId && cities.length) setCityId(cities[0].id);
  }, [cities, cityId]);
  useEffect(() => setCmp([]), [cityId]);

  const sorted = useMemo(
    () => [...history].sort((a, b) => b.date.localeCompare(a.date)),
    [history]
  );

  const open = (run) => {
    setRunId(run.run_id);
    navigate(`/?run=${encodeURIComponent(run.run_id)}`);
  };

  const toggleCmp = (id) =>
    setCmp((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-2)));

  const compared = cmp.map((id) => history.find((r) => r.run_id === id)).filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">City history</h1>
          <p className="text-sm text-[var(--text-muted)]">Past runs for year-on-year monitoring.</p>
        </div>
        <select
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text-main)] text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {compared.length === 2 && (
        <Card>
          <h3 className="text-sm font-semibold mb-3">
            Change: {compared[0].date} to {compared[1].date}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-[var(--text-muted)]">Mean LST</p>
              <p className="font-bold">{compared[0].mean_lst} → {compared[1].mean_lst} °C{' '}
                <Delta a={compared[0].mean_lst} b={compared[1].mean_lst} unit=" °C" /></p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">High-risk blocks</p>
              <p className="font-bold">{compared[0].high_risk_count} → {compared[1].high_risk_count}{' '}
                <Delta a={compared[0].high_risk_count} b={compared[1].high_risk_count} /></p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Blocks needing action</p>
              <p className="font-bold">{compared[0].top_action_count} → {compared[1].top_action_count}{' '}
                <Delta a={compared[0].top_action_count} b={compared[1].top_action_count} /></p>
            </div>
          </div>
        </Card>
      )}

      {compared.length === 2 && (
        <Card>
          <CompareMaps before={compared[0]} after={compared[1]} />
        </Card>
      )}

      {loading && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
      {!loading && !sorted.length && (
        <Card className="text-center py-10 text-sm text-[var(--text-muted)]">
          No runs for this city yet.
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map((run) => (
          <Card key={run.run_id} onClick={() => open(run)} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-bold">
                <Calendar size={14} className="text-accent" /> {run.date}
              </span>
              <label
                className="flex items-center gap-1 text-xs text-[var(--text-muted)]"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={cmp.includes(run.run_id)}
                  onChange={() => toggleCmp(run.run_id)}
                  className="accent-[#8100D1]"
                />
                Compare
              </label>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Scenes: {run.scene_dates.join(' / ')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge color="orange"><Thermometer size={11} className="mr-1" />{run.mean_lst} °C</Badge>
              <Badge color="red"><AlertTriangle size={11} className="mr-1" />{run.high_risk_count} high risk</Badge>
              <Badge color="accent"><Layers size={11} className="mr-1" />{run.top_action_count} actions</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
