import requests
import os
import tempfile

TANAGER_BASE = 'https://www.planet.com/data/stac/tanager-core-imagery/urban'
DEFAULT_CACHE = os.path.join(tempfile.gettempdir(), 'sahab_cache')


def fetch_scene_metadata(scene_id: str) -> dict:
    url = f'{TANAGER_BASE}/{scene_id}/{scene_id}.json'
    r = requests.get(url, timeout=60)
    if r.status_code == 404:
        raise ValueError(f'Scene {scene_id} was not found in the Tanager catalog.')
    r.raise_for_status()
    try:
        return r.json()
    except ValueError:
        raise ValueError(f'Scene {scene_id} was not found in the Tanager catalog.') from None


def download_sr(item: dict, label: str, cache_dir: str = DEFAULT_CACHE) -> tuple[str, str]:
    os.makedirs(cache_dir, exist_ok=True)
    sr_key = 'ortho_sr_hdf5' if 'ortho_sr_hdf5' in item['assets'] else 'basic_sr_hdf5'
    sr_url = item['assets'][sr_key]['href']
    local_path = os.path.join(cache_dir, f'tanager_{label}_{item["id"]}.h5')
    if not os.path.exists(local_path):
        tmp_path = local_path + '.part'
        with requests.get(sr_url, stream=True, timeout=300) as r:
            r.raise_for_status()
            with open(tmp_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
        os.replace(tmp_path, local_path)  # never leave a half-downloaded file in the cache
    return local_path, sr_key
