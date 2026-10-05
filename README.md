# Sahab AI

Urban heat risk and intervention prioritization from satellite data (Tanager, Sentinel-2, Landsat).
Built by Team Abyssinia for the Arab Youth Space Hackathon 2026.

## Frontend

React (Create React App) + Tailwind CSS + Leaflet + Recharts.

```bash
cd frontend
cp .env.example .env   # leave REACT_APP_API_URL empty to use built-in demo data
npm install
npm start
```

Set `REACT_APP_API_URL` to the FastAPI backend URL to use real results.
