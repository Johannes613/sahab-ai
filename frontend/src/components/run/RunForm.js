import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Rectangle, useMapEvents, useMap } from 'react-leaflet';
import { Play, Satellite, Loader2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import Card from '../ui/Card';
import Button from '../ui/Button';
import SceneThumb from './SceneThumb';
import { searchScenes } from '../../api/sahab';

const field =
  'w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-main)] text-sm focus:outline-none focus:ring-2 focus:ring-accent/40';

function Label({ children }) {
  return <label className="block text-sm font-medium text-[var(--text-main)] mb-1">{children}</label>;
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-[#8100D1]"
      />
      <span className="text-sm">
        {label}
        <span className="block text-xs text-[var(--text-muted)]">{hint}</span>
      </span>
    </label>
  );
}

function DrawLayer({ onBox }) {
  const [first, setFirst] = useState(null);
  useMapEvents({
    click(e) {
      if (!first) {
        setFirst(e.latlng);
      } else {
        const a = first;
        const b = e.latlng;
        onBox([
          +Math.min(a.lng, b.lng).toFixed(4), +Math.min(a.lat, b.lat).toFixed(4),
          +Math.max(a.lng, b.lng).toFixed(4), +Math.max(a.lat, b.lat).toFixed(4),
        ]);
        setFirst(null);
      }
    },
  });
  return null;
}

function Recenter({ bbox }) {
  const map = useMap();
  useEffect(() => {
    if (!bbox) return;
    map.invalidateSize();
    map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [20, 20], animate: false });
  }, [bbox, map]);
  return null;
}

const toBounds = (b) => [[b[1], b[0]], [b[3], b[2]]];

