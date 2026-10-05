import numpy as np
import os, json, threading
from datetime import datetime, timedelta
from scipy import stats
from scipy.ndimage import zoom

from pipeline.loader import fetch_scene_metadata, download_sr
from pipeline.masks import build_valid_mask
from pipeline.indices import get_wavelengths, pick_band, load_bands, compute_indices, BAND_TARGETS
from pipeline.classifier import seed_labels, train_ensemble, CLASS_NAMES, FEAT_NAMES
from pipeline.temperature import synthetic_lst, fetch_landsat_lst
from pipeline.risk import block_agg, norm01, compute_risk
from pipeline.interventions import (material_fraction, fit_gpr_cooling,
                                    assign_actions, ACTION_LABELS)
from storage.runs import update_run, get_run
from models.schemas import BlockRecord

RESULTS_DIR = os.getenv('RESULTS_DIR', './results')

# Runs beyond this limit wait in the 'queued' state until a slot frees up.
_slots = threading.BoundedSemaphore(int(os.getenv('MAX_CONCURRENT_RUNS', '2')))


def _landsat_window(t2_date: str) -> str:
    """Twelve months of Landsat up to the T2 acquisition date."""
    try:
        end = datetime.fromisoformat(t2_date[:10])
        return f'{(end - timedelta(days=365)).date()}/{end.date()}'
    except Exception:
        return '2024-05-01/2025-05-31'


def _bboxes_overlap(a: list[float], b: list[float]) -> bool:
    """[west, south, east, north] boxes."""
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def _check_footprints(item_T1: dict, item_T2: dict, request: dict):
    """Stop early, with a clear message, when the scenes cannot be compared."""
    b1, b2, city = item_T1['bbox'], item_T2['bbox'], request['bbox']
    if not _bboxes_overlap(b1, b2):
        raise ValueError(
            'T1 and T2 cover different places, so change detection is meaningless. '
            f"T1 footprint (lon/lat): {[round(v, 2) for v in b1]}, "
            f"T2 footprint: {[round(v, 2) for v in b2]}. Choose two scenes of the same area.")
    if not _bboxes_overlap(b1, city) or not _bboxes_overlap(b2, city):
        raise ValueError(
            f"The scenes do not overlap the requested area for {request['city_name']} "
            f'(bbox {city}). T1: {[round(v, 2) for v in b1]}, T2: {[round(v, 2) for v in b2]}.')


def run_pipeline(run_id: str, request: dict):
    def step(pct: int, msg: str):
        update_run(run_id, progress_pct=pct, current_step=msg, status='running')

    with _slots:
        _run_pipeline(run_id, request, step)


