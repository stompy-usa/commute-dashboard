# Commute Traffic Dashboard

Automated weekday snapshots of the best driving route between home and office,
with alternatives, rendered on a static map dashboard. Runs entirely on
GitHub's free tier: GitHub Actions cron fetches routes from the TomTom Routing
API; GitHub Pages serves the dashboard; an optional email digest ships the
recommended route to your inbox.

Live site: <https://stompy-usa.github.io/commute-dashboard/>

## How it works

1. A scheduled GitHub Action fires every 5 minutes during both commute windows
   on US workdays (weekends and federal holidays skipped):
   - **Morning (home → office):** 5:45, 5:50, … 6:30 ET
   - **Evening (office → home):** 3:15, 3:20, … 4:00 PM ET
2. `scripts/slot_guard.py` gates each firing — the GitHub cron schedule covers
   both EST and EDT in UTC, and the guard rejects off-slot wakeups, weekends,
   holidays, and already-captured slots.
3. `scripts/fetch_routes.py` calls TomTom's Routing API for the primary route
   plus two alternatives with live traffic. Direction (home→office or
   office→home) is derived from the slot, or overridden by the manual-dispatch
   `period` input.
4. Each snapshot is committed to `docs/data/YYYY/MM/DD/HHMM.json`.
   `docs/data/latest.json` always points at the most recent one.
5. The static dashboard under `docs/` reads `docs/data/latest.json` and renders
   all three routes on a Leaflet map (CARTO Dark Matter tiles). Tapping a
   route card zooms the map to that route and opens a turn-by-turn directions
   panel.
6. On the final slot of each window (6:30 AM and 4:00 PM ET),
   `scripts/send_email.py` emails a plain-text digest of the fastest route
   plus a link to the live dashboard. Manual `workflow_dispatch` runs also
   email so the path can be tested end-to-end.

## Dashboard UI

- **Desktop:** three-pane layout — sidebar with summary + route cards, map in
  the center, turn-by-turn directions slide-in on the right when a route is
  selected.
- **Mobile:** map is the primary view. Compact horizontal card strip at the
  top; a bottom sheet with directions peeks at the bottom and expands to ~70%
  of the viewport when tapped.
- **Morning trend badge:** compares today's 5:45–6:30 ET snapshots and shows
  whether today's commute is trending worse or better than the prior snapshot.
- **Checkered flag marker** indicates the destination, so the route direction
  is unambiguous.

## One-time setup

### 1. TomTom API key

Sign up at <https://developer.tomtom.com/> and create a Routing API key. The
free tier allows 2,500 requests/day; this project uses ~60/day (20 slots × 3
routes per slot, across both windows).

### 2. GitHub repo

Push to a **public** GitHub repo (Pages on private repos requires a paid
plan). Secrets stay in Actions Secrets — only derived route JSON is committed.

### 3. Secrets

**Settings → Secrets and variables → Actions → New repository secret:**

| Name             | Required | Purpose |
| ---------------- | -------- | ------- |
| `TOMTOM_API_KEY` | yes      | TomTom Routing API key |
| `HOME_COORDS`    | yes      | `lat,lon` of your home |
| `OFFICE_COORDS`  | yes      | `lat,lon` of your office |
| `SMTP_USER`      | optional | SMTP username (e.g. Gmail address) for email digest |
| `SMTP_PASSWORD`  | optional | SMTP password / app password |
| `EMAIL_TO`       | optional | recipient address (or carrier SMS gateway, e.g. `5551234567@txt.att.net`) |
| `SMTP_HOST`      | optional | defaults to `smtp.gmail.com` |
| `SMTP_PORT`      | optional | defaults to `587` |
| `DASHBOARD_URL`  | optional | overrides the link included in the email |

If the SMTP secrets are omitted, the email step will fail — but snapshots and
the dashboard keep working. Set all three (`SMTP_USER`, `SMTP_PASSWORD`,
`EMAIL_TO`) to enable the digest.

### 4. Enable GitHub Pages

**Settings → Pages → Build and deployment → Source: Deploy from a branch**,
Branch: `main`, Folder: `/docs`. Pages publishes at
`https://<your-user>.github.io/<repo-name>/`.

### 5. Grant the workflow write permission

**Settings → Actions → General → Workflow permissions → Read and write
permissions**. Required so the workflow can commit new snapshots.

## Manual runs

**Actions → Commute snapshot → Run workflow:**

- `force` — bypass the slot/workday guard (use for testing outside commute
  windows, weekends, or holidays).
- `period` — direction override for forced runs: `auto` (derive from current
  time), `home-to-office`, or `office-to-home`.

Manual runs email the digest too, so they double as an end-to-end test of the
email path.

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

The dashboard loads `data/latest.json` relative to `docs/`, so
`docs/data/latest.json` must exist before the page renders.

## File layout

```
.github/workflows/snapshot.yml   scheduled + manual workflow
scripts/fetch_routes.py          calls TomTom, writes snapshot JSON
scripts/slot_guard.py            gates the run to real ET slots / workdays
scripts/holiday_check.py         US federal holiday check
scripts/send_email.py            emails the fastest-route digest
docs/                            static dashboard (served by Pages)
docs/data/                       committed snapshots (inside docs/ so Pages serves them)
```
