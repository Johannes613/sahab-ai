from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
import uuid


class AnalysisRequest(BaseModel):
    city_name: str
    bbox: list[float] = Field(min_length=4, max_length=4)
    scene_t1_id: Optional[str] = None   # optional: without it there is no change detection
    scene_t2_id: str
    block_size: int = Field(default=50, ge=4, le=200)             # pixels
    block_size_m: Optional[int] = Field(default=None, ge=60, le=6000)  # metres; overrides block_size
    min_valid_pct: float = Field(default=0.30, ge=0.05, le=0.95)  # fraction of valid T2 pixels
    include_sentinel2: bool = True
    include_landsat: bool = True
    epsg: Optional[int] = None          # derived from the scene location when omitted


class RunStatus(BaseModel):
    run_id: str
    city_name: str
    status: Literal['queued', 'running', 'complete', 'failed', 'cancelled']
    progress_pct: int = 0
    current_step: str = ''
    created_at: datetime
    completed_at: Optional[datetime] = None
    error: Optional[str] = None


class BlockRecord(BaseModel):
    rank: int
    city: str
    lat: float
    lon: float
    risk_score: float
    action: str
    est_cooling_c: float
    cooling_ci_c: float
    veg_fraction: float
    asphalt_fraction: float
    dominant_material: str


class RunSummary(BaseModel):
    run_id: str
    city_name: str
    total_blocks: int
    high_risk_count: int
    mean_lst: float
    max_lst: float
    total_cooling_top20: float
    scene_t1_date: str
    scene_t2_date: str
    t2_valid_pct: float
    t2_cloud_pct: float
    classes_present: list[str]
    cv_macro_f1_xgb: float
    cv_macro_f1_svm: float
    cv_macro_f1_ensemble: float
    cohen_kappa_ensemble: float
    ndbi_lst_correlation: float
    ndvi_lst_correlation: float
    action_counts: dict[str, int]
    landsat_used: bool
    sentinel2_used: bool
    created_at: str


class CityHistoryEntry(BaseModel):
    run_id: str
    created_at: str
    scene_t1_date: str
    scene_t2_date: str
    mean_lst: float
    high_risk_count: int
    total_blocks: int
    status: str
    city_name: str = ''
    top_action_count: int = 0
    mean_lst_delta_top20: Optional[float] = None
