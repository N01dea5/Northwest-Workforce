# Northwest Workforce Dashboard

Utilisation, retention, and fatigue compliance view for SRG Global's workforce
supporting the four Northwest iron-ore majors:
**Fortescue, Rio Tinto, BHP, Roy Hill/Hancock**.

Month-by-month headcount, hours, retention, and forward bookings across a
7-month reporting window (3 months back, current month, 3 months forward).

---

## Pages

| Page | File | What it shows |
|---|---|---|
| **Utilisation** | `index.html` | Active workforce · Total engaged · Avg hrs/worker · Forward committed · Position × month matrix · By-client tables · Trend chart |
| **Retention** | `retention.html` | New starts · Drop-offs · Churn rate · At-risk list · New starts vs drop-offs chart · Position flow table · Cohort survival table |
| **Fatigue** | `fatigue.html` | Breach count · Close count · Worst overage · Breach by discipline · Full 724 h rolling compliance table |
| **Worker detail** | `worker.html?id=…` | Individual hours history · Month-by-month client · Compliance flag · At-risk flag |

All pages share a sticky filter strip (client chips, position dropdown, name
search, hide-zero toggle). Filter state is encoded in the URL hash so views
can be bookmarked and shared.

---

## Metric definitions

| Metric | Definition |
|---|---|
| **Active workforce** | Workers with hours > 0 in the current month |
| **Total engaged** | Distinct workers with any hours across the full reporting window |
| **Avg hrs / worker** | Trailing 3-month: total hours ÷ (distinct workers × months). Off-months count as zero — reflects consistency, not just peak intensity |
| **Forward committed** | Sum of hours in the next 3 months where `committed = true` (confirmed / mobilising bookings only) |
| **Retention %** | Workers present in both month m−1 and month m ÷ workers in month m−1 |
| **New start** | Worker whose `employment_start` falls in month m |
| **Drop-off** | Worker with hours > 0 in month m but zero in the current month and no forward bookings |
| **Churn rate** | Drop-offs ÷ prior month headcount; trailing-3mo average on KPI tiles |
| **At-risk** | Trailing-3mo avg ≥ 120 h/month **and** next-month committed ≤ 40 h |
| **Compliance** | Worst consecutive 3-month window of hours vs 724 h limit; flagged at 652 h (90 %) |
| **Cohort survival** | % of a start-month cohort still active at +1, +2 … months after joining |

---

## Data pipeline

`scripts/parse_macro_data.py` reads `data/raw/Rapidcrews Macro Data.xlsx`
(dropped there by Power Automate) and produces `data/workforce.json` plus
one JSON file per client.

### Source sheets

| Sheet | Used for |
|---|---|
| `xpbi02 DailyPersonnelSchedule` | Primary: one row per worker per day. Provides actual historical onsite days and forward roster bookings |
| `xll01 Personnel` | Worker master: name, position, discipline, employment start |
| `xpbi02 DisciplineTrade` | Discipline lookup for position grouping |

### Row filtering (DailyPersonnelSchedule)

