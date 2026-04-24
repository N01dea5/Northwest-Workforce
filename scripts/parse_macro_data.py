"""Parse `Rapidcrews Macro Data.xlsx` into Northwest workforce JSON.

Consumes the same workbook the Southwest Shutdowns dashboard uses — drop the
same file into `data/raw/Rapidcrews Macro Data.xlsx` from Power Automate and
both dashboards stay in sync.

Input sheets used
-----------------
  xpbi02 PersonnelRosterView   daily roster (Personnel Id, Schedule Date,
                               Schedule Type, Client, Site, Job No, IsOnLocation)
  xll01 Personnel              worker master (Personnel Id, Given Names,
                               Surname, Primary Role, Hire Company,
                               optional Start Date)

Output
------
  data/workforce.json          canonical dashboard payload
  data/<client>.json           per-client pre-filtered payloads

Model
-----
* Current month = --current-month arg or today's month (first-of-month).
* Window = 3 months back + current + 3 months ahead (matches seed + dashboard).
* Hours per shift: Day Shift = 12h, Night Shift = 12h, RNR = 0h (rest day
  on-swing; the worker still counts as rostered).
* A row only contributes if Schedule Type is in ONSITE_TYPES and IsOnLocation
  is truthy (or missing, in which case on-site shift types are trusted).
* Each worker-month is assigned the CLIENT with the most rostered days that
  month (ties broken by name). Months with only gap/leave schedules are
  left client=null, hours=0.
* `committed=true` for any month strictly after the current month (the
  workbook is treated as authoritative for the full window).
* Top-20 positions = the 20 Primary Roles with the most rostered worker-months
  across the window. Workers whose role is outside the top 20 are folded into
  the JSON but won't appear in the summary table (same as the seed).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Iterable

try:
    import openpyxl
except ImportError:
    print("openpyxl is required: pip install openpyxl", file=sys.stderr)
    raise

from dateutil.relativedelta import relativedelta

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_EXCEL = REPO_ROOT / "data" / "raw" / "Rapidcrews Macro Data.xlsx"
DEFAULT_OUT = REPO_ROOT / "data"

CLIENTS = ["Fortescue", "Rio Tinto", "BHP", "Roy Hill/Hancock"]

# Known aliases → canonical client name. Client values in the workbook are
# messy (they include site qualifiers, joint-venture names, etc.), so we
# match by substring on a normalised key.
CLIENT_ALIASES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bfmg\b|fortescue"), "Fortescue"),
    (re.compile(r"\brio\b|rtio|hamersley"), "Rio Tinto"),
    (re.compile(r"\bbhp\b|wa iron ore|\bwaio\b"), "BHP"),
    (re.compile(r"roy hill|hancock"), "Roy Hill/Hancock"),
]

CLIENT_FILE_SLUG = {
    "Fortescue": "fortescue",
    "Rio Tinto": "rio-tinto",
    "BHP": "bhp",
    "Roy Hill/Hancock": "roy-hill",
}

ONSITE_TYPES = {"Day Shift", "Night Shift", "RNR"}
HOURS_PER_SHIFT = {"Day Shift": 12, "Night Shift": 12, "RNR": 0}

MONTHS_BEHIND = 3
MONTHS_AHEAD = 3
TOP_POSITIONS = 20

# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------

def _norm_text(v) -> str:
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v)).strip()


def _norm_name(v) -> str:
    return re.sub(r"[^a-z0-9]", "", _norm_text(v).lower())


def _classify_client(raw) -> str | None:
    key = _norm_text(raw).lower()
    if not key:
        return None
    for pat, canonical in CLIENT_ALIASES:
        if pat.search(key):
            return canonical
    return None


def _coerce_date(v) -> date | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _truthy(v) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip().lower()
    return s in {"true", "yes", "y", "1", "t"}


def _month_key(d: date) -> str:
    return d.strftime("%Y-%m")


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def _pick_header(headers: list[str], *candidates: str) -> int | None:
    """Locate the first matching column header, case-insensitive, whitespace-
    and punctuation-insensitive."""
    def key(s: str) -> str:
        return re.sub(r"[\s_\-]+", "", s.lower())
    index = {key(h): i for i, h in enumerate(headers)}
    for c in candidates:
        if key(c) in index:
            return index[key(c)]
    return None


# ---------------------------------------------------------------------------
# parser core
# ---------------------------------------------------------------------------

@dataclass
class RosterRow:
    personnel_id: str
    schedule_date: date
    schedule_type: str
    client: str
    job_no: str | None


@dataclass
class WorkerMaster:
    personnel_id: str
    name: str
    primary_role: str
    hire_company: str | None
    start_date: date | None


def _read_headers(ws) -> tuple[list[str], Iterable]:
    it = ws.iter_rows(values_only=True)
    try:
        header_row = next(it)
    except StopIteration:
        return [], iter([])
    headers = [_norm_text(c) for c in header_row]
    return headers, it


def read_roster(wb) -> list[RosterRow]:
    if "xpbi02 PersonnelRosterView" not in wb.sheetnames:
        raise ValueError(
            "Workbook missing sheet 'xpbi02 PersonnelRosterView' — "
            f"have {wb.sheetnames!r}"
        )
    ws = wb["xpbi02 PersonnelRosterView"]
    headers, it = _read_headers(ws)
    i_pid = _pick_header(headers, "Personnel Id", "PersonnelId", "Personnel ID")
    i_dt = _pick_header(headers, "Schedule Date", "ScheduleDate", "Date")
    i_type = _pick_header(headers, "Schedule Type", "ScheduleType", "Shift Type")
    i_client = _pick_header(headers, "Client", "Company")
    i_job = _pick_header(headers, "Job No", "JobNo", "Job Number")
    i_on = _pick_header(headers, "IsOnLocation", "Is On Location", "On Location", "OnSite")

    if None in (i_pid, i_dt, i_type, i_client):
        raise ValueError(
            "RosterView is missing one of Personnel Id / Schedule Date / "
            f"Schedule Type / Client. Headers: {headers!r}"
        )

    out: list[RosterRow] = []
    for row in it:
        if row is None:
            continue
        pid = _norm_text(row[i_pid])
        if not pid:
            continue
        d = _coerce_date(row[i_dt])
        if d is None:
            continue
        stype = _norm_text(row[i_type])
        if stype not in ONSITE_TYPES:
            continue
        # If IsOnLocation is present and explicitly falsy, skip. If it's
        # missing we trust the on-site schedule type.
        if i_on is not None and row[i_on] is not None and not _truthy(row[i_on]):
            continue
        client = _classify_client(row[i_client])
        if client is None:
            continue  # not one of the four NW majors
        job_no = _norm_text(row[i_job]) if i_job is not None else None
        out.append(RosterRow(pid, d, stype, client, job_no or None))
    return out


def read_personnel(wb) -> dict[str, WorkerMaster]:
    if "xll01 Personnel" not in wb.sheetnames:
        return {}
    ws = wb["xll01 Personnel"]
    headers, it = _read_headers(ws)
    i_pid = _pick_header(headers, "Personnel Id", "PersonnelId", "Personnel ID")
    i_given = _pick_header(headers, "Given Names", "First Name", "GivenNames")
    i_surname = _pick_header(headers, "Surname", "Last Name", "Family Name")
    i_full = _pick_header(headers, "Full Name", "Name")
    i_role = _pick_header(headers, "Primary Role", "PrimaryRole", "Role", "Trade")
    i_hire = _pick_header(headers, "Hire Company", "HireCompany", "Company")
    i_start = _pick_header(headers, "Start Date", "StartDate", "Hire Date", "Employment Start")

    out: dict[str, WorkerMaster] = {}
    for row in it:
        if row is None:
            continue
        pid = _norm_text(row[i_pid]) if i_pid is not None else ""
        if not pid:
            continue
        if i_full is not None and row[i_full]:
            name = _norm_text(row[i_full])
        else:
            given = _norm_text(row[i_given]) if i_given is not None else ""
            surname = _norm_text(row[i_surname]) if i_surname is not None else ""
            name = f"{given} {surname}".strip() or pid
        role = _norm_text(row[i_role]) if i_role is not None else ""
        hire = _norm_text(row[i_hire]) if i_hire is not None else ""
        start = _coerce_date(row[i_start]) if i_start is not None else None
        out[pid] = WorkerMaster(pid, name, role, hire or None, start)
    return out


# ---------------------------------------------------------------------------
# aggregation
# ---------------------------------------------------------------------------

def build_months(current: date) -> list[date]:
    first = _month_start(current) - relativedelta(months=MONTHS_BEHIND)
    return [first + relativedelta(months=i) for i in range(MONTHS_BEHIND + 1 + MONTHS_AHEAD)]


@dataclass
class WorkerAgg:
    master: WorkerMaster
    # (month_key) -> (client -> {"days": int, "hours": int})
    buckets: dict[str, dict[str, dict]] = field(default_factory=lambda: defaultdict(lambda: defaultdict(lambda: {"days": 0, "hours": 0})))
    # Earliest schedule date seen; used as employment_start fallback.
    first_seen: date | None = None


def aggregate(
    roster: list[RosterRow],
    personnel: dict[str, WorkerMaster],
    months: list[date],
    current_month: date,
) -> dict[str, WorkerAgg]:
    start = months[0]
    end = months[-1] + relativedelta(months=1) - relativedelta(days=1)

    aggs: dict[str, WorkerAgg] = {}
    for r in roster:
        if r.schedule_date < start or r.schedule_date > end:
            continue
        master = personnel.get(r.personnel_id) or WorkerMaster(
            personnel_id=r.personnel_id,
            name=r.personnel_id,
            primary_role="Unknown",
            hire_company=None,
            start_date=None,
        )
        a = aggs.setdefault(r.personnel_id, WorkerAgg(master=master))
        if a.first_seen is None or r.schedule_date < a.first_seen:
            a.first_seen = r.schedule_date
        mk = _month_key(r.schedule_date)
        bucket = a.buckets[mk][r.client]
        bucket["days"] += 1
        bucket["hours"] += HOURS_PER_SHIFT.get(r.schedule_type, 0)
    return aggs


def dominant_client_per_month(agg: WorkerAgg, month_key: str) -> tuple[str | None, int]:
    """Return (client, hours) for the month. Client is the one with most
    rostered days; hours is the sum across all clients that month (so workers
    who split between clients aren't double-counted)."""
    by_client = agg.buckets.get(month_key) or {}
    if not by_client:
        return None, 0
    client = max(by_client.items(), key=lambda kv: (kv[1]["days"], kv[0]))[0]
    hours = sum(v["hours"] for v in by_client.values())
    return client, hours


def pick_primary_client(agg: WorkerAgg) -> str:
    counter: Counter[str] = Counter()
    for month in agg.buckets.values():
        for client, v in month.items():
            counter[client] += v["days"]
    if not counter:
        return agg.master.hire_company and _classify_client(agg.master.hire_company) or "Fortescue"
    return counter.most_common(1)[0][0]


def pick_top_positions(aggs: dict[str, WorkerAgg]) -> list[str]:
    counter: Counter[str] = Counter()
    for a in aggs.values():
        role = a.master.primary_role or "Unknown"
        # Count distinct worker-months, not just workers, so higher-volume
        # positions bubble up.
        counter[role] += sum(1 for m in a.buckets.values() if m)
    return [role for role, _ in counter.most_common(TOP_POSITIONS)]


# ---------------------------------------------------------------------------
# payload assembly
# ---------------------------------------------------------------------------

def worker_payload(
    agg: WorkerAgg,
    months: list[date],
    current_month: date,
) -> dict:
    mk_months = [_month_key(m) for m in months]
    cur_key = _month_key(current_month)
    cur_idx = mk_months.index(cur_key)

    monthly: dict[str, dict] = {}
    for i, mk in enumerate(mk_months):
        client, hours = dominant_client_per_month(agg, mk)
        is_future = i > cur_idx
        monthly[mk] = {
            "client": client,
            "hours": hours,
            "committed": is_future,
        }

    primary_client = pick_primary_client(agg)
    employment_start = agg.master.start_date or agg.first_seen or months[0]

    return {
        "id": "w-" + _norm_name(agg.master.name)[:14],
        "name": agg.master.name,
        "position": agg.master.primary_role or "Unknown",
        "primary_client": primary_client,
        "employment_start": employment_start.isoformat(),
        "employment_end": None,
        "monthly": monthly,
    }


def dedupe_ids(workers: list[dict]) -> list[dict]:
    seen: set[str] = set()
    for w in workers:
        base = w["id"]
        cand = base
        n = 1
        while cand in seen:
            n += 1
            cand = f"{base}{n}"
        seen.add(cand)
        w["id"] = cand
    return workers


def build_payload(excel_path: Path, current_month: date) -> dict:
    wb = openpyxl.load_workbook(excel_path, data_only=True, read_only=True)
    roster = read_roster(wb)
    personnel = read_personnel(wb)
    months = build_months(current_month)
    aggs = aggregate(roster, personnel, months, current_month)

    top_positions = pick_top_positions(aggs)
    # If the workbook lacks enough roles, pad with an empty placeholder so
    # the dashboard's top-20 table still renders.
    while len(top_positions) < TOP_POSITIONS:
        top_positions.append(f"(Unassigned {len(top_positions) + 1})")

    workers = dedupe_ids(
        sorted(
            (worker_payload(a, months, current_month) for a in aggs.values()),
            key=lambda w: w["name"],
        )
    )

    return {
        "generated_at": date.today().isoformat(),
        "current_month": _month_key(current_month),
        "reporting_months": [_month_key(m) for m in months],
        "months_behind": MONTHS_BEHIND,
        "months_ahead": MONTHS_AHEAD,
        "positions_top20": top_positions[:TOP_POSITIONS],
        "clients": CLIENTS,
        "workers": workers,
    }


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=False), encoding="utf-8")


