# Sahab AI API

FastAPI backend for Sahab AI, an urban heat risk monitoring platform. It receives two Tanager
scene IDs and a city bounding box, runs the analysis pipeline as a background task, stores the
results (in memory plus JSON files in `RESULTS_DIR`), and serves them over REST.

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

Python 3.11 is the target version; 3.13 was also tested.

## Try it

```bash
curl -X POST http://localhost:8000/api/v1/analysis/run -H "Content-Type: application/json" \
  -d '{"city_name":"Abu Dhabi","bbox":[54.28,24.38,54.55,24.58],"scene_t1_id":"20250407_035509_25_4001","scene_t2_id":"20250515_080954_16_4001","epsg":32640}'

curl http://localhost:8000/api/v1/analysis/status/<run_id>
curl http://localhost:8000/api/v1/results/<run_id>/summary
```

## Endpoints

| Method | Path | Returns |
|---|---|---|
| POST | `/api/v1/analysis/run` | starts a run (`scene_t1_id` is optional) |
| GET | `/api/v1/analysis/status/{run_id}` | status, `progress_pct`, `current_step` |
| DELETE | `/api/v1/analysis/{run_id}` | cancels a queued or running analysis |
| GET | `/api/v1/results/{run_id}/summary` | run summary, scores and data provenance |
| GET | `/api/v1/results/{run_id}/blocks` | ranked blocks (`limit`, `min_risk`, `min_exposure`, `action`) |
| GET | `/api/v1/results/{run_id}/geojson` | GeoJSON FeatureCollection |
| GET | `/api/v1/results/{run_id}/images` | map layer PNGs and their bounds |
| GET | `/api/v1/results/{run_id}/map_url` | the standalone HTML map |
| GET | `/api/v1/cities` | cities with completed runs |
| GET | `/api/v1/cities/catalog` | Arab cities the app can locate, with satellite coverage counts |
| GET | `/api/v1/cities/{city}/history` | runs for a city |
| GET | `/api/v1/runs` | all runs (`?status=complete`) |
| GET | `/api/v1/scenes?bbox=w,s,e,n` | open Tanager scenes over an area, plus a suggested pair |
| GET | `/api/v1/scenes/{scene_id}` | one scene: date, thumbnail, footprint |
| POST | `/api/v1/chat/message` | agent chat: intent, data, insight and deep links |
| POST | `/api/v1/chat/gemini` | server-side Gemini proxy (keeps the key off the browser) |
| GET | `/health` | liveness, model and Gemini status |

Generated map layers and HTML maps are served from `/files/{run_id}/`.

## Models

`artifacts/sahab_classifier.joblib` (voting ensemble, scaler, label encoder) and
`artifacts/sahab_cooling.joblib` (Gaussian Process) come from the training notebook. They must be read
with the library versions pinned in `requirements.txt` (scikit-learn 1.6.1, XGBoost 3.1.2): older
XGBoost versions load the file but quietly degrade the XGBoost member (macro F1 0.84 instead of 0.98).
`GET /health` reports whether both loaded. If the classifier cannot load, the pipeline trains on the
scene instead and says so in the run summary.

With real Landsat temperatures the cooling model is fitted on the scene being analysed; the saved model
is used only when Landsat is unavailable, because it was trained on a modelled temperature surface.

## Scene index

`data/tanager_scene_index.json` is a crawl of Planet's open Tanager catalog. Rebuild it with
`python scripts/build_scene_index.py`.

## Agent chat (Gemini)

`POST /api/v1/chat/message` runs four agents in sequence: an intent parser (Gemini), a data agent
(uses the latest completed run for the city, follows a run already in progress, or starts a real
analysis when an open scene covers the city), an insight agent (Gemini) and a link builder. Cities with
no satellite coverage get an honest "no coverage" reply, never invented numbers.

Set `GEMINI_API_KEY` in `.env` (never in the frontend). Both language agents use
`gemini-flash-latest`. It is a thinking model, so output limits are generous, and if it is overloaded or
slow the call falls back to `gemini-flash-lite-latest` (the response shows which model answered). The
calls use the REST `generateContent` endpoint through `requests`, because the `google-generativeai` SDK
reached end of life in November 2025.

## Deploy to Render.com

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Environment variables: set `PYTHON_VERSION=3.11.9`, and `CORS_ORIGINS` to your Vercel URL.

Render's free tier has an ephemeral disk, so results and cached scenes are lost on redeploy or
restart. Use a persistent disk or move results to object storage if that matters.

## Notes on the pipeline

- Seed labels for the classifier come from spectral-index rules, so the cross-validated F1 and
  Kappa measure agreement with those rules, not field-verified accuracy.
- When Landsat is unavailable, temperature falls back to a surface modelled from NDBI and NDVI.
  The NDBI/NDVI to temperature correlations are then circular. `lst_source` in the summary says
  which source was used.
- Population is a placeholder surface until WorldPop is integrated (`population_source`).
- The classifier trains on a stratified sample of at most 12,000 pixels; SVM cost grows with the
  square of the sample size.