1. **Hard-exclude** rows with status `rejected`, `declined`, or `late withdrawal`.
2. **Active flag** — rows with `jobActive = false` are skipped.
3. **OnSite flag** — rows with `OnSite = false` are skipped **unless** the date
   is in the future **and** the status is `mobilising` or `confirmed`. This
   allows forward bookings (which haven't happened yet, so OnSite is 0) to
   appear in the forward months. Soft statuses (`contacted`, `planning`,
   `short list`) are excluded for future dates — they represent intent,
   not committed shifts.

### Hours per row

All rows that pass filtering are credited **12 h/shift** regardless of status
(`onsite`, `demobilised`, `mobilising`, `confirmed`). There is no Schedule Type
column in this sheet; 12 h is the standard iron-ore shift length.

### Post-processing rules

| Rule | What it does |
|---|---|
| **13-day stand-down** | Scans each worker's working days in date order. When a consecutive run reaches day 14, that day is zeroed out and the streak resets. This represents the mandatory fatigue rest after 13 consecutive days. |
| **Full-calendar halving** | If a worker has a roster entry for every calendar day of a month, their hours for that month are halved (÷ 2). These workers are assumed to be on a continuous-availability maintenance contract with ~50 % actual on-site attendance. |
| **Dominant-client attribution** | A worker's monthly hours are attributed to whichever client had the most rostered days that month. Workers split across clients in a month are not double-counted. |

### Fallback seed

When no Excel file is present, `scripts/seed_workforce.py` generates
deterministic mock data. Both paths produce the same JSON schema.

---

## Running locally

```bash
pip install -r scripts/requirements.txt

# Parse real data (requires data/raw/Rapidcrews Macro Data.xlsx)
python3 scripts/parse_macro_data.py

# Or generate mock data
python3 scripts/seed_workforce.py

# Serve
python3 -m http.server 8000
# → open http://localhost:8000
```

No backend, no build step. Everything is static HTML + vanilla JS +
Chart.js from a CDN.

---

## Hooking up Power Automate

Duplicate the "Create file" step from the Southwest Shutdowns flow:

| Field | Value |
|---|---|
| Repository | `n01dea5 / Northwest-Workforce` |
| Branch | `main` |
| File path | `data/raw/Rapidcrews Macro Data.xlsx` |
| File content | *(same as Southwest step)* |

Pushing the workbook triggers `.github/workflows/refresh-data.yml`, which
runs the parser, commits the refreshed JSON, and serves the updated dashboard
on the next page load.

---

## Project layout

```
index.html                  # Utilisation page
retention.html              # Retention page
fatigue.html                # Fatigue & compliance page
worker.html                 # Per-worker drill-down

assets/
  boot.js                   # Shared page bootstrap (filter state, hash sync, stale banner)
  app.js                    # Utilisation page render orchestration
  retention-app.js          # Retention page render orchestration
  fatigue-app.js            # Fatigue page render orchestration
  worker-app.js             # Worker detail page bootstrap

  format.js                 # Shared formatters, slugs, colours, and threshold constants
  kpi.js                    # KPI tile computation & rendering
  retention-table.js        # Position × month matrix (summary + per-client)
  position-flow.js          # Headcount / new / drops / churn table
  at-risk.js                # At-risk dropoff list + CSV export
  retention-cohort.js       # Cohort survival table
  compliance.js             # 724 h rolling compliance table + discipline rollup
  utilisation-chart.js      # Chart.js avg-hours trend line
  churn-chart.js            # New starts vs drop-offs bar chart + churn rate line
  styles.css                # SRG palette and all component styles

scripts/
  parse_macro_data.py       # Rapidcrews Macro Data.xlsx → workforce.json
  seed_workforce.py         # Deterministic mock-data fallback
  build_dashboard_data.py   # Orchestrator: parser if Excel present, else seed
  test_parse_macro_data.py  # Parser unit tests
  requirements.txt

data/
  raw/                      # Power Automate drops the Excel file here
  workforce.json            # Full dataset (all workers, all months)
  fortescue.json            # Pre-filtered per-client views
  rio-tinto.json
  bhp.json
  roy-hill.json

.github/workflows/
  refresh-data.yml          # Regenerates JSON on push to data/raw/ or manual dispatch
```

---

## JSON schema

```jsonc
{
  "generated_at": "2026-04-24",
  "current_month": "2026-04",
  "reporting_months": ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
  "months_behind": 3,
  "months_ahead": 3,
  "positions_top20": ["Scaffold Supervisor", "Boilermaker", ...],
  "clients": ["Fortescue", "Rio Tinto", "BHP", "Roy Hill/Hancock"],
  "workers": [
    {
      "id": "w-janesmith",
      "name": "Jane Smith",
      "position": "Boilermaker",
      "discipline": "Mechanical",
      "primary_client": "Fortescue",
      "employment_start": "2024-06-01",
      "employment_end": null,
      "monthly": {
        "2026-01": { "client": "Fortescue", "hours": 168, "committed": false },
        "2026-05": { "client": "BHP",       "hours":  96, "committed": true }
      }
    }
  ]
}
```

Months with no hours for a worker are simply absent from `monthly`.
Forward months have `committed: true`; past months have `committed: false`.
