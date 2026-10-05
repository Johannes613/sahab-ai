import axios from 'axios';
import { MOCK_CITIES, MOCK_RUNS, buildBlocks, buildSummary } from '../mock/mockData';

const BASE = process.env.REACT_APP_API_URL;
export const USE_MOCK = !BASE;

const api = axios.create({ baseURL: BASE ? `${BASE}/api/v1` : undefined });

// ---- mock helpers ---------------------------------------------------------
const delay = (v, ms = 250) => new Promise((res) => setTimeout(() => res(v), ms));
const mockStarts = {};
const mockPayloads = {};
const PIPELINE_MS = 14000;

export const PIPELINE_STAGES = [
  'Loading data',
  'Masking',
  'Computing indices',
  'Training classifier',
  'Computing temperature',
  'Scoring risk',
  'Generating outputs',
];

function mockBlocksFor(runId) {
  const payload = mockPayloads[runId];
  const run = MOCK_RUNS.find((r) => r.run_id === runId);
  const city = MOCK_CITIES.find((c) => c.id === run?.city_id);
  return buildBlocks(runId, payload?.aoi_bbox || city?.aoi_bbox);
}

function applyFilters(blocks, p = {}) {
  let out = blocks;
  if (p.action) out = out.filter((b) => b.action === p.action);
  if (p.min_risk) out = out.filter((b) => b.risk_score >= Number(p.min_risk));
  if (p.min_population) out = out.filter((b) => b.population >= Number(p.min_population));
  if (p.sort === 'risk_desc') out = [...out].sort((a, b) => b.risk_score - a.risk_score);
  if (p.limit) out = out.slice(0, Number(p.limit));
  return out;
}

// ---- API ------------------------------------------------------------------
export const runAnalysis = (payload) => {
  if (USE_MOCK) {
    const runId = `run-${Date.now()}`;
    mockStarts[runId] = Date.now();
    mockPayloads[runId] = payload;
    MOCK_RUNS.unshift({
      run_id: runId,
      city_id: payload.city_id || 'custom',
      city_name: payload.city_name,
      date: new Date().toISOString().slice(0, 10),
      scene_dates: [payload.scene_t1_id || 'T1', payload.scene_t2_id || 'T2'],
      mean_lst: 44.6,
      high_risk_count: 0,
      top_action_count: 0,
    });
    return delay({ run_id: runId, status: 'queued' });
  }
  return api.post('/analysis/run', payload).then((r) => r.data);
};

export const getStatus = (runId) => {
  if (USE_MOCK) {
    const start = mockStarts[runId];
    if (!start) return delay({ run_id: runId, status: 'complete', progress_pct: 100, message: 'Done' }, 50);
    const pct = Math.min(100, Math.round(((Date.now() - start) / PIPELINE_MS) * 100));
    const done = pct >= 100;
    return delay(
      {
        run_id: runId,
        status: done ? 'complete' : 'running',
        progress_pct: pct,
        message: done
          ? 'Done'
          : PIPELINE_STAGES[Math.min(PIPELINE_STAGES.length - 1, Math.floor((pct / 100) * PIPELINE_STAGES.length))],
      },
      50
    );
  }
  return api.get(`/analysis/status/${runId}`).then((r) => r.data);
};

export const cancelRun = (runId) => {
  if (USE_MOCK) {
    delete mockStarts[runId];
    return delay({ ok: true }, 50);
  }
  return api.delete(`/analysis/${runId}`).then((r) => r.data);
};

export const getSummary = (runId) => {
  if (USE_MOCK) return delay(buildSummary(mockBlocksFor(runId)));
  return api.get(`/results/${runId}/summary`).then((r) => r.data);
};

export const getBlocks = (runId, params) => {
  if (USE_MOCK) return delay(applyFilters(mockBlocksFor(runId), params), 120);
  return api.get(`/results/${runId}/blocks`, { params }).then((r) => r.data);
};

export const getGeoJSON = (runId) => {
  if (USE_MOCK) {
    const blocks = mockBlocksFor(runId);
    return delay({
      type: 'FeatureCollection',
      features: blocks.map((b) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
        properties: b,
      })),
    });
  }
  return api.get(`/results/${runId}/geojson`).then((r) => r.data);
};

export const getImages = (runId) => {
  if (USE_MOCK) return delay({ material_map: null, temperature_map: null, risk_map: null, change_map: null });
  return api.get(`/results/${runId}/images`).then((r) => r.data);
};

export const getMapUrl = (runId) => {
  if (USE_MOCK) return delay({ url: null });
  return api.get(`/results/${runId}/map_url`).then((r) => r.data);
};

export const getCities = () => {
  if (USE_MOCK) return delay([...MOCK_CITIES]);
  return api.get('/cities').then((r) => r.data);
};

export const addCity = (payload) => {
  if (USE_MOCK) {
    const city = { id: payload.name.toLowerCase().replace(/\s+/g, '-'), last_run: null, ...payload };
    MOCK_CITIES.push(city);
    return delay(city);
  }
  return api.post('/cities', payload).then((r) => r.data);
};

export const getCityHistory = (cityId) => {
  if (USE_MOCK) return delay(MOCK_RUNS.filter((r) => r.city_id === cityId));
  return api.get(`/cities/${cityId}/history`).then((r) => r.data);
};

export const getAllRuns = () => {
  if (USE_MOCK) return delay([...MOCK_RUNS]);
  return api.get('/cities').then(async (r) => {
    const hist = await Promise.all(r.data.map((c) => getCityHistory(c.id)));
    return hist.flat();
  });
};
