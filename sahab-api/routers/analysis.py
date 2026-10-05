from fastapi import APIRouter, BackgroundTasks, HTTPException
from models.schemas import AnalysisRequest, RunStatus
from storage.runs import create_run, get_run
from pipeline.runner import run_pipeline
from datetime import datetime

router = APIRouter(prefix='/api/v1/analysis', tags=['analysis'])


@router.post('/run', response_model=RunStatus)
async def start_analysis(req: AnalysisRequest, background_tasks: BackgroundTasks):
    run_id = create_run(req.city_name, req.model_dump())
    # run_pipeline is a plain (sync) function, so Starlette runs it in a worker
    # thread and the blocking numpy/sklearn work does not stall the event loop.
    background_tasks.add_task(run_pipeline, run_id, req.model_dump())
    run = get_run(run_id)
    return RunStatus(**{**run, 'created_at': datetime.fromisoformat(run['created_at'])})


@router.get('/status/{run_id}', response_model=RunStatus)
async def get_status(run_id: str):
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail='Run not found')
    return RunStatus(**{**run, 'created_at': datetime.fromisoformat(run['created_at'])})
