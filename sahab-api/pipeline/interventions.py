import numpy as np
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, WhiteKernel

ACTION_LABELS = {
    0: 'No action (low risk)',
    1: 'Tree planting',
    2: 'Cool roofs',
    3: 'Tree planting + Cool roofs',
}


def material_fraction(mat_map: np.ndarray, class_id: int, bsz: int) -> np.ndarray:
    H, W = mat_map.shape
    nR, nC = H // bsz, W // bsz
    out = np.zeros((nR, nC))
    for i in range(nR):
        for j in range(nC):
            patch = mat_map[i * bsz:(i + 1) * bsz, j * bsz:(j + 1) * bsz]
            v = patch[np.isfinite(patch)]
            out[i, j] = np.nan if not len(v) else float(np.mean(v == class_id))
    return out


def fit_gpr_cooling(blk_temp: np.ndarray, blk_ndvi: np.ndarray,
                    veg_frac: np.ndarray, asp_frac: np.ndarray) -> tuple[float, float, float, float]:
    ft = blk_temp.flatten()
    fn = blk_ndvi.flatten()
    fv = veg_frac.flatten()[:len(ft)]
    fa = asp_frac.flatten()[:len(ft)]
    ok = np.isfinite(ft) & np.isfinite(fn) & np.isfinite(fv) & np.isfinite(fa)

    if ok.sum() >= 6:
        X_gp = np.column_stack([fn[ok], fv[ok], fa[ok]])
        y_gp = ft[ok]
        kernel = 1.0 * RBF(length_scale=1.0) + WhiteKernel(noise_level=1.0)
        gpr = GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=5,
                                       normalize_y=True, random_state=42)
        gpr.fit(X_gp, y_gp)
        X_tree = np.column_stack([fn[ok] + 0.10, fv[ok] + 0.10, fa[ok]])
        X_roof = np.column_stack([fn[ok], fv[ok], fa[ok] - 0.10])
        pred_base, _ = gpr.predict(X_gp, return_std=True)
        pred_tree, s_tree = gpr.predict(X_tree, return_std=True)
        pred_roof, s_roof = gpr.predict(X_roof, return_std=True)
        c_tree = float(np.mean(np.clip(pred_base - pred_tree, 0, 10)))
        c_roof = float(np.mean(np.clip(pred_base - pred_roof, 0, 10)))
        return c_tree, float(np.mean(s_tree)), c_roof, float(np.mean(s_roof))
    return 1.8, 0.5, 1.2, 0.4


def fit_scene_gpr(blk_temp: np.ndarray, blk_ndvi: np.ndarray,
                  veg_frac: np.ndarray, asp_frac: np.ndarray):
    """Fit a Gaussian Process of block temperature on [NDVI, vegetation, asphalt] for this
    scene. Returns the fitted model, or None if there are too few blocks."""
    shape = blk_temp.shape
    ft, fn = blk_temp.flatten(), blk_ndvi.flatten()
    fv = veg_frac[:shape[0], :shape[1]].flatten()
    fa = asp_frac[:shape[0], :shape[1]].flatten()
    ok = np.isfinite(ft) & np.isfinite(fn) & np.isfinite(fv) & np.isfinite(fa)
    if ok.sum() < 30:
        return None
    X, y = np.column_stack([fn[ok], fv[ok], fa[ok]]), ft[ok]
    if len(y) > 600:  # a GP is O(n^3); a random subset is plenty for a 3-feature smooth fit
        sel = np.random.default_rng(42).choice(len(y), 600, replace=False)
        X, y = X[sel], y[sel]
    kernel = 1.0 * RBF(length_scale=1.0) + WhiteKernel(noise_level=1.0)
    gpr = GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=3,
                                   normalize_y=True, random_state=42)
    gpr.fit(X, y)
    return gpr


def _at(v, i, j):
    return float(v[i, j]) if isinstance(v, np.ndarray) else float(v)


def _noise_variance(gpr) -> float:
    """Observation-noise variance of a fitted GP (the WhiteKernel term, in temperature units)."""
    from sklearn.gaussian_process.kernels import WhiteKernel
    stack, nv = [gpr.kernel_], 0.0
    while stack:
        k = stack.pop()
        if isinstance(k, WhiteKernel):
            nv += float(k.noise_level)
        for attr in ('k1', 'k2'):
            if hasattr(k, attr):
                stack.append(getattr(k, attr))
    return nv * float(getattr(gpr, '_y_train_std', 1.0)) ** 2


