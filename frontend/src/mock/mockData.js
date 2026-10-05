// Deterministic mock data so the UI works before the backend is deployed.
// Field names mirror what the FastAPI backend is expected to return.

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export const MOCK_CITIES = [
  { id: 'dubai', name: 'Dubai', country: 'UAE', aoi_bbox: [55.1, 25.05, 55.4, 25.3], last_run: '2026-10-02' },
  { id: 'abudhabi', name: 'Abu Dhabi', country: 'UAE', aoi_bbox: [54.3, 24.4, 54.6, 24.6], last_run: '2026-09-28' },
  { id: 'sharjah', name: 'Sharjah', country: 'UAE', aoi_bbox: [55.35, 25.28, 55.5, 25.4], last_run: '2026-10-01' },
];

export const MATERIAL_LABELS = {
  vegetation: 'Vegetation',
  asphalt: 'Asphalt',
  concrete: 'Concrete',
  reflective_roof: 'Reflective roof',
  bare_soil: 'Bare soil',
};

function rationale(action, b) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const hot = `${b.lst_delta >= 0 ? '+' : ''}${b.lst_delta.toFixed(1)} °C above baseline`;
  switch (action) {
    case 'tree_planting':
      return `Only ${pct(b.materials.vegetation)} vegetation on a block ${hot} with high population exposure, so added shade trees give the largest surface cooling.`;
    case 'cool_roofs':
      return `concrete and roof surfaces cover ${pct(b.materials.concrete)} of the block and it runs ${hot}, so reflective roof coatings give the biggest surface cooling per dollar.`;
    case 'both':
      return `Low vegetation (${pct(b.materials.vegetation)}) and ${pct(b.materials.concrete)} concrete and roof cover on a block ${hot}; combining trees and cool roofs is estimated to cool it most.`;
    default:
      return 'Risk is below the action threshold, so no intervention is recommended in this cycle. Keep monitoring.';
  }
}

export function buildBlocks(runId, bbox = [55.1, 25.05, 55.4, 25.3], count = 180, riskScale = 1) {
  const seed = Array.from(runId).reduce((a, c) => a + c.charCodeAt(0), 7);
  const r = rng(seed);
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const lon = bbox[0] + r() * (bbox[2] - bbox[0]);
    const lat = bbox[1] + r() * (bbox[3] - bbox[1]);

    const darkRoof = r() * 0.4;
    const raw = {
      vegetation: r() * 0.5,
      asphalt: r() * 0.45,
      concrete: 0.1 + r() * 0.3 + darkRoof * 0.4,
      reflective_roof: r() * 0.2 * (1 - darkRoof),
      bare_soil: r() * 0.2,
    };
    const total = Object.values(raw).reduce((s, v) => s + v, 0);
    const materials = {};
    Object.keys(raw).forEach((k) => { materials[k] = +(raw[k] / total).toFixed(3); });

    const pop = Math.round(300 + r() * 4500);
    const populationExposure = +Math.min(1, pop / 4800).toFixed(2);
    const hazard = 0.3 + r() * 0.7;
    const lstDelta = +(((hazard - 0.3) / 0.7) * 12 - 3).toFixed(1);
    const risk = +Math.min(
      1,
      hazard * (0.45 + (1 - materials.vegetation) * 0.35) * (0.6 + populationExposure * 0.4) * 1.25 * riskScale
    ).toFixed(2);

    let action = 'none';
    if (risk >= 0.35) {
      if (materials.vegetation < 0.12 && darkRoof > 0.2) action = 'both';
      else if (darkRoof > 0.2 && darkRoof * 1.5 > materials.asphalt) action = 'cool_roofs';
      else if (materials.vegetation < 0.25) action = 'tree_planting';
    }
    const cooling =
      action === 'none' ? 0
      : action === 'both' ? +(2 + r() * 2).toFixed(1)
      : action === 'cool_roofs' ? +(1.2 + r() * 1.8).toFixed(1)
      : +(1 + r() * 1.5).toFixed(1);
    // Gaussian Process predictive std, shown as a 95% half-width
    const coolingCi = cooling ? +(0.3 + cooling * 0.15 + r() * 0.25).toFixed(1) : 0;

    const dominantKey = Object.keys(materials).reduce((a, k) => (materials[k] > materials[a] ? k : a));

    const block = {
      id: `b${i + 1}`,
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
      risk_score: risk,
      population: pop,
      population_exposure: populationExposure,
      lst_delta: lstDelta,
      action,
      est_cooling_C: cooling,
      est_cooling_ci: coolingCi,
      materials,
      dominant_material: MATERIAL_LABELS[dominantKey],
      veg_fraction: materials.vegetation,
      asphalt_fraction: materials.asphalt,
      area_m2: 40000,
    };
    block.action_rationale = rationale(action, block);
    blocks.push(block);
  }
  blocks.sort(
    (a, b) => b.risk_score * (1 + b.est_cooling_C) - a.risk_score * (1 + a.est_cooling_C)
  );
  return blocks.map((b, i) => ({ ...b, rank: i + 1 }));
}

