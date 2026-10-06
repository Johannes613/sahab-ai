from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging
import os
from dotenv import load_dotenv

load_dotenv()

from routers.analysis import router as analysis_router
from routers.results import router as results_router
from routers.scenes import router as scenes_router
from routers.agent_chat import router as chat_router
from pipeline.model_store import load_classifier, load_cooling, model_status
from storage.runs import recover_interrupted_runs
from storage.seed import install_seed_runs

logging.basicConfig(level=logging.INFO)
log = logging.getLogger('sahab')

app = FastAPI(title='Sahab AI API', version='1.0.0',
              description='Urban heat risk monitoring for the MENA region')

origins = [o.strip() for o in os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(analysis_router)
app.include_router(results_router)
app.include_router(scenes_router)
app.include_router(chat_router)

RESULTS_DIR = os.getenv('RESULTS_DIR', './results')
os.makedirs(os.path.join(RESULTS_DIR, 'files'), exist_ok=True)
# generated map layers (PNG overlays) and the standalone HTML maps
app.mount('/files', StaticFiles(directory=os.path.join(RESULTS_DIR, 'files')), name='files')


@app.on_event('startup')
def startup():
    seeded = install_seed_runs()
    if seeded:
        log.info('installed built-in example analyses: %s', seeded)
    n = recover_interrupted_runs()
    if n:
        log.warning('marked %d interrupted run(s) as failed', n)
    # load the trained models now so a problem shows up at startup, not on the first run
    load_classifier()
    load_cooling()
    log.info('models: %s', {k: v for k, v in model_status().items() if k.endswith(('loaded', 'available'))})
    log.info('gemini key configured: %s', bool(os.getenv('GEMINI_API_KEY')))


@app.get('/health')
async def health():
    st = model_status()
    return {
        'status': 'ok',
        'service': 'Sahab AI API',
        'classifier_loaded': st['classifier_loaded'],
        'cooling_loaded': st['cooling_loaded'],
        'gemini_configured': bool(os.getenv('GEMINI_API_KEY')),
    }


@app.get('/')
async def root():
    return {'message': 'Sahab AI API. See /docs for endpoints.'}
