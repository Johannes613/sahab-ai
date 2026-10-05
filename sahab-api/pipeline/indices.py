import h5py
import numpy as np

ROOT = 'HDFEOS/GRIDS/HYP/Data Fields'

BAND_TARGETS = {'green': 560, 'red': 665, 'nir': 830, 'swir1': 1610,
                'red_edge1': 705, 'red_edge2': 750, 'swir2': 2100}


def get_wavelengths(item: dict, sr_key: str) -> np.ndarray:
    bands_meta = item['assets'][sr_key].get('bands', [])
    spectral = [b for b in bands_meta if 'eo:center_wavelength' in b]
    wl_um = np.array([b['eo:center_wavelength'] for b in spectral], dtype=float)
    return wl_um * 1000.0


def pick_band(wavelengths_nm: np.ndarray, target_nm: float) -> int:
    return int(np.argmin(np.abs(wavelengths_nm - target_nm)))


def load_bands(h5_path: str, mask: np.ndarray, band_idx: dict) -> dict:
    with h5py.File(h5_path, 'r') as f:
        sr = f[f'{ROOT}/surface_reflectance']
        bands = {}
        for name, idx in band_idx.items():
            arr = sr[idx, :, :].astype('float32')
            arr[~mask] = np.nan
            arr[arr < 0] = np.nan
            bands[name] = arr
    return bands


def compute_indices(b: dict) -> dict:
    eps = 1e-6
    return {
        'NDVI': (b['nir'] - b['red']) / (b['nir'] + b['red'] + eps),
        'NDBI': (b['swir1'] - b['nir']) / (b['swir1'] + b['nir'] + eps),
        'MNDWI': (b['green'] - b['swir1']) / (b['green'] + b['swir1'] + eps),
        'BUI': ((b['swir1'] - b['nir']) / (b['swir1'] + b['nir'] + eps))
               - ((b['nir'] - b['red']) / (b['nir'] + b['red'] + eps)),
        'CIre': (b['nir'] / (b['red_edge1'] + eps)) - 1,
        'NMI': (b['swir2'] - b['swir1']) / (b['swir2'] + b['swir1'] + eps),
    }
