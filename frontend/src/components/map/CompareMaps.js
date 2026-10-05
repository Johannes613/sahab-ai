import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getBlocks } from '../../api/sahab';

const TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function riskColor(r) {
  return r >= 0.7 ? '#dc2626' : r >= 0.4 ? '#f97316' : '#eab308';
}

// Fit once the container actually has a size; at mount it can still be 0 wide.
function Fit({ bounds }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let done = false;
    const fit = () => {
      if (done || !el.clientWidth || !el.clientHeight) return;
      done = true;
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [20, 20], animate: false });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, bounds]);
  return null;
}

function Pane({ blocks, bounds, onMap, zoomControl = true }) {
  return (
    <MapContainer
      ref={onMap}
      center={[25.2, 55.27]}
      zoom={10}
      zoomControl={zoomControl}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url={TILE} attribution="&copy; OpenStreetMap contributors" />
      <Fit bounds={bounds} />
      {blocks.map((b) => (
        <CircleMarker
          key={b.id}
          center={[b.lat, b.lon]}
          radius={3 + b.risk_score * 11}
          pathOptions={{
            color: riskColor(b.risk_score),
            fillColor: riskColor(b.risk_score),
            fillOpacity: 0.6,
            weight: 1.2,
          }}
        />
      ))}
    </MapContainer>
  );
}

function Tag({ children, className = '' }) {
  return (
    <span
      className={`absolute top-3 z-[1000] px-2 py-1 rounded-lg text-xs font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--text-main)] ${className}`}
    >
      {children}
    </span>
  );
}

// before: older run, after: newer run
export default function CompareMaps({ before, after }) {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('swipe');
  const [pos, setPos] = useState(50);
  const maps = useRef([null, null]);
  const syncing = useRef(false);
  const ready = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    Promise.all([
      getBlocks(before.run_id, { limit: 1000 }),
      getBlocks(after.run_id, { limit: 1000 }),
    ])
      .then(([a, b]) => !cancelled && setData({ a, b }))
      .catch(() => !cancelled && setData({ a: [], b: [] }));
    return () => {
      cancelled = true;
    };
  }, [before.run_id, after.run_id]);

  const bounds = useMemo(() => {
    if (!data) return null;
    const all = [...data.a, ...data.b];
    if (!all.length) return null;
    return [
      [Math.min(...all.map((b) => b.lat)), Math.min(...all.map((b) => b.lon))],
      [Math.max(...all.map((b) => b.lat)), Math.max(...all.map((b) => b.lon))],
    ];
  }, [data]);

  // each map fits the shared bounds on its own first; only then start syncing
  useEffect(() => {
    ready.current = false;
    if (!data) return undefined;
    const t = setTimeout(() => { ready.current = true; }, 800);
    return () => clearTimeout(t);
  }, [data, mode]);

  // keep the two maps on exactly the same centre and zoom
  const register = (i) => (map) => {
    if (!map || maps.current[i] === map) return;
    maps.current[i] = map;
    map.on('move', () => {
      const other = maps.current[1 - i];
      if (!other || syncing.current || !ready.current) return;
      syncing.current = true;
      other.setView(map.getCenter(), map.getZoom(), { animate: false });
      syncing.current = false;
    });
  };

  if (!data) return <p className="text-sm text-[var(--text-muted)]">Loading maps…</p>;
  if (!bounds) return <p className="text-sm text-[var(--text-muted)]">No block data for these runs.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold">Risk maps: before and after</h3>
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
          {[['swipe', 'Swipe'], ['split', 'Side by side']].map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                maps.current = [null, null]; // panes remount, so drop the old map instances
                setMode(k);
              }}
              className={`px-3 py-1.5 transition-all ${
                mode === k ? 'bg-accent/10 text-accent font-medium' : 'text-[var(--text-muted)] hover:bg-[var(--bg)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'swipe' ? (
        <div className="relative rounded-xl overflow-hidden border border-[var(--border)]" style={{ height: 520 }}>
          <div className="absolute inset-0" style={{ isolation: 'isolate' }}>
            <Pane key="a" blocks={data.a} bounds={bounds} onMap={register(0)} />
          </div>
          <div
            className="absolute inset-0"
            style={{ isolation: 'isolate', clipPath: `inset(0 0 0 ${pos}%)` }}
          >
            <Pane key="b" blocks={data.b} bounds={bounds} onMap={register(1)} zoomControl={false} />
          </div>
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-accent z-[1000] pointer-events-none"
            style={{ left: `${pos}%` }}
          />
          <Tag className="left-14">{before.date}</Tag>
          <Tag className="right-3">{after.date}</Tag>
          <input
            type="range"
            min="0"
            max="100"
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Wipe between the two risk maps"
            className="absolute bottom-4 left-6 right-6 z-[1000] accent-[#8100D1]"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[[before, data.a, 0], [after, data.b, 1]].map(([run, blocks, i]) => (
            <div
              key={run.run_id}
              className="relative rounded-xl overflow-hidden border border-[var(--border)]"
              style={{ height: 460 }}
            >
              <Tag className="left-14">{run.date}</Tag>
              <Pane blocks={blocks} bounds={bounds} onMap={register(i)} />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-muted)]">
        <span>Risk score:</span>
        {[['< 0.4', 0.2], ['0.4 to 0.7', 0.5], ['> 0.7', 0.9]].map(([l, v]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: riskColor(v) }} />
            {l}
          </span>
        ))}
        <span>· Circle size = risk</span>
      </div>
    </div>
  );
}
