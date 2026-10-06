"""Loads the models trained in the notebook (artifacts/*.joblib).

The files must be read with the same scikit-learn and XGBoost versions they were trained
with (pinned in requirements.txt). If they cannot be loaded the pipeline falls back to
training on the scene, and says so in the run summary.
"""
import logging
import os
import warnings
from functools import lru_cache

import joblib

log = logging.getLogger('sahab.models')

ARTIFACT_DIR = os.getenv(
    'MODEL_DIR', os.path.join(os.path.dirname(__file__), '..', 'artifacts'))


def _load(name: str):
    path = os.path.join(ARTIFACT_DIR, name)
    if not os.path.exists(path):
        log.warning('model file missing: %s', path)
        return None
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            obj = joblib.load(path)
        for w in caught:
            log.warning('while loading %s: %s', name, str(w.message)[:200])
        return obj
    except Exception as exc:  # noqa: BLE001 - any unpickling failure means "unusable"
        log.error('could not load %s: %s', name, exc)
        return None


@lru_cache(maxsize=1)
def load_classifier():
    """Bundle with ensemble, scaler, label_encoder, feature/class names and metrics."""
    return _load('sahab_classifier.joblib')


@lru_cache(maxsize=1)
def load_cooling():
    """Bundle with the Gaussian Process and the cooling constants."""
    return _load('sahab_cooling.joblib')


def model_status() -> dict:
    clf, cool = load_classifier(), load_cooling()
    return {
        'classifier_loaded': clf is not None,
        'cooling_loaded': cool is not None,
        'gpr_available': bool(cool and cool.get('gpr') is not None),
        'trained_with': (clf or {}).get('versions'),
        'metrics': (clf or {}).get('metrics'),
    }
