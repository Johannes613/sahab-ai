import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer, TileLayer, CircleMarker, ImageOverlay, useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ACTIONS } from '../../constants';
import BlockPopup from './BlockPopup';
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
    // refit only when the dataset identity changes, not on every filter tweak
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.length === 0]);
  return null;
}

function FlyTo({ focus, markers }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.block.lat, focus.block.lon], 15, { duration: 0.8 });
    const t = setTimeout(() => markers.current[focus.block.id]?.openPopup(), 850);
    return () => clearTimeout(t);
  }, [focus, map, markers]);
  return null;
}

export default function PriorityMap({ blocks, focus, images, height = 520 }) {
  const markers = useRef({});
  const [overlay, setOverlay] = useState(null);

  const bounds = useMemo(() => {
    if (!blocks.length) return null;
    const lats = blocks.map((b) => b.lat);
    const lons = blocks.map((b) => b.lon);
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
  }, [blocks]);

  const tile = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';


  return (
    <div className="relative rounded-xl overflow-hidden border border-[var(--border)]" style={{ height }}>
      <MapContainer
        center={[25.2, 55.27]}
        zoom={11}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          url={tile}
          attribution='&copy; OpenStreetMap contributors'
        />
        <FitBounds blocks={blocks} />
        <FlyTo focus={focus} markers={markers} />
        {overlay && bounds && images?.[overlay] && (
          <ImageOverlay url={images[overlay]} bounds={bounds} opacity={0.6} />
        )}
        {blocks.map((b) => {
          const color = ACTIONS[b.action]?.color || ACTIONS.none.color;
          return (
            <CircleMarker
              key={b.id}
              ref={(el) => { markers.current[b.id] = el; }}
              center={[b.lat, b.lon]}
              radius={4 + b.risk_score * 12}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.6, weight: 1.5 }}
            >
              <BlockPopup block={b} />
            </CircleMarker>
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
              title={ready ? '' : 'Available once the backend has produced this raster'}
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
  );
}
