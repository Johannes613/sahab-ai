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
            elif vf > 0.50 and af < 0.10:
                actions[i, j] = 2
                cooling_map[i, j] = c_roof
                cooling_ci[i, j] = s_roof * 2
            elif af > 0.25 and vf < 0.15:
                actions[i, j] = 2
                cooling_map[i, j] = c_roof
                cooling_ci[i, j] = s_roof * 2
            elif vf < 0.15:
                actions[i, j] = 1
                cooling_map[i, j] = c_tree
                cooling_ci[i, j] = s_tree * 2
            else:
                actions[i, j] = 3
                cooling_map[i, j] = c_tree + c_roof
                cooling_ci[i, j] = (s_tree + s_roof) * 2

    return actions, cooling_map, cooling_ci
