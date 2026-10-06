from fastapi import APIRouter, HTTPException, Query, Request
from storage.runs import get_run, list_runs_for_city, list_all_runs
from models.schemas import CityHistoryEntry
from pipeline.cities import ARAB_CITIES
from pipeline.scene_index import scenes_for_bbox
import json, os

router = APIRouter(prefix='/api/v1', tags=['results'])

ACTION_KEYS = {'tree_planting', 'cool_roofs', 'both', 'none'}


def _abs_url(request: Request, rel: str | None) -> str | None:
    if not rel:
        return None
    base = os.getenv('PUBLIC_BASE_URL') or str(request.base_url)
    return f"{base.rstrip('/')}/{rel.lstrip('/')}"


def _complete(run_id: str) -> dict:
    run = get_run(run_id)
    if not run or run['status'] != 'complete':
        raise HTTPException(status_code=404, detail='Run not complete')
    return run


def _load_blocks(run: dict) -> list[dict]:
    path = run.get('blocks_path')
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail='Blocks file not found')
    with open(path) as f:
        return json.load(f)


def _action_ok(block: dict, wanted: str) -> bool:
    if wanted in ACTION_KEYS:
        return block.get('action_key') == wanted
    return wanted.lower().replace('_', ' ') in block['action'].lower()


@router.get('/results/{run_id}/summary')
async def get_summary(run_id: str):
    return _complete(run_id)['summary']


@router.get('/results/{run_id}/blocks')
async def get_blocks(
    run_id: str,
    limit: int = Query(default=50, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    min_risk: float = Query(default=0.0, ge=0.0, le=1.0),
    min_exposure: float = Query(default=0.0, ge=0.0, le=1.0),
    action: str = Query(default=''),
    search: str = Query(default=''),
    sort: str = Query(default='risk_desc'),
):
    blocks = _load_blocks(_complete(run_id))   # stored most urgent first
    if min_risk > 0:
        blocks = [b for b in blocks if b['risk_score'] >= min_risk]
    if min_exposure > 0:
        blocks = [b for b in blocks if b.get('population_exposure', 0) >= min_exposure]
    if action:
        blocks = [b for b in blocks if _action_ok(b, action)]
    if search:
        s = search.lower()
        blocks = [b for b in blocks if
                  s in str(b['lat']) or s in str(b['lon']) or
                  s in b.get('dominant_material', '').lower()]
    total = len(blocks)
    return {'total': total, 'offset': offset, 'limit': limit,
            'blocks': blocks[offset:offset + limit]}


@router.get('/results/{run_id}/geojson')
async def get_geojson(run_id: str):
    blocks = _load_blocks(_complete(run_id))
    features = []
    for b in blocks:
        features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [b['lon'], b['lat']]},
            'properties': {k: v for k, v in b.items() if k not in ('lat', 'lon')},
        })
    return {'type': 'FeatureCollection', 'features': features}


@router.get('/results/{run_id}/images')
async def get_images(run_id: str, request: Request):
    run = _complete(run_id)
    imgs = run.get('images') or {}
    b = run['summary'].get('bbox')
    return {
        **{k: _abs_url(request, imgs.get(k)) for k in
           ('material_map', 'temperature_map', 'risk_map', 'change_map')},
        'bounds': [[b[1], b[0]], [b[3], b[2]]] if b else None,
    }


@router.get('/results/{run_id}/map_url')
async def get_map_url(run_id: str, request: Request):
    run = _complete(run_id)
    return {'url': _abs_url(request, run.get('map_html_path'))}


# ---------------------------------------------------------------- cities and history
def _entry(r: dict) -> dict:
    s = r.get('summary') or {}
    counts = s.get('top_action_counts') or {}
    return CityHistoryEntry(
        run_id=r['run_id'],
        created_at=r['created_at'],
        scene_t1_date=s.get('scene_t1_date', ''),
        scene_t2_date=s.get('scene_t2_date', ''),
        mean_lst=s.get('mean_lst', 0.0),
        high_risk_count=s.get('high_risk_count', 0),
        total_blocks=s.get('total_blocks', 0),
        status=r['status'],
        city_name=r.get('city_name', ''),
        top_action_count=sum(v for k, v in counts.items() if k != 'none'),
        mean_lst_delta_top20=s.get('mean_lst_delta_top20'),
    ).model_dump()


@router.get('/cities')
async def get_cities():
    """Cities that have at least one completed run, with the area they cover."""
    seen: dict[str, dict] = {}
    for r in list_all_runs():  # newest first
        if r.get('status') != 'complete':
            continue
        name = r['city_name']
        if name not in seen:
            s = r.get('summary') or {}
            seen[name] = {
                'id': name, 'name': name,
                'country': ARAB_CITIES.get(name, {}).get('country', ''),
                'aoi_bbox': s.get('bbox') or r.get('request', {}).get('bbox'),
                'last_run': r['created_at'][:10], 'run_count': 0,
            }
        seen[name]['run_count'] += 1
    return sorted(seen.values(), key=lambda c: c['name'])


@router.get('/cities/catalog')
async def get_city_catalog():
    """Every Arab city the app can locate, with a default area, UTM zone and how many open
    Tanager scenes cover it (cities with coverage come first)."""
    out = []
    for n, c in ARAB_CITIES.items():
        out.append({'id': n, 'name': n, 'country': c['country'], 'aoi_bbox': c['bbox'],
                    'epsg': c['epsg'], 'scene_count': len(scenes_for_bbox(c['bbox']))})
    return sorted(out, key=lambda c: (-c['scene_count'], c['name']))


@router.get('/cities/{city_name}/history')
async def get_city_history(city_name: str):
    return [_entry(r) for r in list_runs_for_city(city_name)]


@router.get('/runs')
async def get_runs(status: str = Query(default='')):
    return [_entry(r) for r in list_all_runs() if not status or r['status'] == status]
