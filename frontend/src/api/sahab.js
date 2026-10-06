// All calls go to the Sahab AI FastAPI backend. There is no mock data: every number the
// dashboard shows comes from a real run. The adapters below translate the backend's field
// names into the shapes the UI components use.
import axios from 'axios';

// Unset: the local dev backend. Set to '' for a build served from the same address as the API.
export const API_BASE = process.env.REACT_APP_API_URL ?? 'http://localhost:8000';
const api = axios.create({ baseURL: `${API_BASE}/api/v1` });

const ACTION_LABELS = {
  tree_planting: 'Tree planting',
  cool_roofs: 'Cool roofs',
  both: 'Both',
};

// ---- adapters -------------------------------------------------------------
function adaptBlock(b) {
  return {
    id: b.id,
    rank: b.rank,
    lat: b.lat,
    lon: b.lon,
    risk_score: b.risk_score,
    action: b.action_key,
    est_cooling_C: b.est_cooling_c,
    est_cooling_ci: b.cooling_ci_c,
    dominant_material: b.dominant_material,
    veg_fraction: b.veg_fraction,
    asphalt_fraction: b.asphalt_fraction,
    materials: b.materials,
    population_exposure: b.population_exposure,
    lst_delta: b.lst_delta,
    area_m2: b.area_m2,
    action_rationale: b.action_rationale,
  };
}

function adaptSummary(s) {
  const totals = s.cooling_total_by_action || {};
  return {
    ...s,
    cooling_by_action: Object.keys(ACTION_LABELS).map((k) => ({
      action: ACTION_LABELS[k],
      cooling: totals[k] || 0,
    })),
    trend: s.trend || [],
  };
}

function adaptRun(r) {
  return {
    run_id: r.run_id,
    city_id: r.city_name,
    city_name: r.city_name,
    date: (r.created_at || '').slice(0, 10),
    scene_dates: [r.scene_t1_date || 'no earlier scene', r.scene_t2_date || ''],
    mean_lst: r.mean_lst,
    high_risk_count: r.high_risk_count,
    top_action_count: r.top_action_count,
    total_blocks: r.total_blocks,
    mean_lst_delta_top20: r.mean_lst_delta_top20,
    status: r.status,
  };
}

// ---- analysis -------------------------------------------------------------
export const runAnalysis = (p) =>
  api
    .post('/analysis/run', {
      city_name: p.city_name,
      bbox: p.aoi_bbox,
      scene_t1_id: p.scene_t1_id || null,
      scene_t2_id: p.scene_t2_id,
      block_size_m: p.block_size,
      min_valid_pct: p.min_valid_pct / 100,
      include_sentinel2: p.include_sentinel,
      include_landsat: p.include_landsat,
      epsg: p.epsg || null,
    })
    .then((r) => ({ run_id: r.data.run_id, status: r.data.status }));

export const getStatus = (runId) =>
  api.get(`/analysis/status/${runId}`).then(({ data: d }) => ({
    run_id: d.run_id,
    status: d.status,
    progress_pct: d.progress_pct,
    message:
      d.status === 'failed' || d.status === 'cancelled'
        ? (d.error || d.current_step || '').split('\n')[0]
        : d.current_step,
  }));

export const cancelRun = (runId) => api.delete(`/analysis/${runId}`).then((r) => r.data);

// ---- results --------------------------------------------------------------
export const getSummary = (runId) =>
  api.get(`/results/${runId}/summary`).then((r) => adaptSummary(r.data));

export const getBlocks = (runId, params = {}) => {
  const q = { limit: params.limit || 50 };
  if (params.action) q.action = params.action;
  if (params.min_risk) q.min_risk = params.min_risk;
  if (params.min_exposure) q.min_exposure = params.min_exposure;
  return api.get(`/results/${runId}/blocks`, { params: q }).then((r) => r.data.blocks.map(adaptBlock));
};

export const getImages = (runId) => api.get(`/results/${runId}/images`).then((r) => r.data);
export const getMapUrl = (runId) => api.get(`/results/${runId}/map_url`).then((r) => r.data);

// ---- cities and history ---------------------------------------------------
export const getCities = () => api.get('/cities').then((r) => r.data);
export const getCityCatalog = () => api.get('/cities/catalog').then((r) => r.data);

export const getCityHistory = (cityName) =>
  api
    .get(`/cities/${encodeURIComponent(cityName)}/history`)
    .then((r) => r.data.filter((x) => x.status === 'complete').map(adaptRun));

export const getAllRuns = () =>
  api.get('/runs', { params: { status: 'complete' } }).then((r) => r.data.map(adaptRun));

// ---- satellite scenes -----------------------------------------------------
export const getSceneInfo = (sceneId) =>
  api.get(`/scenes/${encodeURIComponent(sceneId)}`).then((r) => r.data);

export const searchScenes = (bbox) =>
  api.get('/scenes', { params: { bbox: bbox.join(',') } }).then((r) => r.data);
