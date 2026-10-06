"""Sentinel-2 yearly NDVI / NDBI trend over the scene footprint (Microsoft Planetary Computer)."""
import logging

import numpy as np

log = logging.getLogger('sahab.sentinel')


def _baseline(item) -> float:
    try:
        return float(item.properties.get('s2:processing_baseline', '0'))
    except (TypeError, ValueError):
        return 0.0


def fetch_trend(bbox: list[float], epsg: int, catalog, end_year: int, n_years: int = 6,
                max_items_per_year: int = 5, resolution: int = 120) -> list[dict]:
    """Returns [{year, ndvi, ndbi}, ...] (years with no usable scene are skipped).

    Uses a coarse resolution and a handful of scenes per year, since this is a regional
    trend rather than a per-pixel product. Any failure for a year just skips that year.
    """
    import stackstac

    # a central window keeps the download small; the trend is a scene-wide mean anyway
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    hw = min(0.08, (bbox[2] - bbox[0]) / 2)
    hh = min(0.08, (bbox[3] - bbox[1]) / 2)
    window = [cx - hw, cy - hh, cx + hw, cy + hh]

    out = []
    eps = 1e-6
    for year in range(end_year - n_years + 1, end_year + 1):
        try:
            search = catalog.search(
                collections=['sentinel-2-l2a'], bbox=window,
                datetime=f'{year}-01-01/{year}-12-31',
                query={'eo:cloud_cover': {'lt': 10}}, max_items=40)
            items = sorted(search.items(), key=lambda i: i.properties.get('eo:cloud_cover', 100))
            items = items[:max_items_per_year]
            if not items:
                continue
            stack = stackstac.stack(items, assets=['B04', 'B08', 'B11'], bounds_latlon=window,
                                    resolution=resolution, epsg=epsg, dtype='float64',
                                    fill_value=np.nan, rescale=False)
            # processing baseline 04.00 (2022 onward) adds +1000 to the digital numbers
            offsets = np.array([1000.0 if _baseline(i) >= 4.0 else 0.0 for i in items],
                               dtype='float32')[:, None, None, None]
            dn = stack.values - offsets
            comp = np.nanmedian(dn, axis=0)
            bands = list(stack.band.values)
            red = comp[bands.index('B04')] / 10000.0
            nir = comp[bands.index('B08')] / 10000.0
            swir = comp[bands.index('B11')] / 10000.0
            ndvi = (nir - red) / (nir + red + eps)
            ndbi = (swir - nir) / (swir + nir + eps)
            if np.isfinite(ndvi).any():
                out.append({'year': year,
                            'ndvi': round(float(np.nanmean(ndvi)), 4),
                            'ndbi': round(float(np.nanmean(ndbi)), 4)})
        except Exception as exc:
            log.warning('Sentinel-2 %s skipped: %s', year, exc)
            continue
    return out
