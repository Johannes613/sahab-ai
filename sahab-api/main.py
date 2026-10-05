from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv

load_dotenv()

from routers.analysis import router as analysis_router
from routers.results import router as results_router

app = FastAPI(title='Sahab AI API', version='1.0.0',
              description='Urban heat risk monitoring for the MENA region')

origins = [o.strip() for o in os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(analysis_router)
app.include_router(results_router)

RESULTS_DIR = os.getenv('RESULTS_DIR', './results')
os.makedirs(RESULTS_DIR, exist_ok=True)


@app.get('/health')
async def health():
    return {'status': 'ok', 'service': 'Sahab AI API'}


@app.get('/')
async def root():
    return {'message': 'Sahab AI API. See /docs for endpoints.'}
