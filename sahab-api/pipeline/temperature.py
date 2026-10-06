import numpy as np


def synthetic_lst(ndbi: np.ndarray, ndvi: np.ndarray,
                  material_map: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Fallback only: a modelled temperature surface used when Landsat is unavailable.
    It is derived from the spectral indices, so it is NOT an independent measurement."""
    rng = np.random.default_rng(42)
    ST_C = (
        55.0
        + 12.0 * np.clip(ndbi, -0.3, 0.6)
        - 8.0 * np.clip(ndvi, 0.0, 0.8)
        + 3.0 * (material_map == 3).astype('float32')
        - 2.0 * (material_map == 5).astype('float32')
        + rng.normal(0, 1.2, ndbi.shape)
    )
    ST_C[~mask] = np.nan
    return ST_C


def fetch_landsat_lst(bbox: list[float], epsg: int, catalog=None,
                      date_range: str = '2024-05-01/2025-05-31'
                      ) -> tuple[np.ndarray | None, bool]:
    """Median Landsat 8/9 surface temperature (deg C) over bbox [W, S, E, N] in EPSG:4326.

    The Planetary Computer asset is `lwir11` (the Collection 2 surface-temperature band;
    earlier code asked for `ST_B10`, which does not exist there). stackstac applies the
    scale and offset from the STAC metadata, so values arrive in Kelvin; raw digital
    numbers are also handled in case that ever changes.
    """
    if catalog is None:
        return None, False
    try:
        import stackstac
        search = catalog.search(
            collections=['landsat-c2-l2'],
            bbox=bbox,
            datetime=date_range,
            query={'eo:cloud_cover': {'lt': 20},
                   'platform': {'in': ['landsat-8', 'landsat-9']}})
        ls_items = list(search.items())
        if not ls_items:
            return None, False
        ls_stack = stackstac.stack(ls_items[:12], assets=['lwir11'],
                                   bounds_latlon=bbox, resolution=30, epsg=epsg)
        comp = ls_stack.median(dim='time').compute()
        vals = np.squeeze(comp.values).astype('float32')
        if np.nanmedian(vals) > 1000:   # raw digital numbers
            vals = vals * 0.00341802 + 149.0
        ST_C = vals - 273.15
        ST_C[(ST_C < 0) | (ST_C > 90)] = np.nan
        return ST_C, bool(np.isfinite(ST_C).any())
    except Exception as exc:
        import logging
        logging.getLogger('sahab.temperature').warning('Landsat retrieval failed: %s', exc)
        return None, False