def _run_pipeline(run_id: str, request: dict, step):
    try:
        step(2, 'Loading scene metadata')
        item_T1 = fetch_scene_metadata(request['scene_t1_id'])
        item_T2 = fetch_scene_metadata(request['scene_t2_id'])
        _check_footprints(item_T1, item_T2, request)

        step(8, 'Downloading T1 surface reflectance')
        path_T1, sr_key_T1 = download_sr(item_T1, 'T1')

        step(18, 'Downloading T2 surface reflectance')
        path_T2, sr_key_T2 = download_sr(item_T2, 'T2')

        step(25, 'Building quality masks')
        mask_T1, stats_T1 = build_valid_mask(path_T1)
        mask_T2, stats_T2 = build_valid_mask(path_T2)
        if stats_T2['valid_pct'] < request.get('min_valid_pct', 0.30) * 100:
            raise RuntimeError(
                f"Only {stats_T2['valid_pct']:.1f}% of the T2 scene is valid "
                f"(minimum {request.get('min_valid_pct', 0.30) * 100:.0f}%). Choose a clearer scene.")

        step(28, 'Selecting spectral bands')
        wavelengths_nm = get_wavelengths(item_T1, sr_key_T1)
        band_idx = {name: pick_band(wavelengths_nm, target)
                    for name, target in BAND_TARGETS.items()}

        step(32, 'Computing spectral indices')
        bands_T1 = load_bands(path_T1, mask_T1, band_idx)
        bands_T2 = load_bands(path_T2, mask_T2, band_idx)
        idx_T1 = compute_indices(bands_T1)
        idx_T2 = compute_indices(bands_T2)

        step(38, 'Training ensemble classifier')
        feats_T2 = np.stack([idx_T2[k] for k in FEAT_NAMES], axis=-1)
        seed_T2 = seed_labels(idx_T2)
        material_map, clf_metrics, scaler, le, ensemble = train_ensemble(
            feats_T2, seed_T2, mask_T2)

        step(50, 'Computing change detection')
        rows = min(idx_T1['NDVI'].shape[0], idx_T2['NDVI'].shape[0])
        cols = min(idx_T1['NDVI'].shape[1], idx_T2['NDVI'].shape[1])
        d_NDVI = idx_T2['NDVI'][:rows, :cols] - idx_T1['NDVI'][:rows, :cols]
        d_NDBI = idx_T2['NDBI'][:rows, :cols] - idx_T1['NDBI'][:rows, :cols]
        UEI = d_NDBI - d_NDVI
        combined_mask = mask_T1[:rows, :cols] & mask_T2[:rows, :cols]
        UEI[~combined_mask] = np.nan

        step(56, 'Retrieving land surface temperature')
        epsg = request.get('epsg', 32640)
        mat_d = material_map[:rows, :cols]
        ST_C = synthetic_lst(idx_T2['NDBI'][:rows, :cols],
                             idx_T2['NDVI'][:rows, :cols],
                             mat_d, combined_mask)
        landsat_used = False
        if request.get('include_landsat', True):
            try:
                import pystac_client, planetary_computer
                catalog = pystac_client.Client.open(
                    'https://planetarycomputer.microsoft.com/api/stac/v1',
                    modifier=planetary_computer.sign_inplace)
                t2_date = item_T2['properties'].get('datetime', '')[:10]
                lst_real, ok = fetch_landsat_lst(
                    item_T2['bbox'], epsg, catalog, date_range=_landsat_window(t2_date))
                if ok and lst_real is not None and np.isfinite(lst_real).any():
                    # Landsat (30 m, scene footprint) -> Tanager grid
                    filled = np.where(np.isfinite(lst_real), lst_real, np.nanmean(lst_real))
                    ST_C = zoom(filled, (rows / filled.shape[0], cols / filled.shape[1]), order=1)
                    ST_C = ST_C[:rows, :cols].astype('float32')
                    if ST_C.shape != (rows, cols):  # zoom can be off by one pixel
                        pad = np.full((rows, cols), float(np.nanmean(ST_C)), dtype='float32')
                        pad[:ST_C.shape[0], :ST_C.shape[1]] = ST_C
                        ST_C = pad
                    ST_C[~combined_mask] = np.nan
                    landsat_used = True
            except Exception:
                pass

        step(64, 'Computing block-level heat risk')
        block_size = request.get('block_size', 50)
        ST_use = ST_C
        risk_score, blk_temp, blk_ndvi, heat_hazard, green_deficit = compute_risk(
            ST_use, idx_T2['NDVI'][:rows, :cols], block_size)
        nR, nC = risk_score.shape
        if nR == 0 or nC == 0:
            raise RuntimeError(f'Block size {block_size}px is larger than the scene ({rows}x{cols}px).')

        step(70, 'Computing material fractions')
        mat_crop = material_map[:rows, :cols].astype('float32')
        veg_frac = material_fraction(mat_crop, 1, block_size) + \
                   material_fraction(mat_crop, 2, block_size)
        asp_frac = material_fraction(mat_crop, 3, block_size)
        ref_frac = material_fraction(mat_crop, 5, block_size)

        step(75, 'Fitting Gaussian Process cooling model')
        c_tree, s_tree, c_roof, s_roof = fit_gpr_cooling(
            blk_temp, blk_ndvi, veg_frac, asp_frac)

        step(80, 'Assigning interventions and ranking blocks')
        actions, cooling_map, cooling_ci = assign_actions(
            risk_score, veg_frac, asp_frac, c_tree, s_tree, c_roof, s_roof)

        step(84, 'Computing validation correlations')
        flat_ndbi = idx_T2['NDBI'][:rows, :cols].flatten()
        flat_ndvi = idx_T2['NDVI'][:rows, :cols].flatten()
        flat_temp = ST_use.flatten()
        valid_corr = np.isfinite(flat_ndbi) & np.isfinite(flat_temp) & np.isfinite(flat_ndvi)
        r_ndbi, r_ndvi = 0.0, 0.0
        if valid_corr.sum() > 50:
            r_ndbi, _ = stats.pearsonr(flat_ndbi[valid_corr], flat_temp[valid_corr])
            r_ndvi, _ = stats.pearsonr(flat_ndvi[valid_corr], flat_temp[valid_corr])

        step(88, 'Building priority block list')
        ib = item_T1['bbox']
        lon_step = (ib[2] - ib[0]) / nC
        lat_step = (ib[3] - ib[1]) / nR
        records = []
        for i in range(nR):
            for j in range(nC):
                rs = risk_score[i, j]
                act = int(actions[i, j])
                if np.isnan(rs) or rs < 0.30 or act == 0:
                    continue
                vf = float(veg_frac[i, j]) if i < veg_frac.shape[0] and j < veg_frac.shape[1] else 0
                af = float(asp_frac[i, j]) if i < asp_frac.shape[0] and j < asp_frac.shape[1] else 0
                mat_cls = int(mat_crop[i * block_size, j * block_size]) \
                    if i * block_size < mat_crop.shape[0] and j * block_size < mat_crop.shape[1] else -1
                dom_mat = CLASS_NAMES[mat_cls] if 0 <= mat_cls < len(CLASS_NAMES) else 'Unknown'
                records.append({
                    'rank': 0,
                    'city': request['city_name'],
                    'lat': round(float(ib[1] + (nR - i - 0.5) * lat_step), 5),
                    'lon': round(float(ib[0] + (j + 0.5) * lon_step), 5),
                    'risk_score': round(float(rs), 3),
                    'action': ACTION_LABELS[act],
                    'est_cooling_c': round(float(cooling_map[i, j]), 2),
                    'cooling_ci_c': round(float(cooling_ci[i, j]), 2),
                    'veg_fraction': round(float(vf), 3),
                    'asphalt_fraction': round(float(af), 3),
                    'dominant_material': dom_mat,
                })
        records.sort(key=lambda r: r['risk_score'], reverse=True)
        for rank, rec in enumerate(records, 1):
            rec['rank'] = rank

        action_counts = {}
        for rec in records:
            action_counts[rec['action']] = action_counts.get(rec['action'], 0) + 1

        step(93, 'Building summary')
        top20_cooling = sum(r['est_cooling_c'] for r in records[:20])
        summary = {
            'run_id': run_id,
            'city_name': request['city_name'],
            'total_blocks': int(nR * nC),
            'high_risk_count': int(np.nansum(risk_score > 0.7)),
            'mean_lst': round(float(np.nanmean(ST_use)), 2),
            'max_lst': round(float(np.nanmax(ST_use)), 2),
            'total_cooling_top20': round(float(top20_cooling), 2),
            'scene_t1_date': item_T1['properties'].get('datetime', '')[:10],
            'scene_t2_date': item_T2['properties'].get('datetime', '')[:10],
            't2_valid_pct': round(float(stats_T2['valid_pct']), 1),
            't2_cloud_pct': round(float(stats_T2['cloud_pct']), 1),
            'landsat_used': bool(landsat_used),
            'sentinel2_used': False,
            'action_counts': {k: int(v) for k, v in action_counts.items()},
            'ndbi_lst_correlation': round(float(r_ndbi), 3),
            'ndvi_lst_correlation': round(float(r_ndvi), 3),
            'created_at': datetime.utcnow().isoformat(),
            # data provenance, so the UI can say what is measured and what is modelled
            'lst_source': 'landsat' if landsat_used else 'modelled from spectral indices (fallback)',
            'population_source': 'placeholder surface (WorldPop not yet integrated)',
            **clf_metrics,
        }

        step(97, 'Saving results')
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
                   blocks_path=blocks_path)

    except Exception as exc:
        import traceback
        update_run(run_id,
                   status='failed',
                   current_step='Failed',
                   error=str(exc) + '\n' + traceback.format_exc())
