# Northwest Workforce Dashboard

Utilisation & retention view for SRG Global's workforce supporting the four
Northwest iron-ore majors: **Fortescue, Rio Tinto, BHP, Roy Hill/Hancock**.

Sibling to the Southwest Shutdowns dashboard, but this region is too
high-volume for shutdown-by-shutdown reporting — so the lens is
**month-by-month retention and utilisation by position and by client**.

## What's on the dashboard

| Section | What it shows |
|---|---|
| 01 — Key metrics | Active workforce · Avg hrs/worker (trailing 3mo) · Forward committed (next 3mo) · New starts this month · Churn rate · At-risk dropoffs |
| 02 — Retention & utilisation matrix | Top 20 positions × 7 months (3 back, current, 3 forward). Cell tint = month-over-month retention % |
| 02b — Position flow | Per-position headcount, 7-month trend sparkline, new/drops per month, churn rate. Click a row for the per-client split |
| 03 — By client | Same matrix scoped to each major (collapsible) |
| 04 — At-risk dropoffs | Workers with trailing 3mo avg ≥ 120h AND next-month committed ≤ 40h. CSV export. Click a name for worker drill-down |
| 05 — Utilisation trend | Line chart of avg hours/worker per client + overall |
| 06 — New starts vs drop-offs | Grouped bar chart + churn rate overlay |
| Worker page | Per-worker hours history, client timeline, month-by-month breakdown |

Filters (client, position, hide-zero-hour) apply to every section and are
encoded in the URL hash so views are shareable.

## Metric definitions

- **Retention %** (position `p`, month `m`, optional client `c`) —
  `|workers present in m-1 and m for p[,c]| / |workers present in m-1 for p[,c]|`.
  Undefined when prior month has zero headcount.
- **Avg hours / worker / month (trailing 3mo)** — total hours across months
  m-3..m-1 divided by (distinct workers with any hours in the window × 3).
  Off-months count as zero, so the metric reflects consistency as well as
  peak intensity.
- **Forward committed hours** — sum of `hours` over future months where
  `committed = true`.
- **Headcount (month m[, client c])** — distinct workers with `hours > 0` or
  `committed` in that month.
- **New start (month m)** — worker whose `employment_start` falls in `m`.
- **Drop-off (month m)** — worker with hours > 0 in `m` but no hours and no
  committed work in `m+1 … m+3` (terminal for the visible window).
- **Churn rate (month m)** — drops(m) / headcount(m-1). Trailing-3mo churn
  averages the last 3 monthly values.
- **At-risk** — trailing-3mo avg ≥ 120h AND next-month committed ≤ 40h.

## Run locally

```bash
pip install -r scripts/requirements.txt

# Build whichever data source is available
python3 scripts/build_dashboard_data.py

# Serve the static dashboard
python3 -m http.server 8000
# → open http://localhost:8000
```

To force the mock path, leave `data/raw/` empty. To exercise the real
parser, drop a `Rapidcrews Macro Data.xlsx` into `data/raw/` and rerun.

No backend, no build step. Everything is static HTML + vanilla JS +
Chart.js loaded from a CDN.

## Data pipeline

`scripts/build_dashboard_data.py` is the single entry point:

1. If `data/raw/Rapidcrews Macro Data.xlsx` exists, run
   `scripts/parse_macro_data.py` — reads the same workbook the Southwest
   Shutdowns dashboard uses, filters to the four NW majors (Fortescue,
   Rio Tinto, BHP, Roy Hill/Hancock), aggregates the daily
   `xpbi02 PersonnelRosterView` rows into monthly hours per worker/client.
2. Otherwise, run `scripts/seed_workforce.py` — deterministic mock data so
   the dashboard stays demo-able before a real workbook has been dropped in.

Both paths produce the same JSON schema, so the frontend doesn't care which
branch ran.

### Hooking up Power Automate

