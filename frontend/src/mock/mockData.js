// Deterministic mock data so the UI works before the backend is deployed.

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
  { id: 'sharjah', name: 'Sharjah', country: 'UAE', aoi_bbox: [55.35, 25.28, 55.5, 25.4], last_run: null },
];

const MATERIALS = ['Dark asphalt', 'Concrete', 'Light roof', 'Dark roof', 'Bare soil', 'Vegetation'];

export function buildBlocks(runId, bbox = [55.1, 25.05, 55.4, 25.3], count = 180) {
  const seed = Array.from(runId).reduce((a, c) => a + c.charCodeAt(0), 7);
  const r = rng(seed);
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const lon = bbox[0] + r() * (bbox[2] - bbox[0]);
    const lat = bbox[1] + r() * (bbox[3] - bbox[1]);
    const veg = +(r() * 0.5).toFixed(2);
    const asphalt = +(r() * 0.45).toFixed(2);
    const darkRoof = +(r() * 0.4).toFixed(2);
    const pop = Math.round(300 + r() * 4500);
    const hazard = 0.3 + r() * 0.7;
    const risk = +Math.min(
      1,
      hazard * (0.45 + (1 - veg) * 0.35) * (0.6 + (pop / 4800) * 0.4) * 1.25
    ).toFixed(2);

    let action = 'none';
    if (risk >= 0.35) {
      if (veg < 0.15 && darkRoof > 0.2) action = 'both';
      else if (darkRoof > asphalt && darkRoof > 0.2) action = 'cool_roofs';
      else if (veg < 0.25) action = 'tree_planting';
    }
    const cooling =
      action === 'none' ? 0
      : action === 'both' ? +(2 + r() * 2).toFixed(1)
      : action === 'cool_roofs' ? +(1.2 + r() * 1.8).toFixed(1)
      : +(1 + r() * 1.5).toFixed(1);

    const material =
      darkRoof > asphalt && darkRoof > 0.2 ? 'Dark roof'
      : asphalt > 0.25 ? 'Dark asphalt'
      : veg > 0.3 ? 'Vegetation'
      : MATERIALS[Math.floor(r() * MATERIALS.length)];

    blocks.push({
      id: `b${i + 1}`,
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
      risk_score: risk,
      action,
      est_cooling_C: cooling,
      dominant_material: material,
      veg_fraction: veg,
      asphalt_fraction: asphalt,
      population: pop,
      area_m2: 40000,
    });
  }
  blocks.sort(
    (a, b) => b.risk_score * (1 + b.est_cooling_C) - a.risk_score * (1 + a.est_cooling_C)
  );
  return blocks.map((b, i) => ({ ...b, rank: i + 1 }));
}

export function buildSummary(blocks) {
  const counts = { tree_planting: 0, cool_roofs: 0, both: 0, none: 0 };
  blocks.forEach((b) => { counts[b.action] += 1; });
  const top20 = blocks.slice(0, 20);
  const coolingBy = (a) =>
    +blocks.filter((b) => b.action === a).reduce((s, b) => s + b.est_cooling_C, 0).toFixed(1);
  return {
    total_blocks: blocks.length,
    high_risk_count: blocks.filter((b) => b.risk_score > 0.7).length,
    mean_lst: 44.6,
    total_cooling_top20: +top20.reduce((s, b) => s + b.est_cooling_C, 0).toFixed(1),
    top_action_counts: counts,
    cooling_by_action: [
      { action: 'Tree planting', cooling: coolingBy('tree_planting') },
      { action: 'Cool roofs', cooling: coolingBy('cool_roofs') },
      { action: 'Both', cooling: coolingBy('both') },
    ],
    trend: [
      { year: 2019, ndvi: 0.19, ndbi: 0.31 },
      { year: 2020, ndvi: 0.18, ndbi: 0.33 },
      { year: 2021, ndvi: 0.18, ndbi: 0.34 },
      { year: 2022, ndvi: 0.17, ndbi: 0.36 },
      { year: 2023, ndvi: 0.16, ndbi: 0.37 },
      { year: 2024, ndvi: 0.16, ndbi: 0.39 },
    ],
  };
}

export const MOCK_RUNS = [
  { run_id: 'demo-dubai-2026-10', city_id: 'dubai', city_name: 'Dubai', date: '2026-10-02', scene_dates: ['2025-07-14', '2026-07-09'], mean_lst: 44.6, high_risk_count: 31, top_action_count: 74 },
  { run_id: 'demo-dubai-2025-09', city_id: 'dubai', city_name: 'Dubai', date: '2025-09-18', scene_dates: ['2024-07-10', '2025-07-12'], mean_lst: 43.9, high_risk_count: 24, top_action_count: 61 },
  { run_id: 'demo-abudhabi-2026-09', city_id: 'abudhabi', city_name: 'Abu Dhabi', date: '2026-09-28', scene_dates: ['2025-07-20', '2026-07-18'], mean_lst: 45.2, high_risk_count: 28, top_action_count: 69 },
];
