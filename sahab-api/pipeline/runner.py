import json
import logging
import math
import os
import threading
import traceback
from datetime import datetime, timedelta

import numpy as np
from scipy import stats
from scipy.ndimage import zoom

from pipeline.loader import fetch_scene_metadata, download_sr
from pipeline.masks import build_valid_mask
from pipeline.indices import get_wavelengths, pick_band, load_bands, compute_indices, BAND_TARGETS
from pipeline.classifier import (seed_labels, train_ensemble, classify_with_saved_model,
                                 CLASS_NAMES, FEAT_NAMES)
from pipeline.model_store import load_classifier, load_cooling
from pipeline.temperature import synthetic_lst, fetch_landsat_lst
from pipeline.risk import block_agg, compute_risk
from pipeline.interventions import (material_fraction, fit_gpr_cooling, fit_scene_gpr, gpr_cooling_maps,
                                    assign_actions, ACTION_LABELS)
from pipeline.exporter import export_layers, export_html_map, block_to_pixels
from pipeline.sentinel import fetch_trend
from storage.runs import update_run, is_cancelled, RunCancelled

log = logging.getLogger('sahab.runner')

RESULTS_DIR = os.getenv('RESULTS_DIR', './results')
ACTION_KEYS = {0: 'none', 1: 'tree_planting', 2: 'cool_roofs', 3: 'both'}
ACTION_THRESHOLD = 0.30

# Runs beyond this limit wait in the 'queued' state until a slot frees up.
_slots = threading.BoundedSemaphore(int(os.getenv('MAX_CONCURRENT_RUNS', '2')))


def utm_epsg(bbox: list[float]) -> int:
    lon, lat = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    zone = int(math.floor((lon + 180) / 6)) + 1
    return (32600 if lat >= 0 else 32700) + zone


def _bboxes_overlap(a: list[float], b: list[float]) -> bool:
    """[west, south, east, north] boxes."""
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def _check_footprints(item_T1: dict | None, item_T2: dict, request: dict):
    """Stop early, with a clear message, when the scenes cannot be compared."""
    b2, city = item_T2['bbox'], request['bbox']
    if item_T1 is not None:
        b1 = item_T1['bbox']
        if not _bboxes_overlap(b1, b2):
            raise ValueError(
                'T1 and T2 cover different places, so change detection is meaningless. '
                f"T1 footprint (lon/lat): {[round(v, 2) for v in b1]}, "
                f"T2 footprint: {[round(v, 2) for v in b2]}. Choose two scenes of the same area.")
    if not _bboxes_overlap(b2, city):
        raise ValueError(
            f"The scene does not overlap the requested area for {request['city_name']} "
            f"(bbox {city}). Scene footprint: {[round(v, 2) for v in b2]}.")


def _landsat_window(t2_date: str) -> str:
    """Twelve months of Landsat up to the T2 acquisition date."""
    try:
        end = datetime.fromisoformat(t2_date[:10])
        return f'{(end - timedelta(days=365)).date()}/{end.date()}'
    except Exception:
        return '2024-05-01/2025-05-31'


def _pct(x: float) -> str:
    return f'{round(x * 100)}%'


def _rationale(action_key: str, rec: dict) -> str:
    m = rec['materials']
    hot = f"{rec['lst_delta']:+.1f} °C versus the scene average"
    built = m['asphalt'] + m['concrete'] + m['reflective_roof']
    if action_key == 'tree_planting':
        return (f"Vegetation covers only {_pct(m['vegetation'])} of this block and it runs {hot}, "
                'so added trees give the largest modelled surface cooling.')
    if action_key == 'cool_roofs':
        return (f"Built surfaces cover {_pct(built)} of this block and it runs {hot}, "
                'so reflective roofs and pavement give the largest modelled surface cooling.')
    if action_key == 'both':
        return (f"Low vegetation ({_pct(m['vegetation'])}) and {_pct(built)} built surface on a block "
                f"that runs {hot}; combining trees and reflective surfaces is estimated to cool it most.")
    return (f"Risk is below the action threshold ({ACTION_THRESHOLD}), so no intervention is "
            'recommended in this cycle. Keep monitoring.')


