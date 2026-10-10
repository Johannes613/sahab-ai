# Sahab AI — سحاب

## Urban Heat Risk Monitoring and Intervention Prioritization

**Arab Youth Space Hackathon 2026 · Challenge 813 · Team Abyssinia (UAE)**
Theme: *Urban Expansion, Land Use Change and Heat Risk*

> **Sahab** (سحاب) means *cloud* in Arabic: a name that carries both the satellite data we work with and the cloud computing platform that powers our analysis.

### **Live demo: http://13.60.87.236**

The demo opens on a finished analysis of Riyadh. Click any block on the map to see its full profile, switch the map layers, ask the Agent Chat a question, or start a new analysis. (The demo is served over plain HTTP.)

| | |
|---|---|
| **Team** | Abyssinia (UAE) |
| **Challenge theme** | Urban Expansion, Land Use Change and Heat Risk |
| **Analysed city** | Riyadh, Saudi Arabia (the only Arab city with an open urban Tanager scene; see [Study area](#study-area-and-data-availability)) |
| **Key data** | Planet Tanager hyperspectral imagery (426 bands, 376 to 2499 nm), Landsat 8/9 thermal, Sentinel-2 |
| **Data licence** | CC-BY-4.0 Planet Labs PBC (Tanager). Landsat (USGS/NASA) and Sentinel-2 (ESA Copernicus) are open data. |

---

## Problem statement

Rapid urban expansion across the UAE and the Arab region has increased impervious surfaces while reducing natural vegetation. These changes intensify the Urban Heat Island (UHI) effect, leading to higher surface temperatures, increased energy consumption, and serious health risks for outdoor workers, children and the elderly during extreme summer conditions.

City authorities face three practical gaps:

1. **Where to act first.** Budgets are limited and planners need a ranked priority list, not just a heatmap.
2. **What action to take.** The right intervention depends on what the surface is made of. Standard multispectral satellites cannot distinguish roof types and pavement materials reliably.
3. **What improvement to expect.** Without a cooling estimate, investment decisions are made on guesswork.

## Solution: Sahab AI

Sahab AI is a satellite-driven decision support tool for city planners. For an area of interest it:

- Finds the open Tanager hyperspectral scenes that cover the area (via the Planet STAC catalogue) and downloads the surface-reflectance product.
- **Classifies surface materials** (healthy and stressed vegetation, concrete, reflective roofs, bare soil) with an ensemble of three models: gradient-boosted trees (XGBoost), a support vector machine and a random forest, combined by soft voting.
- Retrieves **Landsat 8/9 land surface temperature** and a **Sentinel-2 NDVI/NDBI trend** (six years) from the Microsoft Planetary Computer.
- Divides the scene into planning blocks (about 600 m) and computes a **heat risk score** from heat hazard, green deficit and exposure.
- **Recommends tree planting, cool roofs or both** for each block with transparent rules, and estimates the **surface cooling with an uncertainty interval** using Gaussian Process regression.
- Presents the result as a ranked list, an interactive map with material, temperature and risk layers, a per-block detail panel with a one-sentence rationale, a downloadable standalone HTML map and CSV export, and a conversational **Agent Chat** (Google Gemini) that answers questions about a city and links straight into the dashboard.

## Why hyperspectral data

Tanager captures 426 bands from 376 to 2499 nm. We use seven of them:

| Group | Bands | Used for |
|---|---|---|
| Standard (any multispectral sensor) | Green 560, Red 665, NIR 830, SWIR-1 1610 nm | NDVI, NDBI, MNDWI, BUI |
| **Hyperspectral-only** | **Red-edge 705 nm, Red-edge 750 nm, SWIR-2 2100 nm** | **CIre** (chlorophyll and stress) and **NMI** (material contrast) |

The SWIR-2 region near 2100 nm is where concrete, asphalt and reflective coatings diverge most in reflectance, and the red edge separates healthy from stressed vegetation. Sentinel-2 and Landsat have no bands in these positions, so the material classification step, which drives the intervention recommendation, depends on hyperspectral data. Without it every built-up surface looks alike and the recommendation collapses into a generic heatmap response.

| Index | Formula | Detects |
|---|---|---|
| NDVI | (NIR − Red) / (NIR + Red) | Vegetation density and health |
| NDBI | (SWIR1 − NIR) / (SWIR1 + NIR) | Built-up surfaces |
| MNDWI | (Green − SWIR1) / (Green + SWIR1) | Open water |
| BUI | NDBI − NDVI | Net built-up signal |
| **CIre** | (NIR / RedEdge1) − 1 | Chlorophyll and vegetation stress (hyperspectral) |
| **NMI** | (SWIR2 − SWIR1) / (SWIR2 + SWIR1) | Material contrast (hyperspectral) |

## Models used

| Model | Purpose | Why chosen |
|---|---|---|
| XGBoost (gradient-boosted trees) | Material classifier | Strong on tabular spectral features |
| Support vector machine (RBF kernel) | Material classifier | Different error profile from tree models |
| Random forest | Material classifier | Robust baseline, included in the ensemble |
| **Soft-voting ensemble** (XGBoost + SVM + RF) | Final material prediction | Averages the three models' class probabilities |
| Gaussian Process regression | Cooling estimate | Returns an uncertainty interval, not only a point estimate |
| Multi-factor risk score | Block ranking | Transparent, auditable and physically interpretable |

**Risk score** = heat hazard × green deficit × exposure, each normalised to 0 to 1. A block has to score high on all three to reach the top of the list. Blocks below 0.3 get no action.

**Intervention rules:** vegetation above 50% with little asphalt, or asphalt above 25% with vegetation below 15% → cool roofs; vegetation below 15% → tree planting; mixed conditions → both.

### Validation of the material classifier

Five-fold stratified cross-validation on 77,105 labelled pixels from the Riyadh scene:

| Model | Macro F1 (CV) | Cohen's Kappa (held-out 20%) |
|---|---|---|
| XGBoost | 0.930 | 0.998 |
| SVM (RBF) | 0.977 | 0.989 |
| Soft-voting ensemble | 0.984 | 0.999 |

> **Read these scores carefully.** The training labels are *rule-based seed labels* (spectral-index thresholds), not field-verified ground truth. The scores therefore measure how well the models reproduce those rules (a random forest reaches 1.00), not accuracy against reality. Independent field samples would be needed to measure real accuracy; they are the first item on our path to an MVP.

## Study area and data availability

The pipeline is city-agnostic: it needs a bounding box and a Tanager scene. We planned to demonstrate it on Abu Dhabi, Riyadh and Cairo, but **Planet's open Tanager catalogue (about 150 scenes worldwide) contains an urban scene for only one Arab city, Riyadh (2025-05-15, scene `20250515_080954_16_4001`)**, and none of the 24 Arab cities we index has a second date. So:

- The analysis is a real, end-to-end run on **Riyadh**.
- Change detection between two dates (urban expansion index) is implemented but **cannot be shown for any Arab city with open data**. Adding an earlier scene of the same place switches it on.
- The app indexes the whole open catalogue and tells a user honestly when no scene covers a city (for example Dubai or Abu Dhabi) instead of inventing results.
- Extending coverage needs Tanager scenes from Planet's commercial catalogue or from the 813 satellite itself.

| Data | Provider | Used for | Licence |
|---|---|---|---|
| Tanager surface reflectance | Planet Labs PBC | Materials, indices, scene footprint | CC-BY-4.0 |
| Landsat 8/9 Collection 2 Level-2 (`lwir11`) | USGS / NASA via Microsoft Planetary Computer | Land surface temperature | Open |
| Sentinel-2 L2A | ESA Copernicus via Microsoft Planetary Computer | Six-year NDVI/NDBI trend | Open |
| Map tiles | © OpenStreetMap contributors | Background map | ODbL |

## Results: Riyadh

Scene 2025-05-15, 851 blocks of about 600 m (pixels are about 30 m), real Landsat temperatures (median of the previous 12 months), Sentinel-2 trend 2020 to 2025.

| | |
|---|---|
| Mean land surface temperature | 42.7 °C (maximum 52.7 °C) |
| Blocks above risk 0.7 | 1 of 851 |
| Top 20 blocks versus the scene mean | +4.0 °C hotter |
| Recommended actions | tree planting 497 · both 23 · cool roofs 0 · no action 331 |
| Top-ranked block | risk 1.00, concrete, no vegetation, +8.1 °C; tree planting, estimated cooling 0.98 ± 2.01 °C |
| NDBI versus temperature | r = 0.08 (weak) |
| NDVI versus temperature | r = −0.23 |

These figures are the output of the application's pipeline and are what the live demo shows. A finished copy ships in [`sahab-api/seed/riyadh-2025-05-15/`](sahab-api/seed/riyadh-2025-05-15) (run record, all blocks, map layers and the standalone map), which is the example output of the pipeline.

**Honest reading.** Riyadh is mostly desert and the usable part of the scene is small: 54% of it is cloud and only 18.9% of pixels are valid, so the block statistics cover that fraction. The modelled cooling effect of adding trees is small (about 0.5 °C) and its interval is wide; the model is saying the effect is hard to separate from noise at this scale, so we use cooling for relative prioritisation, not as a promise. The classifier cannot output water or dark asphalt because the Riyadh scene contains neither, so the cool-roof rule never triggers there.

## What the app does

| Page | What you can do |
|---|---|
| **Dashboard** | Priority map with Risk, Materials, Temperature and Change layers; ranked table with filters and CSV export; action and risk charts; Sentinel-2 trend; block detail panel (risk bar, material breakdown, cooling with uncertainty, rationale, comparison with the city average); standalone HTML map download |
| **Run Analysis** | Pick a city or draw an area, see the open Tanager scenes over it with thumbnails and footprints, choose block size and options, watch live progress, cancel |
| **Agent Chat** | Four agents in sequence: intent parser (Gemini), data agent, insight agent (Gemini), link builder. Answers in plain language with the real numbers and deep links into the dashboard. For a city with no coverage it says so. |
| **City History** | Past runs per city, compare two runs side by side with a before/after slider |
| **About** | Method, data sources, classifier scores and limitations |

### Example input and output

Starting an analysis (what the Run Analysis page sends to the API):

```json
POST /api/v1/analysis/run
{
  "city_name": "Riyadh",
  "bbox": [46.55, 24.55, 46.85, 24.85],
  "scene_t2_id": "20250515_080954_16_4001",
  "block_size_m": 600,
  "min_valid_pct": 0.15,
  "include_landsat": true,
  "include_sentinel2": true
}
```

Output: a run summary, a ranked block list, four map layers (PNG), a standalone HTML map and a CSV export. See `sahab-api/seed/riyadh-2025-05-15/` and the live demo. Example block from the output:

```json
{ "rank": 1, "risk_score": 1.0, "action": "Tree planting", "est_cooling_c": 0.98, "cooling_ci_c": 2.01,
  "dominant_material": "Concrete/pavement", "lst_delta": 8.06,
  "materials": { "vegetation": 0.0, "asphalt": 0.0, "concrete": 1.0, "reflective_roof": 0.0, "bare_soil": 0.0 },
  "action_rationale": "Vegetation covers only 0% of this block and it runs +8.1 °C versus the scene average, so added trees give the largest modelled surface cooling." }
```

## Repository layout

```
Sahab_AI_v2_MENA_Final.ipynb   Research notebook: scene discovery, indices, classifier, cooling model
sahab-api/                     FastAPI backend (pipeline, trained models, Gemini agent chat)
  pipeline/                    Loader, masks, indices, classifier, Landsat, Sentinel-2, risk, cooling, exporter
  artifacts/                   Trained models from the notebook (.joblib) and their scores
  seed/riyadh-2025-05-15/      Finished Riyadh analysis shipped with the app (example output)
  data/                        Index of the open Tanager catalogue
  requirements.txt             Pinned Python dependencies
frontend/                      React dashboard (Create React App, Tailwind, Leaflet, Recharts)
deploy/, docker-compose.yml    Docker and AWS EC2 deployment (see DEPLOY.md)
```

## Run it yourself

**Notebook.** Python 3.11 to 3.13. Needs internet access: it downloads two Tanager scenes (about 1.9 GB in total) and queries the Planetary Computer, and a full run takes a while because the SVM and cross-validation steps are slow on a laptop.

```bash
pip install -r sahab-api/requirements.txt jupyterlab
jupyter lab Sahab_AI_v2_MENA_Final.ipynb
```

**Backend and frontend.**

```bash
# backend
cd sahab-api
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # add GEMINI_API_KEY for the chat
uvicorn main:app --port 8000

# frontend (new terminal)
cd frontend
npm install
npm start                                              # http://localhost:3000 (or 3001)
```

The dashboard opens on the built-in Riyadh analysis without downloading anything. A new analysis downloads the scene (about 1 GB, cached) and takes about 2 to 4 minutes. The Agent Chat needs a Gemini API key; the rest of the app works without one. API reference: [`sahab-api/README.md`](sahab-api/README.md). AWS EC2 deployment with Docker: [`DEPLOY.md`](DEPLOY.md).

## What is measured and what is modelled

| Item | In the application | In the notebook's saved run |
|---|---|---|
| Surface temperature | Measured by Landsat 8/9 (`lwir11`) | The saved run fell back to a **modelled** surface (mean 55 °C) because the Landsat request used a band name that does not exist on the Planetary Computer; the notebook's temperature-based numbers (correlations r = +0.62 and −0.59, cooling model) are therefore not Landsat-based |
| Exposure | Built-up share of each block, from the classified imagery (a proxy) | A synthetic density gradient |
| Scene pair | One real scene (Riyadh) | The first scene id points to a scene in Vietnam, so its change maps are not meaningful; the text calls the Riyadh scene "Abu Dhabi" |
| Multi-city map | One city, real results | The Cairo and Riyadh rows are simulated for demonstration, as the notebook's own uncertainty statement says |
| Material classifier | Saved ensemble from the notebook | Trained on the Riyadh scene (the scores above) |

The classifier and its scores come from the notebook and are real for the scene they were trained on. The application corrects the temperature, exposure and multi-city items above, and it is the source of the figures in the Results section.

## Limitations

- **One analysed city**, because open Tanager coverage is limited. The method is city-agnostic, but its accuracy on other cities is untested, and the saved classifier knows only the five classes present in the Riyadh scene.
- **Seed-label validation.** Scores measure agreement with rules, not field accuracy (see above).
- **Surface temperature, not air temperature or perceived heat.** The Landsat product is a 12-month median of clear scenes, so it shows where surfaces are relatively hotter, not a peak-summer reading.
- **Exposure is a proxy.** WorldPop population rasters are not integrated yet.
- **Modelled cooling is uncertain.** Treat it as a ranking aid.
- **Small usable area** in the Riyadh scene (cloud and no-data).
- This is a screening and prioritisation tool, not a replacement for field surveys.

## Business case and path to MVP

**Users:** municipal sustainability and planning departments, environment and climate agencies, and urban consultants and developers who need evidence for green-infrastructure investment.

**Service:** an annual monitoring subscription: an updated heat-risk map each summer from the latest Tanager or 813 satellite data, a ranked action list for the coming budget cycle, year-on-year comparison to track past interventions, and a multi-city dashboard for national agencies. The pipeline is city-agnostic: a new city needs a bounding box and a scene.

**SDG alignment:** SDG 11 (Sustainable Cities), SDG 13 (Climate Action), SDG 3 (Good Health).

**Why 813-class hyperspectral data matters:** the SWIR-2 and red-edge bands that separate surface materials are absent from every multispectral satellite in operation.

**Path to MVP during incubation:**
1. Replace rule-seeded labels with 20 to 30 field-verified material samples per city.
2. Integrate WorldPop rasters for real population exposure.
3. Get multi-date hyperspectral coverage (813 satellite or commercial Tanager) to switch on change detection and year-on-year monitoring.
4. Build a seasonal Landsat compositing step (peak-summer temperature).
5. Pilot with one municipality and collect feedback on ranking quality.

## Credits and licences

- Tanager imagery © Planet Labs PBC, CC-BY-4.0, from the open Tanager core imagery catalogue.
- Landsat 8/9 courtesy of USGS and NASA; Sentinel-2 contains modified Copernicus Sentinel data; both accessed through the Microsoft Planetary Computer.
- Map data © OpenStreetMap contributors.
- The Agent Chat uses the Google Gemini API.
- No credentials are stored in this repository. Secrets such as the Gemini key live in an untracked `.env` file (see `sahab-api/.env.example`).

**Team Abyssinia**, Arab Youth Space Hackathon 2026.
