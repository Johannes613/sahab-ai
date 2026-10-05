import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Rectangle, useMapEvents, useMap } from 'react-leaflet';
import { ExternalLink, Play } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { addCity } from '../../api/sahab';

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
    if (bbox) map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [20, 20] });
  }, [bbox, map]);
  return null;
}

export default function RunForm({ cities, onSubmit, busy, onCityAdded }) {
  const [cityId, setCityId] = useState('');
  const [newName, setNewName] = useState('');
  const [bbox, setBbox] = useState(null);
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  const [blockSize, setBlockSize] = useState(200);
  const [minValid, setMinValid] = useState(70);
  const [sentinel, setSentinel] = useState(true);
  const [landsat, setLandsat] = useState(true);
  const [error, setError] = useState('');

  const selected = cities.find((c) => c.id === cityId);
  const effectiveBbox = bbox || selected?.aoi_bbox || null;

  const tile = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const name = selected?.name || newName.trim();
    if (!name) return setError('Choose a saved city or enter a name for a new one.');
    if (!effectiveBbox) return setError('Select a city or draw an area of interest on the map.');
    if (!t1.trim() || !t2.trim()) return setError('Enter both Tanager scene IDs (T1 and T2).');

    let id = selected?.id;
    if (!selected) {
      try {
        const city = await addCity({ name, country: '', aoi_bbox: effectiveBbox });
        id = city.id;
        onCityAdded?.();
      } catch (err) {
        return setError('Could not save the new city.');
      }
    }
    onSubmit({
      city_id: id,
      city_name: name,
      aoi_bbox: effectiveBbox,
      scene_t1_id: t1.trim(),
      scene_t2_id: t2.trim(),
      block_size: blockSize,
      min_valid_pct: minValid,
      include_sentinel: sentinel,
      include_landsat: landsat,
    });
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card className="space-y-4">
          <h3 className="text-sm font-semibold">City &amp; area</h3>
          <div>
            <Label>Saved city</Label>
            <select className={field} value={cityId} onChange={(e) => { setCityId(e.target.value); setBbox(null); }}>
              <option value="">New city (draw on map)</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.country ? `, ${c.country}` : ''}
                </option>
              ))}
            </select>
          </div>
          {!selected && (
            <div>
              <Label>New city name</Label>
              <input className={field} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Doha" />
            </div>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            AOI: {effectiveBbox ? effectiveBbox.join(', ') : 'not set'}
          </p>
        </Card>

        <Card className="space-y-4">
          <h3 className="text-sm font-semibold">Tanager scenes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Scene ID (T1, earlier)</Label>
              <input className={field} value={t1} onChange={(e) => setT1(e.target.value)} placeholder="tanager_..." />
            </div>
            <div>
              <Label>Scene ID (T2, later)</Label>
              <input className={field} value={t2} onChange={(e) => setT2(e.target.value)} placeholder="tanager_..." />
            </div>
          </div>
          <a
            href="https://www.planet.com/data/stac/browser/tanager-core-imagery/catalog.json"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Find scene IDs in Planet's STAC browser <ExternalLink size={12} />
          </a>
        </Card>

        <Card className="space-y-4">
          <h3 className="text-sm font-semibold">Options</h3>
          <div>
            <Label>Block size: {blockSize} m</Label>
            <input
              type="range" min="100" max="500" step="50" value={blockSize}
              onChange={(e) => setBlockSize(Number(e.target.value))}
              className="w-full accent-[#8100D1]"
            />
          </div>
          <div>
            <Label>Minimum valid pixels: {minValid}%</Label>
            <input
              type="range" min="10" max="100" step="5" value={minValid}
              onChange={(e) => setMinValid(Number(e.target.value))}
              className="w-full accent-[#8100D1]"
            />
            <p className="text-xs text-[var(--text-muted)]">Analysis is skipped if cloud-free coverage is below this.</p>
          </div>
          <Toggle checked={sentinel} onChange={setSentinel} label="Include Sentinel-2 trend" hint="Adds 1 to 2 minutes" />
          <Toggle checked={landsat} onChange={setLandsat} label="Include Landsat temperature" hint="Adds 1 to 2 minutes" />
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <h3 className="text-sm font-semibold mb-1">Area of interest</h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {selected ? 'Showing the saved area. Click two corners to override it.' : 'Click two opposite corners to draw a rectangle.'}
          </p>
          <div className="rounded-xl overflow-hidden border border-[var(--border)]" style={{ height: 380 }}>
            <MapContainer center={[25.2, 55.27]} zoom={9} style={{ height: '100%', width: '100%' }}>
              <TileLayer url={tile} attribution="&copy; OpenStreetMap contributors" />
              <DrawLayer onBox={setBbox} />
              <Recenter bbox={effectiveBbox} />
              {effectiveBbox && (
                <Rectangle
                  bounds={[[effectiveBbox[1], effectiveBbox[0]], [effectiveBbox[3], effectiveBbox[2]]]}
                  pathOptions={{ color: '#8100D1', weight: 2, fillOpacity: 0.12 }}
                />
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