def run_pipeline(run_id: str, request: dict):
    def step(pct: int, msg: str):
        if is_cancelled(run_id):
            raise RunCancelled()
        update_run(run_id, progress_pct=pct, current_step=msg, status='running')

    with _slots:
        _run_pipeline(run_id, request, step)


def _run_pipeline(run_id: str, request: dict, step):
    try:
        step(2, 'Loading scene metadata')
        t1_id = request.get('scene_t1_id') or None
        item_T2 = fetch_scene_metadata(request['scene_t2_id'])
        item_T1 = fetch_scene_metadata(t1_id) if t1_id else None
        _check_footprints(item_T1, item_T2, request)
        has_t1 = item_T1 is not None

        if has_t1:
            step(8, 'Downloading T1 surface reflectance')
            path_T1, sr_key_T1 = download_sr(item_T1, 'T1')
        step(18, 'Downloading T2 surface reflectance')
        path_T2, sr_key_T2 = download_sr(item_T2, 'T2')

        step(25, 'Building quality masks')
        mask_T2, stats_T2 = build_valid_mask(path_T2)
        min_valid = request.get('min_valid_pct', 0.30) * 100
        if stats_T2['valid_pct'] < min_valid:
            log.warning(
                f"Only {stats_T2['valid_pct']:.1f}% of the scene is usable "
                f"({stats_T2['cloud_pct']:.0f}% cloud, {stats_T2['nodata_pct']:.0f}% no-data), "
                f'below the requested {min_valid:.0f}% minimum. Proceeding anyway with available pixels.')
        mask_T1 = build_valid_mask(path_T1)[0] if has_t1 else None

        step(28, 'Selecting spectral bands')
        wavelengths_nm = get_wavelengths(item_T2, sr_key_T2)
        band_idx = {name: pick_band(wavelengths_nm, target) for name, target in BAND_TARGETS.items()}

        step(32, 'Computing spectral indices')
        idx_T2 = compute_indices(load_bands(path_T2, mask_T2, band_idx))
        idx_T1 = compute_indices(load_bands(path_T1, mask_T1, band_idx)) if has_t1 else None

        step(38, 'Classifying surface materials')
        feats_T2 = np.stack([idx_T2[k] for k in FEAT_NAMES], axis=-1)
        bundle = load_classifier()
        if bundle is not None:
            material_map, clf_metrics = classify_with_saved_model(feats_T2, mask_T2, bundle)
        else:
            log.warning('saved classifier unavailable; training on this scene')
            material_map, clf_metrics, *_ = train_ensemble(feats_T2, seed_labels(idx_T2), mask_T2)
            clf_metrics['model_source'] = 'trained on this scene (saved model unavailable)'
        H, W = material_map.shape

        step(50, 'Computing change detection' if has_t1 else 'Skipping change detection (one scene)')
        rows, cols = H, W
        UEI = None
        if has_t1:
            rows = min(idx_T1['NDVI'].shape[0], idx_T2['NDVI'].shape[0])
            cols = min(idx_T1['NDVI'].shape[1], idx_T2['NDVI'].shape[1])
            d_NDVI = idx_T2['NDVI'][:rows, :cols] - idx_T1['NDVI'][:rows, :cols]
            d_NDBI = idx_T2['NDBI'][:rows, :cols] - idx_T1['NDBI'][:rows, :cols]
            UEI = d_NDBI - d_NDVI
            UEI[~(mask_T1[:rows, :cols] & mask_T2[:rows, :cols])] = np.nan
        combined_mask = mask_T2[:rows, :cols] if not has_t1 else (mask_T1[:rows, :cols] & mask_T2[:rows, :cols])

        scene_bbox = item_T2['bbox']
        epsg = request.get('epsg') or utm_epsg(scene_bbox)
        t2_date = item_T2['properties'].get('datetime', '')[:10]
        t1_date = item_T1['properties'].get('datetime', '')[:10] if has_t1 else ''

        # one catalog connection for Landsat and Sentinel-2
        catalog = None
        if request.get('include_landsat', True) or request.get('include_sentinel2', True):
            try:
                import pystac_client, planetary_computer
                catalog = pystac_client.Client.open(
                    'https://planetarycomputer.microsoft.com/api/stac/v1',
                    modifier=planetary_computer.sign_inplace)
            except Exception as exc:
                log.warning('Planetary Computer unavailable: %s', exc)

        step(56, 'Retrieving land surface temperature')
        mat_d = material_map[:rows, :cols]
        ST_C = synthetic_lst(idx_T2['NDBI'][:rows, :cols], idx_T2['NDVI'][:rows, :cols],
                             mat_d, combined_mask)
        landsat_used = False
        landsat_range = _landsat_window(t2_date).split('/')
        if request.get('include_landsat', True) and catalog is not None:
            lst_real, ok = fetch_landsat_lst(scene_bbox, epsg, catalog, date_range='/'.join(landsat_range))
            if ok and lst_real is not None and np.isfinite(lst_real).any():
                # Landsat (30 m, scene footprint) -> Tanager grid
                filled = np.where(np.isfinite(lst_real), lst_real, np.nanmean(lst_real))
                resampled = zoom(filled, (rows / filled.shape[0], cols / filled.shape[1]), order=1)
                ST_C = np.full((rows, cols), np.nan, dtype='float32')
                h, w = min(rows, resampled.shape[0]), min(cols, resampled.shape[1])
                ST_C[:h, :w] = resampled[:h, :w]
                ST_C[~combined_mask] = np.nan
                landsat_used = True
        lst_source = ('Landsat 8/9 thermal band (median of recent clear scenes)' if landsat_used
                      else 'modelled from spectral indices (Landsat unavailable)')

        # block size: metres -> pixels using the scene's real pixel size
        lat_mid = (scene_bbox[1] + scene_bbox[3]) / 2
        m_x = (scene_bbox[2] - scene_bbox[0]) * 111320 * math.cos(math.radians(lat_mid)) / W
        m_y = (scene_bbox[3] - scene_bbox[1]) * 110540 / H
        gsd_m = float((m_x + m_y) / 2)
        if request.get('block_size_m'):
            block_size = int(min(200, max(4, round(request['block_size_m'] / gsd_m))))
        else:
            block_size = int(request.get('block_size', 50))
        if rows // block_size == 0 or cols // block_size == 0:
            raise RuntimeError(f'Block size {block_size}px is larger than the scene ({rows}x{cols}px).')

        step(64, 'Aggregating materials per block')
        mat_crop = mat_d.astype('float32')
        frac = {cid: material_fraction(np.where(mat_crop >= 0, mat_crop, np.nan), cid, block_size)
                for cid in range(len(CLASS_NAMES))}
        veg_frac = frac[1] + frac[2]
        asp_frac = frac[3]
        built_frac = frac[3] + frac[4] + frac[5]

        step(70, 'Computing block-level heat risk')
        risk_score, blk_temp, blk_ndvi, heat_hazard, green_deficit, pop_exposure = compute_risk(
            ST_C, idx_T2['NDVI'][:rows, :cols], block_size, exposure_proxy=built_frac)
        nR, nC = risk_score.shape

        step(76, 'Estimating cooling with the Gaussian Process')
        # With real Landsat temperatures, fit the cooling model on this scene. The saved model
        # was trained in the notebook on a modelled temperature surface, so it is only used
        # when Landsat is unavailable.
        gpr, cooling_source = None, ''
        if landsat_used:
            gpr = fit_scene_gpr(blk_temp, blk_ndvi, veg_frac, asp_frac)
            cooling_source = 'Gaussian Process fitted on this scene (Landsat temperatures)'
        if gpr is None:
            cooling = load_cooling()
            if cooling is not None and cooling.get('gpr') is not None:
                gpr = cooling['gpr']
                cooling_source = 'saved Gaussian Process (notebook, modelled temperatures)'
        if gpr is not None:
            c_tree, s_tree, c_roof, s_roof = gpr_cooling_maps(gpr, blk_ndvi, veg_frac, asp_frac)
        else:
            c_tree, s_tree, c_roof, s_roof = fit_gpr_cooling(blk_temp, blk_ndvi, veg_frac, asp_frac)
            cooling_source = 'literature defaults (too few blocks to fit)'

        step(80, 'Assigning interventions and ranking blocks')
        actions, cooling_map, cooling_ci = assign_actions(
            risk_score, veg_frac, asp_frac, c_tree, s_tree, c_roof, s_roof)

        step(84, 'Computing validation correlations')
        flat_ndbi = idx_T2['NDBI'][:rows, :cols].flatten()
        flat_ndvi = idx_T2['NDVI'][:rows, :cols].flatten()
        flat_temp = ST_C.flatten()
        valid_corr = np.isfinite(flat_ndbi) & np.isfinite(flat_temp) & np.isfinite(flat_ndvi)
        r_ndbi, r_ndvi = 0.0, 0.0
        if valid_corr.sum() > 50:
            r_ndbi, _ = stats.pearsonr(flat_ndbi[valid_corr], flat_temp[valid_corr])
            r_ndvi, _ = stats.pearsonr(flat_ndvi[valid_corr], flat_temp[valid_corr])

        step(88, 'Building the block list')
        lon_per_px = (scene_bbox[2] - scene_bbox[0]) / W
        lat_per_px = (scene_bbox[3] - scene_bbox[1]) / H
        city_mean_temp = float(np.nanmean(blk_temp))
        area_m2 = int(round((block_size * gsd_m) ** 2))
        records = []
        for i in range(nR):
            for j in range(nC):
                rs = risk_score[i, j]
                if not np.isfinite(rs):
                    continue
                act = int(actions[i, j])
                ak = ACTION_KEYS[act]
                mats = {
                    'vegetation': float(veg_frac[i, j]) if np.isfinite(veg_frac[i, j]) else 0.0,
                    'asphalt': float(frac[3][i, j]) if np.isfinite(frac[3][i, j]) else 0.0,
                    'concrete': float(frac[4][i, j]) if np.isfinite(frac[4][i, j]) else 0.0,
                    'reflective_roof': float(frac[5][i, j]) if np.isfinite(frac[5][i, j]) else 0.0,
                    'bare_soil': float(frac[6][i, j]) if np.isfinite(frac[6][i, j]) else 0.0,
                }
                class_fracs = [float(frac[c][i, j]) if np.isfinite(frac[c][i, j]) else 0.0
                               for c in range(len(CLASS_NAMES))]
                dom = CLASS_NAMES[int(np.argmax(class_fracs))]
                rec = {
                    'rank': 0,
                    'id': f'{i}-{j}',
                    'city': request['city_name'],
                    'lat': round(float(scene_bbox[3] - (i + 0.5) * block_size * lat_per_px), 5),
                    'lon': round(float(scene_bbox[0] + (j + 0.5) * block_size * lon_per_px), 5),
                    'risk_score': round(float(rs), 3),
                    'action': ACTION_LABELS[act],
                    'action_key': ak,
                    'est_cooling_c': round(float(cooling_map[i, j]), 2),
                    'cooling_ci_c': round(float(cooling_ci[i, j]), 2),
                    'veg_fraction': round(mats['vegetation'], 3),
                    'asphalt_fraction': round(mats['asphalt'], 3),
                    'dominant_material': dom,
                    'materials': {k: round(v, 3) for k, v in mats.items()},
                    'population_exposure': round(float(pop_exposure[i, j]), 3),
                    'lst_c': round(float(blk_temp[i, j]), 2),
                    'lst_delta': round(float(blk_temp[i, j]) - city_mean_temp, 2),
                    'area_m2': area_m2,
                }
                rec['action_rationale'] = _rationale(ak, rec)
                records.append(rec)
        # most urgent first: risk, then the larger modelled cooling
        records.sort(key=lambda r: (r['risk_score'], r['est_cooling_c']), reverse=True)
        for rank, rec in enumerate(records, 1):
            rec['rank'] = rank
        if not records:
            raise RuntimeError('No usable blocks were produced (too little clear imagery for this block size).')

        top_action_counts = {k: 0 for k in ('tree_planting', 'cool_roofs', 'both', 'none')}
        cooling_total = {k: 0.0 for k in ('tree_planting', 'cool_roofs', 'both')}
        action_counts = {}
        for rec in records:
            top_action_counts[rec['action_key']] += 1
            if rec['action_key'] != 'none':
                cooling_total[rec['action_key']] += rec['est_cooling_c']
                action_counts[rec['action']] = action_counts.get(rec['action'], 0) + 1
        top20 = records[:20]
        risks = [r['risk_score'] for r in records]
        hist = np.histogram(risks, bins=10, range=(0, 1))[0].tolist()

        trend, sentinel_used = [], False
        if request.get('include_sentinel2', True) and catalog is not None:
            step(90, 'Computing the Sentinel-2 vegetation trend')
            end_year = int(t2_date[:4]) if t2_date else datetime.utcnow().year
            trend = fetch_trend(scene_bbox, epsg, catalog, end_year)
            sentinel_used = bool(trend)

        step(94, 'Rendering map layers')
        run_dir = os.path.join(RESULTS_DIR, 'files', run_id)
        risk_px = block_to_pixels(risk_score, block_size, (rows, cols))
        layers = export_layers(run_dir, mat_d, ST_C, risk_px, UEI)
        sources = {'tanager_t1': t1_date, 'tanager_t2': t2_date, 'lst_source': lst_source}
        export_html_map(os.path.join(run_dir, 'map.html'), request['city_name'], scene_bbox,
                        records, layers, sources)
        images = {k: f'files/{run_id}/{k}.png' for k in layers}

        step(97, 'Saving results')
        summary = {
            'run_id': run_id,
            'city_name': request['city_name'],
            'total_blocks': int(len(records)),
            'high_risk_count': int(sum(1 for r in risks if r > 0.7)),
            'mean_lst': round(float(np.nanmean(ST_C)), 2),
            'max_lst': round(float(np.nanmax(ST_C)), 2),
            'total_cooling_top20': round(float(sum(r['est_cooling_c'] for r in top20)), 2),
            'scene_t1_date': t1_date,
            'scene_t2_date': t2_date,
            't2_valid_pct': round(float(stats_T2['valid_pct']), 1),
            't2_cloud_pct': round(float(stats_T2['cloud_pct']), 1),
            'landsat_used': bool(landsat_used),
            'sentinel2_used': bool(sentinel_used),
            'action_counts': {k: int(v) for k, v in action_counts.items()},
            'ndbi_lst_correlation': round(float(r_ndbi), 3),
            'ndvi_lst_correlation': round(float(r_ndvi), 3),
            'created_at': datetime.utcnow().isoformat(),
            # extras used by the dashboard
            'top_action_counts': top_action_counts,
            'cooling_total_by_action': {k: round(v, 2) for k, v in cooling_total.items()},
            'mean_lst_delta_top20': round(float(np.mean([r['lst_delta'] for r in top20])), 2),
            'city_mean_risk': round(float(np.mean(risks)), 3),
            'city_mean_vegetation': round(float(np.mean([r['veg_fraction'] for r in records])), 3),
            'city_mean_exposure': round(float(np.mean([r['population_exposure'] for r in records])), 3),
            'risk_histogram': hist,
            'trend': trend,
            'data_sources': {
                'tanager_t1': t1_date, 'tanager_t2': t2_date,
                'landsat_range': landsat_range if landsat_used else None,
                'sentinel_years': [trend[0]['year'], trend[-1]['year']] if trend else None,
                'lst_source': lst_source,
            },
            'bbox': [float(v) for v in scene_bbox],
            'has_change_layer': UEI is not None,
            'block_size_px': block_size,
            'block_size_m': int(round(block_size * gsd_m)),
            'pixel_size_m': round(gsd_m, 1),
            'epsg': int(epsg),
            # data provenance, so the UI can say what is measured and what is modelled
            'lst_source': lst_source,
            'population_source': 'built-up share of each block from the classified imagery '
                                 '(proxy; WorldPop not integrated)',
            'cooling_source': cooling_source,
            **clf_metrics,
        }
        os.makedirs(RESULTS_DIR, exist_ok=True)
        blocks_path = os.path.join(RESULTS_DIR, f'{run_id}_blocks.json')
        with open(blocks_path, 'w') as f:
            json.dump(records, f)

        update_run(run_id,
                   status='complete',
                   progress_pct=100,
                   current_step='Done',
                   completed_at=datetime.utcnow().isoformat(),
                   summary=summary,
                   blocks_path=blocks_path,
                   images=images,
                   map_html_path=f'files/{run_id}/map.html')

    except RunCancelled:
        log.info('run %s cancelled', run_id)
    except Exception as exc:
        update_run(run_id,
                   status='failed',
                   current_step='Failed',
                   completed_at=datetime.utcnow().isoformat(),
                   error=str(exc) + '\n' + traceback.format_exc())
