from fastapi import APIRouter, HTTPException, Query
from pipeline.scene_index import get_scene, scenes_for_bbox, suggest_pair

router = APIRouter(prefix='/api/v1/scenes', tags=['scenes'])


def _public(s: dict) -> dict:
    return {
        'scene_id': s['id'],
        'acquired': s['datetime'][:10],
        'datetime': s['datetime'],
        'thumbnail_url': s.get('thumbnail'),
        'bbox': s['bbox'],
        'gsd': s.get('gsd'),
        'collections': s.get('collections', []),
    }


@router.get('')
async def search_scenes(bbox: str = Query(description='west,south,east,north')):
    """Open Tanager scenes that overlap an area, plus a suggested T1/T2 choice."""
    try:
        box = [float(v) for v in bbox.split(',')]
        assert len(box) == 4 and box[0] < box[2] and box[1] < box[3]
    except (ValueError, AssertionError):
        raise HTTPException(status_code=422, detail='bbox must be west,south,east,north')
    found = scenes_for_bbox(box)
    return {
        'scenes': [{**_public(s), 'scene_share': s['scene_share'], 'aoi_share': s['aoi_share']}
                   for s in found],
        'suggested': suggest_pair(box),
    }


@router.get('/{scene_id}')
async def scene_info(scene_id: str):
    s = get_scene(scene_id)
    if not s:
        raise HTTPException(status_code=404, detail='Scene not found in the Tanager catalog')
    return _public(s)
