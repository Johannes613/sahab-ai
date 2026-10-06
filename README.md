# Sahab AI

Urban heat risk monitoring and intervention prioritization from satellite data (Planet Tanager
hyperspectral imagery, Landsat thermal, Sentinel-2). Team Abyssinia, Arab Youth Space Hackathon 2026.

- `sahab-api/` FastAPI backend: the satellite pipeline, the trained models, and the Gemini agent chat.
- `frontend/` React dashboard (Create React App + Tailwind + Leaflet).

## Run it

Backend (Python 3.11 target; 3.13 also works):

```bash
cd sahab-api
python -m venv .venv && .venv/Scripts/activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                 # add GEMINI_API_KEY
uvicorn main:app --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm start                                            # uses http://localhost:8000 by default
```

If port 3000 is taken the dev server moves to 3001; both origins are allowed by the backend's CORS
setting (`CORS_ORIGINS` in `sahab-api/.env`).

## What is real, and what is not

- Everything the dashboard shows comes from a real analysis run; there is no mock data. The dashboard
  opens on a built-in Riyadh analysis that ships with the backend (`sahab-api/seed`), so a fresh install
  is never empty.
- The open Tanager catalog has about 150 scenes worldwide. **Riyadh (2025-05-15) is the only Arab city
  with an urban scene**, and no Arab city has a second date, so change detection between two dates is
  not possible with open data. Analyses therefore run on a single scene, and the change layer appears
  only if you supply an earlier scene of the same place.
- Land surface temperature is measured by Landsat 8/9 (the Planetary Computer asset is `lwir11`). If
  Landsat cannot be reached, a modelled surface is used and the run says so.
- Population exposure is a proxy (the built-up share of each block). WorldPop is not integrated.
- The material classifier was trained on rule-based labels, so its F1 and Kappa measure agreement with
  those rules, not field-verified accuracy. The saved model can only output the classes present in its
  training scene (no water, no dark asphalt).
- Cooling values are modelled scenarios with wide uncertainty; they are for prioritization, not
  guarantees.