const avg = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
const yearOf = (d) => (/^\d{4}/.test(d || '') ? Number(d.slice(0, 4)) : null);

export function buildSummary(blocks, run) {
  const keys = ['tree_planting', 'cool_roofs', 'both', 'none'];
  const counts = {};
  const coolingTotals = {};
  keys.forEach((k) => {
    const bs = blocks.filter((b) => b.action === k);
    counts[k] = bs.length;
    coolingTotals[k] = +bs.reduce((s, b) => s + b.est_cooling_C, 0).toFixed(1);
  });
  const top20 = blocks.slice(0, 20);
  const [t1, t2] = run?.scene_dates || ['', ''];
  const lsYear = yearOf(t2) || 2026;
  return {
    total_blocks: blocks.length,
    high_risk_count: blocks.filter((b) => b.risk_score > 0.7).length,
    mean_lst: run?.mean_lst ?? 44.6,
    mean_lst_delta_top20: +avg(top20.map((b) => b.lst_delta)).toFixed(1),
    city_mean_risk: +avg(blocks.map((b) => b.risk_score)).toFixed(3),
    total_cooling_top20: +top20.reduce((s, b) => s + b.est_cooling_C, 0).toFixed(1),
    top_action_counts: counts,
    cooling_total_by_action: coolingTotals,
    cooling_by_action: [
      { action: 'Tree planting', cooling: coolingTotals.tree_planting },
      { action: 'Cool roofs', cooling: coolingTotals.cool_roofs },
      { action: 'Both', cooling: coolingTotals.both },
    ],
    data_sources: {
      tanager_t1: t1,
      tanager_t2: t2,
      landsat_range: [`${lsYear}-06-01`, `${lsYear}-08-31`],
      sentinel_years: [2019, 2026],
    },
    trend: [
      { year: 2019, ndvi: 0.19, ndbi: 0.31 },
      { year: 2020, ndvi: 0.18, ndbi: 0.33 },
      { year: 2021, ndvi: 0.18, ndbi: 0.34 },
      { year: 2022, ndvi: 0.17, ndbi: 0.36 },
      { year: 2023, ndvi: 0.16, ndbi: 0.37 },
      { year: 2024, ndvi: 0.16, ndbi: 0.39 },
      { year: 2025, ndvi: 0.17, ndbi: 0.38 },
      { year: 2026, ndvi: 0.18, ndbi: 0.37 },
    ],
  };
}

// A run record as listed on the History page, derived from its own blocks so
// the numbers always agree with the dashboard.
export function makeRunRecord(def, bbox) {
  const blocks = buildBlocks(def.run_id, bbox, 180, def.risk_scale || 1);
  const s = buildSummary(blocks, def);
  return {
    ...def,
    high_risk_count: s.high_risk_count,
    top_action_count: s.total_blocks - s.top_action_counts.none,
    mean_lst_delta_top20: s.mean_lst_delta_top20,
  };
}

const RUN_DEFS = [
  { run_id: 'demo-dubai-2026-10', city_id: 'dubai', city_name: 'Dubai', date: '2026-10-02', scene_dates: ['2025-07-14', '2026-07-09'], mean_lst: 44.6, risk_scale: 1 },
  { run_id: 'demo-dubai-2025-09', city_id: 'dubai', city_name: 'Dubai', date: '2025-09-18', scene_dates: ['2024-07-10', '2025-07-12'], mean_lst: 45.1, risk_scale: 1.22 },
  { run_id: 'demo-abudhabi-2026-09', city_id: 'abudhabi', city_name: 'Abu Dhabi', date: '2026-09-28', scene_dates: ['2025-07-20', '2026-07-18'], mean_lst: 45.2, risk_scale: 1 },
  { run_id: 'demo-abudhabi-2025-09', city_id: 'abudhabi', city_name: 'Abu Dhabi', date: '2025-09-24', scene_dates: ['2024-07-22', '2025-07-19'], mean_lst: 45.8, risk_scale: 1.2 },
  { run_id: 'demo-sharjah-2026-10', city_id: 'sharjah', city_name: 'Sharjah', date: '2026-10-01', scene_dates: ['2025-07-16', '2026-07-12'], mean_lst: 44.1, risk_scale: 1 },
  { run_id: 'demo-sharjah-2025-10', city_id: 'sharjah', city_name: 'Sharjah', date: '2025-10-03', scene_dates: ['2024-07-14', '2025-07-15'], mean_lst: 44.7, risk_scale: 1.18 },
];

export const MOCK_RUNS = RUN_DEFS.map((d) =>
  makeRunRecord(d, MOCK_CITIES.find((c) => c.id === d.city_id).aoi_bbox)
);
