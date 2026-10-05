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

Python 3.11 is the target version. On newer Pythons, `rasterio==1.3.11` has no wheel; use
`rasterio>=1.4` there.

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
| POST | `/api/v1/analysis/run` | run status (`run_id`, `queued`) |
| GET | `/api/v1/analysis/status/{run_id}` | status, `progress_pct`, `current_step` |
| GET | `/api/v1/results/{run_id}/summary` | run summary and classifier metrics |
| GET | `/api/v1/results/{run_id}/blocks` | paged, filterable block list |
| GET | `/api/v1/results/{run_id}/geojson` | GeoJSON FeatureCollection |
| GET | `/api/v1/cities` | city names with runs |
| GET | `/api/v1/cities/{city_name}/history` | past runs for a city |
| POST | `/api/v1/chat/message` | agent chat: intent, data, insight and deep links |
| POST | `/api/v1/chat/gemini` | server-side Gemini proxy (keeps the key off the browser) |
| GET | `/health` | liveness check |

## Agent chat (Gemini)

`POST /api/v1/chat/message` runs four agents in sequence: an intent parser (Gemini), a data agent
(reuses the latest completed run for the city, otherwise returns clearly labelled simulated data),
an insight agent (Gemini) and a link builder.

Set `GEMINI_API_KEY` in `.env` (never in the frontend). Models are configurable through
`GEMINI_INTENT_MODEL` and `GEMINI_INSIGHT_MODEL`; Google retires models, and `gemini-2.0-flash` is
already shut down. The calls use the REST `generateContent` endpoint through `requests`, because
the `google-generativeai` SDK reached end of life in November 2025.

Without a key the chat still answers: it falls back to a keyword parser and a plain data readout,
and the response says which agents actually ran.

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
