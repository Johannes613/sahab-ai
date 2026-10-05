from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from storage.runs import get_run, list_runs_for_city, list_cities
from models.schemas import RunSummary, BlockRecord, CityHistoryEntry
import json, os

router = APIRouter(prefix='/api/v1', tags=['results'])


@router.get('/results/{run_id}/summary')
async def get_summary(run_id: str):
    run = get_run(run_id)
    if not run or run['status'] != 'complete':
        raise HTTPException(status_code=404, detail='Run not complete')
    return run['summary']


@router.get('/results/{run_id}/blocks')
async def get_blocks(
    run_id: str,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    min_risk: float = Query(default=0.0, ge=0.0, le=1.0),
    action: str = Query(default=''),
    search: str = Query(default=''),
):
    run = get_run(run_id)
    if not run or run['status'] != 'complete':
        raise HTTPException(status_code=404, detail='Run not complete')
    blocks_path = run.get('blocks_path')
    if not blocks_path or not os.path.exists(blocks_path):
        raise HTTPException(status_code=404, detail='Blocks file not found')
    with open(blocks_path) as f:
        blocks = json.load(f)
    if min_risk > 0:
        blocks = [b for b in blocks if b['risk_score'] >= min_risk]
    if action:
        blocks = [b for b in blocks if action.lower() in b['action'].lower()]
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
    run = get_run(run_id)
    if not run or run['status'] != 'complete':
        raise HTTPException(status_code=404, detail='Run not complete')
    with open(run['blocks_path']) as f:
        blocks = json.load(f)
    features = []
    for b in blocks:
        features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [b['lon'], b['lat']]},
            'properties': {k: v for k, v in b.items() if k not in ('lat', 'lon')},
        })
    return {'type': 'FeatureCollection', 'features': features}


@router.get('/cities')
async def get_cities():
    return list_cities()


@router.get('/cities/{city_name}/history')
async def get_city_history(city_name: str):
    runs = list_runs_for_city(city_name)
    return [
        CityHistoryEntry(
            run_id=r['run_id'],
            created_at=r['created_at'],
            scene_t1_date=r.get('summary', {}).get('scene_t1_date', '') if r.get('summary') else '',
            scene_t2_date=r.get('summary', {}).get('scene_t2_date', '') if r.get('summary') else '',
            mean_lst=r.get('summary', {}).get('mean_lst', 0.0) if r.get('summary') else 0.0,
            high_risk_count=r.get('summary', {}).get('high_risk_count', 0) if r.get('summary') else 0,
            total_blocks=r.get('summary', {}).get('total_blocks', 0) if r.get('summary') else 0,
            status=r['status'],
        )
        for r in runs
    ]
