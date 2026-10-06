"""Built-in example analyses.

`seed/<run_id>/` holds a finished real analysis (run record, blocks and map files). On startup it
is copied into the results directory if it is not already there, so a fresh clone, a new
deployment or a wiped disk always opens with a populated dashboard. Nothing is overwritten.
"""
import json
import logging
import os
import shutil
from pathlib import Path

from storage.runs import RESULTS_DIR

log = logging.getLogger('sahab.seed')
SEED_DIR = Path(os.getenv('SEED_DIR', Path(__file__).resolve().parent.parent / 'seed'))


def install_seed_runs() -> list[str]:
    installed = []
    if not SEED_DIR.is_dir():
        return installed
    for run_dir in sorted(p for p in SEED_DIR.iterdir() if p.is_dir()):
        run_id = run_dir.name
        target = RESULTS_DIR / f'{run_id}.json'
        run_file, blocks_file = run_dir / 'run.json', run_dir / 'blocks.json'
        if target.exists() or not run_file.exists() or not blocks_file.exists():
            continue
        try:
            blocks_target = RESULTS_DIR / f'{run_id}_blocks.json'
            shutil.copy(blocks_file, blocks_target)
            files_src = run_dir / 'files'
            if files_src.is_dir():
                shutil.copytree(files_src, RESULTS_DIR / 'files' / run_id, dirs_exist_ok=True)
            run = json.loads(run_file.read_text())
            run['blocks_path'] = str(blocks_target)
            target.write_text(json.dumps(run, indent=2))
            installed.append(run_id)
        except Exception as exc:  # noqa: BLE001 - a broken seed must never stop the server
            log.error('could not install seed run %s: %s', run_id, exc)
    return installed