The Southwest dashboard's existing Power Automate flow already drops
`Rapidcrews Macro Data.xlsx` into the Southwest repo's `data/raw/`. To fire
this repo at the same time, duplicate the "Create file" step in that flow:

| Field | Value |
|---|---|
| Repository owner | `n01dea5` |
| Repository name | `Northwest-Workforce` |
| Branch | `main` |
| File path | `data/raw/Rapidcrews Macro Data.xlsx` |
| File content | *(same as Southwest step)* |

Pushing the workbook to `data/raw/` triggers `.github/workflows/refresh-data.yml`,
which runs the orchestrator, commits the refreshed JSON, and serves the
updated dashboard on the next page load. No secrets, no API keys — the GitHub
connector already has write access.

### Shift → hours

Each row in `xpbi02 PersonnelRosterView` becomes hours for that worker/month:

| Schedule Type | Hours credited |
|---|---|
| Day Shift   | 12 |
| Night Shift | 12 |
| RNR         | 0 (rest day on-swing; worker still counts as rostered) |
| anything else | row is ignored |

A row is also ignored if `IsOnLocation` is explicitly false, or if the
`Client` column doesn't map to one of the four majors (aliases for
"FMG", "Rio Tinto", "BHP WAIO", "Roy Hill", "Hancock" are recognised).

### Seed fallback

v1 uses a deterministic Python seed (`scripts/seed_workforce.py`) that
produces:

```
data/workforce.json      # full dataset (all 420 workers)
data/fortescue.json      # pre-filtered per client
data/rio-tinto.json
data/bhp.json
data/roy-hill.json
```

The `refresh-data.yml` GitHub Actions workflow regenerates these files on
push and can be triggered manually. When a real data source (Rapidcrews,
SharePoint, SAP etc.) is wired in later, it slots into the seed's place —
the JSON schema becomes the stable contract.

### JSON shape

```jsonc
{
  "generated_at": "2026-04-24",
  "current_month": "2026-04",
  "reporting_months": ["2026-01", ..., "2026-07"],
  "months_behind": 3,
  "months_ahead": 3,
  "positions_top20": ["Boilermaker", ...],
  "clients": ["Fortescue", "Rio Tinto", "BHP", "Roy Hill/Hancock"],
  "workers": [
    {
      "id": "w-janesmith",
      "name": "Jane Smith",
      "position": "Boilermaker",
      "primary_client": "Fortescue",
      "employment_start": "2024-06-01",
      "employment_end": null,
      "monthly": {
        "2026-01": { "client": "Fortescue", "hours": 168, "committed": false },
        "2026-04": { "client": "BHP",       "hours": 160, "committed": false },
        "2026-05": { "client": "BHP",       "hours":  32, "committed": true }
      }
    }
  ]
}
```

## Project layout

```
index.html                 # dashboard
worker.html                # per-worker drill-down
assets/
  app.js                   # bootstrap, filter state, orchestration
  kpi.js                   # 6 KPI tiles
  retention-table.js       # position × month matrix (summary + per client)
  position-flow.js         # headcount / new / drops / churn table
  at-risk.js               # at-risk dropoff list + CSV export
  utilisation-chart.js     # Chart.js line trend
  churn-chart.js           # new starts vs drop-offs bar + churn-rate line
  worker.js                # worker drill-down renderer
  format.js                # shared formatters, slugs, colours
  styles.css               # SRG palette and components
scripts/
  build_dashboard_data.py  # orchestrator: Excel parser or seed fallback
  parse_macro_data.py      # Rapidcrews Macro Data.xlsx → workforce.json
  seed_workforce.py        # deterministic mock-data generator
  test_parse_macro_data.py # in-memory fixture + parser assertions
  requirements.txt
data/
  raw/                     # Power Automate drops Rapidcrews Macro Data.xlsx here
  workforce.json           # full dataset
  fortescue.json | rio-tinto.json | bhp.json | roy-hill.json
.github/workflows/
  refresh-data.yml         # regenerate data on push / manual dispatch
```