export default function RunForm({ catalog, onSubmit, busy, initial }) {
  const [cityName, setCityName] = useState('');      // '' = custom city
  const [customName, setCustomName] = useState('');
  const [bbox, setBbox] = useState(null);             // drawn or prefilled area, overrides the city default
  const [epsg, setEpsg] = useState(initial?.epsg || null);
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  const [blockSize, setBlockSize] = useState(600);
  const [minValid, setMinValid] = useState(15);
  const [sentinel, setSentinel] = useState(true);
  const [landsat, setLandsat] = useState(true);
  const [error, setError] = useState('');

  const [scenes, setScenes] = useState([]);
  const [suggested, setSuggested] = useState(null);
  const [scenesLoading, setScenesLoading] = useState(false);
  const userPickedScenes = useRef(false);

  const selected = catalog.find((c) => c.name === cityName);
  const effectiveBbox = bbox || selected?.aoi_bbox || null;
  const bboxKey = effectiveBbox ? effectiveBbox.join(',') : '';

  // Prefill from an Agent Chat link
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (!initial || appliedInitial.current) return;
    if (initial.bbox) setBbox(initial.bbox);
    if (initial.epsg) setEpsg(initial.epsg);
    if (initial.city && !catalog.length) return; // wait for the catalog to match the name
    appliedInitial.current = true;
    if (initial.city) {
      const match = catalog.find((c) => c.name.toLowerCase() === initial.city.toLowerCase());
      if (match) setCityName(match.name);
      else setCustomName(initial.city);
    }
  }, [initial, catalog]);

  // Find the open Tanager scenes over the area and pre-select the suggested ones
  useEffect(() => {
    if (!bboxKey) {
      setScenes([]);
      setSuggested(null);
      return undefined;
    }
    let cancelled = false;
    setScenesLoading(true);
    const timer = setTimeout(() => {
      searchScenes(bboxKey.split(',').map(Number))
        .then((d) => {
          if (cancelled) return;
          setScenes(d.scenes);
          setSuggested(d.suggested);
          if (!userPickedScenes.current) {
            setT2(d.suggested.t2 || '');
            setT1(d.suggested.t1 || '');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setScenes([]);
            setSuggested(null);
          }
        })
        .finally(() => !cancelled && setScenesLoading(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bboxKey]);

  const pick = (which, id) => {
    userPickedScenes.current = true;
    if (which === 't2') {
      setT2(id);
      if (t1 === id) setT1('');
    } else {
      setT1(t1 === id ? '' : id);
    }
  };

  const footprints = useMemo(() => scenes.filter((s) => s.bbox), [scenes]);

  const submit = (e) => {
    e.preventDefault();
    setError('');
    const name = selected?.name || customName.trim();
    if (!name) return setError('Choose a city or enter a name for a new one.');
    if (!effectiveBbox) return setError('Select a city or draw an area of interest on the map.');
    if (!t2.trim()) return setError('Enter a Tanager scene ID to analyze.');
    onSubmit({
      city_name: name,
      aoi_bbox: effectiveBbox,
      scene_t1_id: t1.trim() || null,
      scene_t2_id: t2.trim(),
      block_size: blockSize,
      min_valid_pct: minValid,
      include_sentinel: sentinel,
      include_landsat: landsat,
      epsg: epsg || selected?.epsg || null,
    });
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card className="space-y-4">
          <h3 className="text-sm font-semibold">City &amp; area</h3>
          <div>
            <Label>City</Label>
            <select
              className={field}
              value={cityName}
              onChange={(e) => {
                setCityName(e.target.value);
                setBbox(null);
                setEpsg(null);
                userPickedScenes.current = false;
              }}
            >
              <option value="">Other (draw the area on the map)</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}, {c.country}
                  {c.scene_count ? ` (${c.scene_count} satellite scene${c.scene_count > 1 ? 's' : ''})` : ''}
                </option>
              ))}
            </select>
          </div>
          {!selected && (
            <div>
              <Label>City name</Label>
              <input className={field} value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Jeddah" />
            </div>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            Area: {effectiveBbox ? effectiveBbox.join(', ') : 'not set'}
          </p>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Satellite size={15} className="text-accent" /> Satellite scenes (Planet Tanager, open data)
            </h3>
            {scenesLoading && <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />}
          </div>

          {suggested?.note && <p className="text-xs text-[var(--text-muted)]">{suggested.note}</p>}

          {scenes.length > 0 && (
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {scenes.slice(0, 8).map((s) => (
                <li key={s.scene_id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2">
                  {s.thumbnail_url && (
                    <img src={s.thumbnail_url} alt="" className="w-16 h-10 rounded object-cover shrink-0" loading="lazy" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{s.acquired} · {s.scene_id}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {Math.round(s.scene_share * 100)}% of the scene lies inside this area
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => pick('t2', s.scene_id)}
                    className={`px-2 py-1 rounded text-[11px] font-medium border ${
                      t2 === s.scene_id ? 'bg-accent text-white border-accent' : 'border-[var(--border)] hover:border-accent/50'
                    }`}
                  >
                    Analyze
                  </button>
                  <button
                    type="button"
                    onClick={() => pick('t1', s.scene_id)}
                    className={`px-2 py-1 rounded text-[11px] font-medium border ${
                      t1 === s.scene_id ? 'bg-accent text-white border-accent' : 'border-[var(--border)] hover:border-accent/50'
                    }`}
                  >
                    As earlier
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Scene to analyze</Label>
              <input className={field} value={t2} onChange={(e) => { userPickedScenes.current = true; setT2(e.target.value); }} placeholder="20250515_080954_16_4001" />
              <SceneThumb sceneId={t2} />
            </div>
            <div>
              <Label>Earlier scene (optional)</Label>
              <input className={field} value={t1} onChange={(e) => { userPickedScenes.current = true; setT1(e.target.value); }} placeholder="adds the change map" />
              <SceneThumb sceneId={t1} />
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            An earlier scene of the same place adds the urban-expansion change layer. It must overlap the first scene.
          </p>
        </Card>

        <Card className="space-y-4">
          <h3 className="text-sm font-semibold">Options</h3>
          <div>
            <Label>Block size: {blockSize} m</Label>
            <input
              type="range" min="150" max="1500" step="30" value={blockSize}
              onChange={(e) => setBlockSize(Number(e.target.value))}
              className="w-full accent-[#8100D1]"
            />
            <p className="text-xs text-[var(--text-muted)]">Tanager pixels are about 30 m, so blocks are whole pixel multiples.</p>
          </div>
          <div>
            <Label>Minimum usable pixels: {minValid}%</Label>
            <input
              type="range" min="5" max="95" step="5" value={minValid}
              onChange={(e) => setMinValid(Number(e.target.value))}
              className="w-full accent-[#8100D1]"
            />
            <p className="text-xs text-[var(--text-muted)]">
              The run stops if less of the scene is cloud-free and valid than this. The Riyadh scene is about 19% usable.
            </p>
          </div>
          <Toggle checked={landsat} onChange={setLandsat} label="Use Landsat surface temperature" hint="Measured temperature. Without it a modelled surface is used." />
          <Toggle checked={sentinel} onChange={setSentinel} label="Include Sentinel-2 vegetation trend" hint="Adds about 1.5 minutes" />
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <h3 className="text-sm font-semibold mb-1">Area of interest</h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Click two opposite corners to draw your own rectangle. Orange outlines are satellite scene footprints.
          </p>
          <div className="rounded-xl overflow-hidden border border-[var(--border)]" style={{ height: 380 }}>
            <MapContainer center={[25.2, 46.7]} zoom={9} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
              <DrawLayer onBox={(b) => { userPickedScenes.current = false; setBbox(b); }} />
              <Recenter bbox={effectiveBbox} />
              {footprints.map((s) => (
                <Rectangle
                  key={s.scene_id}
                  bounds={toBounds(s.bbox)}
                  pathOptions={{
                    color: '#f59e0b', weight: s.scene_id === t2 ? 3 : 1.5, dashArray: '5 4', fillOpacity: s.scene_id === t2 ? 0.15 : 0.04,
                  }}
                />
              ))}
              {effectiveBbox && (
                <Rectangle bounds={toBounds(effectiveBbox)} pathOptions={{ color: '#8100D1', weight: 2, fillOpacity: 0.1 }} />
              )}
            </MapContainer>
          </div>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg dark:bg-red-900/20 dark:border-red-900 dark:text-red-300">
            {error}
          </div>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          <Play size={16} /> {busy ? 'Starting…' : 'Run analysis'}
        </Button>
      </div>
    </form>
  );
}