def write_outputs(payload: dict, out_dir: Path) -> None:
    write_json(out_dir / "workforce.json", payload)
    for client in CLIENTS:
        slug = CLIENT_FILE_SLUG[client]
        filtered = [
            w for w in payload["workers"]
            if any(m.get("client") == client for m in w["monthly"].values())
        ]
        per_client = dict(payload)
        per_client["workers"] = filtered
        per_client["scoped_client"] = client
        write_json(out_dir / f"{slug}.json", per_client)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_current_month(s: str | None) -> date:
    if not s:
        return _month_start(date.today())
    return _month_start(datetime.strptime(s, "%Y-%m").date())


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--excel", type=Path, default=DEFAULT_EXCEL)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument(
        "--current-month",
        default=None,
        help="YYYY-MM; defaults to this month.",
    )
    args = ap.parse_args(argv)

    if not args.excel.exists():
        print(f"Excel not found: {args.excel}", file=sys.stderr)
        return 2

    payload = build_payload(args.excel, parse_current_month(args.current_month))
    write_outputs(payload, args.out)
    print(
        f"Parsed {len(payload['workers'])} workers "
        f"across {len(payload['reporting_months'])} months → {args.out}"
    )
    for client in CLIENTS:
        slug = CLIENT_FILE_SLUG[client]
        n = len(json.loads((args.out / f"{slug}.json").read_text())["workers"])
        print(f"  {client:20s} → {slug}.json ({n} workers)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
