"""Crawl Planet's open Tanager STAC catalog and write data/tanager_scene_index.json.

Run from sahab-api/:  python scripts/build_scene_index.py
The index lets the API offer only scenes that exist (the open catalog has ~280 scenes).
"""
import json
import os
import sys
import concurrent.futures as cf

import requests

ROOT = 'https://www.planet.com/data/stac/tanager-core-imagery'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'tanager_scene_index.json')


def get(url):
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return r.json()


def main():
    catalog = get(f'{ROOT}/catalog.json')
    collections = [l['href'] for l in catalog['links'] if l['rel'] == 'child']
    scenes = {}
    for cu in collections:
        col = get(cu)
        cid = col['id']
        hrefs = [l['href'] for l in col['links'] if l['rel'] == 'item']
        with cf.ThreadPoolExecutor(8) as ex:
            items = list(ex.map(get, hrefs))
        print(f'{cid}: {len(items)} items')
        for it in items:
            s = scenes.setdefault(it['id'], {
                'id': it['id'],
                'datetime': it['properties']['datetime'],
                'bbox': [round(v, 4) for v in it['bbox']],
                'gsd': it['properties'].get('gsd'),
                'thumbnail': it['assets'].get('thumbnail', {}).get('href'),
                'collections': [],
            })
            s['collections'].append(cid)
    out = sorted(scenes.values(), key=lambda s: s['datetime'])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f, indent=1)
    print(f'wrote {len(out)} unique scenes to {os.path.abspath(OUT)}')


if __name__ == '__main__':
    sys.exit(main())
