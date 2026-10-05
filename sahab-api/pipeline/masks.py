import h5py
import numpy as np

ROOT = 'HDFEOS/GRIDS/HYP/Data Fields'


def build_valid_mask(h5_path: str) -> tuple[np.ndarray, dict]:
    with h5py.File(h5_path, 'r') as f:
        cloud = f[f'{ROOT}/beta_cloud_mask'][:]
        nodata = f[f'{ROOT}/nodata_pixels'][:]
    valid = (cloud == 0) & (nodata == 0)
    stats = {
        'valid_pct': float(valid.mean() * 100),
        'cloud_pct': float((cloud != 0).mean() * 100),
        'nodata_pct': float((nodata != 0).mean() * 100),
    }
    return valid, stats