def gpr_cooling_maps(gpr, blk_ndvi: np.ndarray, veg_frac: np.ndarray, asp_frac: np.ndarray):
    """Per-block cooling from a Gaussian Process (inference only, no refit).

    Scenarios as in the notebook: tree planting = +0.10 NDVI and +0.10 vegetation fraction;
    cool roofs = -0.10 asphalt/pavement fraction (cannot go below zero). Cooling is the
    predicted drop in surface temperature (clipped to 0..10 C).

    The uncertainty is that of the *difference* between the scenario and the baseline
    prediction at the same block, with the observation noise removed. The notebook used the
    predictive standard deviation of a single new observation, which is dominated by
    temperature noise and says little about the size of the cooling effect.

    Returns (c_tree, s_tree, c_roof, s_roof) as (nR, nC) arrays, where s_* is one standard
    deviation of the cooling estimate; blocks with missing inputs get 0.
    """
    shape = blk_ndvi.shape
    fv = veg_frac[:shape[0], :shape[1]]
    fa = asp_frac[:shape[0], :shape[1]]
    ok = np.isfinite(blk_ndvi) & np.isfinite(fv) & np.isfinite(fa)
    c_tree = np.zeros(shape, dtype='float32')
    s_tree = np.zeros(shape, dtype='float32')
    c_roof = np.zeros(shape, dtype='float32')
    s_roof = np.zeros(shape, dtype='float32')
    if not ok.any():
        return c_tree, s_tree, c_roof, s_roof

    noise = _noise_variance(gpr)
    for i, j in zip(*np.nonzero(ok)):
        n, v, a = float(blk_ndvi[i, j]), float(fv[i, j]), float(fa[i, j])
        pts = np.array([[n, v, a],                           # baseline
                        [n + 0.10, v + 0.10, a],             # tree planting
                        [n, v, max(a - 0.10, 0.0)]])         # cool roofs
        mean, cov = gpr.predict(pts, return_cov=True)
        latent = cov - noise * np.eye(3)                     # remove the white-noise diagonal
        for k, (c_map, s_map) in ((1, (c_tree, s_tree)), (2, (c_roof, s_roof))):
            c_map[i, j] = np.clip(mean[0] - mean[k], 0, 10)
            var_diff = latent[0, 0] + latent[k, k] - 2 * latent[0, k]
            s_map[i, j] = np.sqrt(max(var_diff, 0.0))
    return c_tree, s_tree, c_roof, s_roof


def assign_actions(risk_score: np.ndarray, veg_frac: np.ndarray,
                   asp_frac: np.ndarray, c_tree: float, s_tree: float,
                   c_roof: float, s_roof: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    nR, nC = risk_score.shape
    actions = np.zeros((nR, nC), dtype=np.int8)
    cooling_map = np.zeros((nR, nC), dtype='float32')
    cooling_ci = np.zeros((nR, nC), dtype='float32')

    for i in range(nR):
        for j in range(nC):
            rs = float(risk_score[i, j]) if np.isfinite(risk_score[i, j]) else 0
            vf = float(veg_frac[i, j]) if i < veg_frac.shape[0] and j < veg_frac.shape[1] and np.isfinite(veg_frac[i, j]) else 0.2
            af = float(asp_frac[i, j]) if i < asp_frac.shape[0] and j < asp_frac.shape[1] and np.isfinite(asp_frac[i, j]) else 0.0
            if rs < 0.3:
                actions[i, j] = 0
            else:
                ct, st = _at(c_tree, i, j), _at(s_tree, i, j)
                cr, sr = _at(c_roof, i, j), _at(s_roof, i, j)
                if vf > 0.50 and af < 0.10:
                    actions[i, j] = 2
                    cooling_map[i, j], cooling_ci[i, j] = cr, sr * 2
                elif af > 0.25 and vf < 0.15:
                    actions[i, j] = 2
                    cooling_map[i, j], cooling_ci[i, j] = cr, sr * 2
                elif vf < 0.15:
                    actions[i, j] = 1
                    cooling_map[i, j], cooling_ci[i, j] = ct, st * 2
                else:
                    actions[i, j] = 3
                    cooling_map[i, j], cooling_ci[i, j] = ct + cr, (st + sr) * 2

    return actions, cooling_map, cooling_ci
