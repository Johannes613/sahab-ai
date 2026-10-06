import numpy as np


def block_agg(arr: np.ndarray, bsz: int) -> np.ndarray:
    H, W = arr.shape
    nR, nC = H // bsz, W // bsz
    out = np.full((nR, nC), np.nan)
    for i in range(nR):
        for j in range(nC):
            patch = arr[i * bsz:(i + 1) * bsz, j * bsz:(j + 1) * bsz]
            v = patch[np.isfinite(patch)]
            if len(v):
                out[i, j] = float(np.nanmean(v))
    return out


def norm01(arr: np.ndarray) -> np.ndarray:
    mn, mx = np.nanmin(arr), np.nanmax(arr)
    return np.zeros_like(arr) if mx == mn else (arr - mn) / (mx - mn)


def compute_risk(ST_use: np.ndarray, ndvi_T2: np.ndarray,
                 block_size: int, exposure_proxy: np.ndarray | None = None) -> tuple[np.ndarray, ...]:
    blk_temp = block_agg(ST_use, block_size)
    blk_ndvi = block_agg(ndvi_T2, block_size)

    nR, nC = blk_temp.shape
    if exposure_proxy is not None:
        # Built-up share of each block, from the classified imagery. A stand-in for population
        # density until WorldPop rasters are integrated.
        blk_pop = np.array(exposure_proxy, dtype=float)
    else:
        # PLACEHOLDER population surface (not real data). Replace with WorldPop.
        rng = np.random.default_rng(7)
        blk_pop = (
            3000.0
            + 2500.0 * np.sin(np.linspace(0, np.pi, nR))[:, None]
            + 1500.0 * np.cos(np.linspace(0, np.pi, nC))[None, :]
            + rng.normal(0, 400, (nR, nC))
        )
        blk_pop = np.clip(blk_pop, 200, 9000)
    blk_pop[np.isnan(blk_temp)] = np.nan

    heat_hazard = norm01(blk_temp)
    green_deficit = norm01(1.0 - blk_ndvi)
    pop_exposure = norm01(blk_pop)
    risk_score = norm01(heat_hazard * green_deficit * pop_exposure)

    return risk_score, blk_temp, blk_ndvi, heat_hazard, green_deficit, pop_exposure
