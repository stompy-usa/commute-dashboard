# Commute Traffic Dashboard

Automated weekday-morning snapshots of the best driving route from home to the
office, with alternatives, rendered on a static map dashboard. Runs entirely on
GitHub's free tier: GitHub Actions cron fetches routes from the TomTom Routing
API; GitHub Pages serves the dashboard.

## How it works

1. A scheduled GitHub Action fires four times each weekday morning (5:45, 6:00,
   6:15, 6:30 America/New_York), skipping US federal holidays.
2. The action calls TomTom's Routing API for the primary route plus two
   alternatives, with live traffic.
3. Each snapshot is committed to `data/YYYY/MM/DD/HHMM.json`. `data/latest.json`
   always points at the most recent snapshot.
4. The static dashboard under `docs/` reads `data/latest.json` and renders the
   routes on a Leaflet map with OpenStreetMap tiles.

## One-time setup

### 1. TomTom API key

Sign up at <https://developer.tomtom.com/> and create an API key for the
Routing API. The free tier allows 2,500 requests/day — this project uses at
most 4/day.

### 2. GitHub repo

Push this directory to a new GitHub repo (the default assumes **public** — see
the plan file for the private-repo tradeoff).

### 3. Secrets

Go to **Settings → Secrets and variables → Actions → New repository secret**
and add:

| Name              | Value                              |
| ----------------- | ---------------------------------- |
| `TOMTOM_API_KEY`  | your TomTom API key                |
| `HOME_COORDS`     | `lat,lon` of your home, e.g. `40.7128,-74.0060` |
| `OFFICE_COORDS`   | `lat,lon` of your office           |

### 4. Enable GitHub Pages

**Settings → Pages → Build and deployment → Source: Deploy from a branch**,
Branch: `main`, Folder: `/docs`. Save. Pages will publish at
`https://<your-user>.github.io/<repo-name>/`.

### 5. Grant the workflow write permission

**Settings → Actions → General → Workflow permissions → Read and write
permissions**. This lets the workflow commit new snapshots.

## Local testing

```bash
python -m venv .venv
. .venv/Scripts/activate   # Windows bash
pip install -r requirements.txt

cp .env.example .env       # edit with your values
set -a && . ./.env && set +a

python scripts/fetch_routes.py
```

Then serve the dashboard:

```bash
cd docs && python -m http.server 8000
# open http://localhost:8000
```

The dashboard loads `../data/latest.json`, so the `data/` directory must exist
next to `docs/`.

## Manual run in GitHub Actions

Go to **Actions → Commute snapshot → Run workflow** to trigger a snapshot
outside the scheduled window (useful for validating secrets and Pages).

## File layout

```
.github/workflows/snapshot.yml   scheduled workflow
scripts/fetch_routes.py          calls TomTom, writes snapshot JSON
scripts/slot_guard.py            gates the run to real ET slots / workdays
scripts/holidays.py              US federal holiday check
docs/                            static dashboard (served by Pages)
data/                            committed snapshots
```
