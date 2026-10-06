"""Index of Planet's open Tanager scenes (data/tanager_scene_index.json).

Built by scripts/build_scene_index.py. The open catalog is small, so the index is read once
and used to (a) find which collection holds a scene, (b) offer only scenes that exist, and
(c) suggest T1/T2 pairs of the same place.
"""
import json
import os
from functools import lru_cache

INDEX_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'tanager_scene_index.json')
STAC_ROOT = 'https://www.planet.com/data/stac/tanager-core-imagery'


@lru_cache(maxsize=1)
def _scenes() -> dict[str, dict]:
    try:
        with open(INDEX_PATH) as f:
            return {s['id']: s for s in json.load(f)}
    except FileNotFoundError:
        return {}


def all_scenes() -> list[dict]:
    return list(_scenes().values())


def get_scene(scene_id: str) -> dict | None:
    return _scenes().get(scene_id)


def item_url(scene_id: str) -> str:
    """STAC item URL; falls back to the urban collection for scenes not in the index."""
    s = get_scene(scene_id)
    collection = s['collections'][0] if s else 'urban'
    return f'{STAC_ROOT}/{collection}/{scene_id}/{scene_id}.json'


def _area(b):
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _inter(a, b):
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return max(0.0, w) * max(0.0, h)


def overlaps(a, b) -> bool:
    return _inter(a, b) > 0


def scenes_for_bbox(bbox: list[float], min_scene_share: float = 0.10) -> list[dict]:
    """Scenes whose footprint overlaps bbox. `scene_share` is how much of the scene lies inside
    the area of interest; `aoi_share` is how much of the area the scene covers."""
    out = []
    for s in all_scenes():
        inter = _inter(s['bbox'], bbox)
        if inter <= 0:
            continue
        scene_share = inter / _area(s['bbox'])
        if scene_share < min_scene_share:
            continue
        out.append({**s, 'scene_share': round(scene_share, 3),
                    'aoi_share': round(inter / _area(bbox), 3)})
    out.sort(key=lambda s: (-s['scene_share'], s['datetime']))
    return out


def suggest_pair(bbox: list[float]) -> dict:
    """Best scene(s) for an area. Returns {'t1': id|None, 't2': id|None, 'note': str}.

    T2 is always the best-covering scene; T1 is the best older scene of (nearly) the same
    footprint. For most Arab cities the open catalog has only one date, so T1 is None.
    """
    cands = scenes_for_bbox(bbox)
    if not cands:
        return {'t1': None, 't2': None, 'note': 'No open Tanager scene covers this area.'}
    best = cands[0]
    t1 = None
    for s in cands[1:]:
        mutual = _inter(best['bbox'], s['bbox']) / min(_area(best['bbox']), _area(s['bbox']))
        if mutual >= 0.6 and s['datetime'] != best['datetime']:
            older, newer = sorted([best, s], key=lambda x: x['datetime'])
            t1, best = older, newer
            break
    note = ('One scene is available, so change over time cannot be measured.'
            if t1 is None else 'Two dates of the same area are available.')
    return {'t1': t1['id'] if t1 else None, 't2': best['id'], 'note': note}
