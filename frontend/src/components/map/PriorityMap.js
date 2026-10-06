import React, { useEffect, useMemo, useState } from 'react';
import {
  MapContainer, TileLayer, CircleMarker, ImageOverlay, useMap,
} from 'react-leaflet';
import { Satellite } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { ACTIONS } from '../../constants';
import MapLegend from './MapLegend';

const OVERLAYS = [
  ['risk_map', 'Risk'],
  ['material_map', 'Materials'],
  ['temperature_map', 'Temperature'],
  ['change_map', 'Change'],
];

function FitBounds({ blocks }) {
  const map = useMap();
  useEffect(() => {
    if (!blocks.length) return;
    const lats = blocks.map((b) => b.lat);
    const lons = blocks.map((b) => b.lon);
    map.invalidateSize();
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]],
      { padding: [30, 30], animate: false }
    );
    // refit only when data first arrives, not on every filter tweak
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.length === 0]);
  return null;
}

function FlyTo({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.block.lat, focus.block.lon], Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [focus, map]);
  return null;
}

function formatSources(s) {
  if (!s) return null;
  const parts = [];
  if (s.tanager_t2) {
    parts.push(
      s.tanager_t1
        ? `Tanager ${s.tanager_t1} → ${s.tanager_t2}`
        : `Tanager ${s.tanager_t2} (single scene)`
    );
  }
  if (s.landsat_range) parts.push(`Landsat ${s.landsat_range[0]} to ${s.landsat_range[1]}`);
  else if (s.lst_source) parts.push(`Temperature: ${s.lst_source}`);
  if (s.sentinel_years) parts.push(`Sentinel-2 ${s.sentinel_years[0]}-${s.sentinel_years[1]}`);
  return parts.join('  |  ');
}

export default function PriorityMap({
  blocks, focus, images, sources, selectedId, onSelect, height = 520,
}) {
  const [overlay, setOverlay] = useState(null);

  const bounds = useMemo(() => {
    if (!blocks.length) return null;
    const lats = blocks.map((b) => b.lat);
    const lons = blocks.map((b) => b.lon);
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
  }, [blocks]);

  const tile = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const sourceLine = formatSources(sources);

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)]"
      style={{ height }}
    >
      <div className="relative flex-1 min-h-0">
        <MapContainer
          center={[25.2, 55.27]}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer url={tile} attribution="&copy; OpenStreetMap contributors" />
          <FitBounds blocks={blocks} />
          <FlyTo focus={focus} />
          {overlay && (images?.bounds || bounds) && images?.[overlay] && (
            <ImageOverlay url={images[overlay]} bounds={images.bounds || bounds} opacity={0.6} />
          )}
          {blocks.map((b) => {
            const color = ACTIONS[b.action]?.color || ACTIONS.none.color;
            const selected = b.id === selectedId;
            return (
              <CircleMarker
                key={b.id}
                center={[b.lat, b.lon]}
                radius={4 + b.risk_score * 12 + (selected ? 3 : 0)}
                pathOptions={{
                  color: selected ? '#8100D1' : color,
                  fillColor: color,
                  fillOpacity: selected ? 0.9 : 0.6,
                  weight: selected ? 3.5 : 1.5,
                }}
                eventHandlers={{ click: () => onSelect?.(b) }}
              />
            );
          })}
        </MapContainer>

        <div className="absolute top-3 right-3 z-[1000] bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-xs space-y-1">
          <p className="font-semibold text-[var(--text-main)]">Layers</p>
          {OVERLAYS.map(([k, label]) => {
            const ready = Boolean(images?.[k]);
            return (
              <label
                key={k}
                title={ready ? '' : k === 'change_map' ? 'Needs an earlier scene of the same place' : 'Not available for this run'}
                className={`flex items-center gap-2 text-[var(--text-main)] ${
                  ready ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!ready}
                  checked={overlay === k}
                  onChange={() => setOverlay(overlay === k ? null : k)}
                  className="accent-[#8100D1]"
                />
                {label}
              </label>
            );
          })}
        </div>
        <MapLegend />
      </div>

      {sourceLine && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)] overflow-x-auto whitespace-nowrap">
          <Satellite size={13} className="text-accent shrink-0" />
          <span>{sourceLine}</span>
        </div>
      )}
    </div>
  );
}
