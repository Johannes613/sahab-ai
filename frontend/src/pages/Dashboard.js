import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Grid3x3, AlertTriangle, Thermometer, Snowflake, PlayCircle, MapPin, FileDown,
} from 'lucide-react';
import { useRun } from '../context/RunContext';
import { useBlocks, useSummary } from '../hooks/useBlocks';
import { useCities } from '../hooks/useCity';
import { getAllRuns, getImages, getMapUrl, USE_MOCK } from '../api/sahab';
import StatCard from '../components/shared/StatCard';
import DownloadButton from '../components/shared/DownloadButton';
import ImageViewer from '../components/shared/ImageViewer';
import ComparisonRow from '../components/shared/ComparisonRow';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PriorityMap from '../components/map/PriorityMap';
import ActionDonut from '../components/charts/ActionDonut';
import RiskHistogram from '../components/charts/RiskHistogram';
import CoolingBar from '../components/charts/CoolingBar';
import TrendLine from '../components/charts/TrendLine';
import FilterPanel from '../components/blocks/FilterPanel';
import PriorityTable from '../components/blocks/PriorityTable';
import BlockDetailPanel from '../components/blocks/BlockDetailPanel';

const DEMO_RUN = 'demo-dubai-2026-10';
const avg = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

export default function Dashboard() {
  const { runId: ctxRunId, setRunId } = useRun();
  const [params, setParams] = useSearchParams();
  const runId = params.get('run') || ctxRunId || (USE_MOCK ? DEMO_RUN : null);

  useEffect(() => {
    const fromUrl = params.get('run');
    if (fromUrl && fromUrl !== ctxRunId) setRunId(fromUrl);
  }, [params, ctxRunId, setRunId]);

  const { cities } = useCities();
  const { summary, error } = useSummary(runId);
  const { blocks: allBlocks } = useBlocks(runId, { limit: 1000 });
  const [filters, setFilters] = useState({ action: '', min_risk: 0, min_population: 0 });
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [images, setImages] = useState(null);
  const [runs, setRuns] = useState([]);
  const [mapUrl, setMapUrl] = useState(null);

  const serverFilters = useMemo(() => {
    const f = { limit: 1000 };
    if (filters.action) f.action = filters.action;
    if (filters.min_risk) f.min_risk = filters.min_risk;
    if (filters.min_population) f.min_population = filters.min_population;
    return f;
  }, [filters]);
  const { blocks: filtered, loading } = useBlocks(runId, serverFilters);

  // reset per-run UI state when the run changes
  useEffect(() => {
    setSelected(null);
    setFocus(null);
    setFilters({ action: '', min_risk: 0, min_population: 0 });
    setSearch('');
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    getImages(runId).then(setImages).catch(() => setImages(null));
    getMapUrl(runId).then((d) => setMapUrl(d.url)).catch(() => setMapUrl(null));
  }, [runId]);

  useEffect(() => {
    getAllRuns().then(setRuns).catch(() => setRuns([]));
  }, [runId]);

  const runMeta = runs.find((r) => r.run_id === runId) || null;
  const previousRun = useMemo(() => {
    if (!runMeta) return null;
    return (
      runs
        .filter((r) => r.city_id === runMeta.city_id && r.date < runMeta.date)
        .sort((a, b) => b.date.localeCompare(a.date))[0] || null
    );
  }, [runs, runMeta]);

  const cityAvg = useMemo(() => {
    if (!allBlocks.length) return null;
    return {
      risk_score: avg(allBlocks.map((b) => b.risk_score)),
      lst_delta: avg(allBlocks.map((b) => b.lst_delta)),
      vegetation: avg(allBlocks.map((b) => b.materials.vegetation)),
      population_exposure: avg(allBlocks.map((b) => b.population_exposure)),
    };
  }, [allBlocks]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((b) =>
      `${b.lat} ${b.lon} ${b.dominant_material} ${b.rank}`.toLowerCase().includes(q)
    );
  }, [filtered, search]);

  const onView = useCallback((block) => {
    setFocus({ block, t: Date.now() });
    setSelected(block);
  }, []);
  const closePanel = useCallback(() => setSelected(null), []);

  const changeCity = (cityId) => {
    const latest = runs
      .filter((r) => r.city_id === cityId)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) {
      toast('No analysis for this city yet. Start one from Run Analysis.');
      return;
    }
    setParams({ run: latest.run_id });
  };

  if (!runId) {
    return (
      <Card className="max-w-xl mx-auto mt-16 text-center py-10">
        <MapPin size={32} className="mx-auto text-accent mb-3" />
        <h2 className="text-lg font-bold mb-1">No analysis loaded</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5">
          Run an analysis or open a past run from City History to see the priority map.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/run"><Button><PlayCircle size={16} /> Run analysis</Button></Link>
          <Link to="/history"><Button variant="secondary">City history</Button></Link>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="max-w-xl mx-auto mt-16 text-center py-10">
        <AlertTriangle size={32} className="mx-auto text-red-500 mb-3" />
        <h2 className="text-lg font-bold mb-1">Could not load this run</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5">It may have failed or been removed.</p>
        <Link to="/history"><Button variant="secondary">Back to history</Button></Link>
      </Card>
    );
  }

  const delta = summary?.mean_lst_delta_top20;
  const currentForCompare = summary && {
    mean_lst: summary.mean_lst,
    high_risk_count: summary.high_risk_count,
    top_action_count: summary.total_blocks - (summary.top_action_counts?.none || 0),
    mean_lst_delta_top20: summary.mean_lst_delta_top20,
  };

  return (
    <div className="space-y-6">
      {/* Hero with city selector */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #8100D1 0%, #5a0099 50%, #3b006b 100%)' }}
      >
        <div
          className="absolute top-0 left-0 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'white', transform: 'translate(-40%, -40%)' }}
        />
        <div
          className="absolute bottom-0 right-64 w-40 h-40 rounded-full opacity-10"
          style={{ background: 'white', transform: 'translate(0, 40%)' }}
        />
        <div className="relative z-10 px-8 py-7 flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <p className="text-purple-200 text-sm font-medium tracking-wide uppercase mb-1">
              {runMeta?.date ? `Run of ${runMeta.date}` : 'Heat risk analysis'}
            </p>
            <h1 className="text-3xl font-bold text-white mb-1">
              {runMeta?.city_name || 'City'} heat risk
            </h1>
            <p className="text-purple-200 text-sm">
              {summary
                ? `${summary.high_risk_count} high-risk blocks out of ${summary.total_blocks}. Start with the top 20 for the largest estimated surface cooling.`
                : 'Loading results…'}
            </p>
          </div>
          <div>
            <label htmlFor="city-select" className="block text-xs text-purple-200 uppercase tracking-wide mb-1">
              City
            </label>
            <select
              id="city-select"
              value={runMeta?.city_id || ''}
              onChange={(e) => changeCity(e.target.value)}
              className="min-w-[180px] px-3 py-2 rounded-lg text-sm font-medium bg-white/15 text-white border border-white/30 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              {!runMeta && <option value="">Select a city</option>}
              {cities.map((c) => (
                <option key={c.id} value={c.id} className="text-gray-900">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<Grid3x3 size={22} />} label="Blocks analyzed"
          value={summary?.total_blocks ?? '-'} color="#8100D1"
        />
        <StatCard
          icon={<AlertTriangle size={22} />} label="High risk (score > 0.7)"
          value={summary?.high_risk_count ?? '-'} color="#ef4444"
          badge={summary && <Badge color="red">High</Badge>}
        />
        <StatCard
          icon={<Thermometer size={22} />} label="Mean LST above city baseline"
          value={delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} °C` : '-'}
          color="#f59e0b"
          sub={summary ? `Top 20 blocks vs city mean of ${summary.mean_lst} °C` : undefined}
        />
        <StatCard
          icon={<Snowflake size={22} />} label="Est. cooling, top 20 blocks"
          value={summary ? `${summary.total_cooling_top20} °C` : '-'} color="#3b82f6"
          sub="Summed surface cooling (modelled)"
        />
      </div>

      <ComparisonRow
        current={currentForCompare}
        previous={previousRun}
        previousDate={previousRun?.date}
      />

      {/* Map + charts */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 space-y-2">
          <PriorityMap
            blocks={visible}
            focus={focus}
            images={images}
            sources={summary?.data_sources}
            selectedId={selected?.id}
            onSelect={setSelected}
            height={680}
          />
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="pr-4">Standalone map: one HTML file that opens in any browser.</span>
            {mapUrl ? (
              <a href={mapUrl} target="_blank" rel="noreferrer" download>
                <Button variant="secondary" size="sm" className="whitespace-nowrap">
                  <FileDown size={14} /> Standalone HTML map
                </Button>
              </a>
            ) : (
              <Button variant="secondary" size="sm" className="whitespace-nowrap" disabled>
                <FileDown size={14} /> Standalone HTML map
              </Button>
            )}
          </div>
        </div>
        <div className="xl:col-span-2 space-y-4">
          <ActionDonut
            counts={summary?.top_action_counts}
            cooling={summary?.cooling_total_by_action}
            active={filters.action}
            onSelect={(action) => setFilters((f) => ({ ...f, action }))}
          />
          <RiskHistogram blocks={allBlocks} cityAvg={cityAvg?.risk_score} />
          <CoolingBar data={summary?.cooling_by_action} />
          <TrendLine data={summary?.trend} sources={summary?.data_sources} />
        </div>
      </div>

      <ImageViewer images={images} />

      {/* Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">
            Priority blocks{' '}
            {loading && <span className="text-[var(--text-muted)] font-normal">updating…</span>}
          </h3>
          <DownloadButton rows={visible} filename="sahab-priority-blocks.csv" />
        </div>
        <FilterPanel filters={filters} onChange={setFilters} search={search} onSearch={setSearch} />
        <PriorityTable blocks={visible} onView={onView} />
      </Card>

      <p className="text-xs text-[var(--text-muted)]">
        Surface temperature only; cooling values are modelled scenarios, not guarantees. This is a screening and
        prioritization tool, not a replacement for field surveys.
      </p>

      <BlockDetailPanel block={selected} cityAvg={cityAvg} onClose={closePanel} />
    </div>
  );
}
