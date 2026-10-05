import json, os, uuid
from datetime import datetime
from pathlib import Path
from models.schemas import RunStatus, RunSummary, BlockRecord

RESULTS_DIR = Path(os.getenv('RESULTS_DIR', './results'))
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

_runs: dict[str, dict] = {}


def create_run(city_name: str, request_payload: dict) -> str:
    run_id = str(uuid.uuid4())
    run = {
        'run_id': run_id,
        'city_name': city_name,
        'status': 'queued',
        'progress_pct': 0,
        'current_step': 'Queued',
        'created_at': datetime.utcnow().isoformat(),
        'completed_at': None,
        'error': None,
        'request': request_payload,
        'summary': None,
        'blocks': [],
        'map_html_path': None,
        'images': {},
    }
    _runs[run_id] = run
    _persist(run_id)
    return run_id


def update_run(run_id: str, **kwargs):
    if run_id in _runs:
        _runs[run_id].update(kwargs)
        _persist(run_id)


def get_run(run_id: str) -> dict | None:
    if run_id in _runs:
        return _runs[run_id]
    path = RESULTS_DIR / f'{run_id}.json'
    if path.exists():
        with open(path) as f:
            run = json.load(f)
        _runs[run_id] = run
        return run
    return None


def _run_files():
    # *_blocks.json files hold block lists, not run records
    return [p for p in RESULTS_DIR.glob('*.json') if not p.name.endswith('_blocks.json')]


def list_runs_for_city(city_name: str) -> list[dict]:
    all_runs = []
    for path in _run_files():
        try:
            with open(path) as f:
                run = json.load(f)
            if run.get('city_name', '').lower() == city_name.lower():
                all_runs.append(run)
        except Exception:
            continue
    return sorted(all_runs, key=lambda r: r.get('created_at', ''), reverse=True)


def list_cities() -> list[str]:
    cities = set()
    for path in _run_files():
        try:
            with open(path) as f:
                run = json.load(f)
            cities.add(run.get('city_name', ''))
        except Exception:
            continue
    return sorted(cities)


def _persist(run_id: str):
    path = RESULTS_DIR / f'{run_id}.json'
    with open(path, 'w') as f:
        json.dump(_runs[run_id], f, default=str, indent=2)
