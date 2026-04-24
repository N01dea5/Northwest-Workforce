"""End-to-end sanity test for the Excel parser.

Builds a tiny in-memory `Rapidcrews Macro Data.xlsx` that mimics the sheets /
columns the real workbook has, runs the parser on it, and asserts the output
JSON shape.

Not framework-ed — just run `python3 scripts/test_parse_macro_data.py` and
it prints PASS / FAIL.
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

import openpyxl
from dateutil.relativedelta import relativedelta

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import parse_macro_data as pm


def _build_fixture(tmp: Path, current_month: date) -> Path:
    wb = openpyxl.Workbook()
    # Personnel sheet ----------------------------------------------------
    ws = wb.active
    ws.title = "xll01 Personnel"
    ws.append(["Personnel Id", "Given Names", "Surname", "Primary Role", "Hire Company", "Start Date"])
    people = [
        ("P001", "Jane", "Smith", "Boilermaker", "SRG", date(2024, 1, 1)),
        ("P002", "John", "Doe", "Welder", "SRG", date(2025, 10, 1)),
        ("P003", "Mary", "O'Brien", "Advanced Rigger", "LabourHire", date(2023, 5, 1)),
        # No start date — parser should fall back to first_seen
        ("P004", "Bruce", "Wayne", "Scaffolder", "SRG", None),
    ]
    for row in people:
        ws.append(list(row))

    # Roster sheet -------------------------------------------------------
    roster = wb.create_sheet("xpbi02 PersonnelRosterView")
    roster.append([
        "Personnel Id", "Schedule Date", "Schedule Type",
        "Client", "Site", "Job No", "IsOnLocation",
    ])
    # Build a window: -3, -2, -1, current, +1, +2, +3 months
    months = [current_month + relativedelta(months=i) for i in range(-3, 4)]

    def shifts(pid, month_start, n, shift="Day Shift", client="Fortescue - Christmas Creek"):
        for i in range(n):
            d = month_start + timedelta(days=i)
            roster.append([pid, d, shift, client, "Site A", "J-001", True])

    # Jane: strong trailing utilisation at Fortescue, drops off in forward
    for m in months[:4]:
        shifts("P001", m, 14, "Day Shift", "Fortescue")
    # no forward work → at-risk candidate

    # John: steady Welder at BHP across window, including forward commits
    for m in months:
        shifts("P002", m, 12, "Day Shift", "BHP WAIO")

    # Mary: Rio Tinto all the way, heavy hours
    for m in months:
        shifts("P003", m, 13, "Day Shift", "Rio Tinto - Hamersley")

    # Bruce: Roy Hill, but some rows have IsOnLocation=False (should be skipped)
    for m in months:
        shifts("P004", m, 10, "Day Shift", "Roy Hill")
    # Add some "false" attendance rows — must be filtered out
    roster.append(["P004", months[0] + timedelta(days=20), "Day Shift", "Roy Hill", "Site", "J", False])

    # Row with non-NW client should be dropped
    roster.append(["P001", months[1] + timedelta(days=1), "Day Shift", "Covalent Mt Holland", "", "J", True])
    # RNR should contribute 0 hours but still count as rostered
    roster.append(["P002", months[2] + timedelta(days=5), "RNR", "BHP", "", "J", True])
    # Non-onsite schedule type → skip
    roster.append(["P001", months[1] + timedelta(days=2), "Personal Leave", "Fortescue", "", "J", True])

    excel = tmp / "Rapidcrews Macro Data.xlsx"
    wb.save(excel)
    return excel


def _run(current_month: date):
    tmp = Path(tempfile.mkdtemp(prefix="nw-parse-test-"))
    try:
        excel = _build_fixture(tmp, current_month)
        out = tmp / "data"
        rc = pm.main([
            "--excel", str(excel),
            "--out", str(out),
            "--current-month", current_month.strftime("%Y-%m"),
        ])
        assert rc == 0, f"parser returned {rc}"

        payload = json.loads((out / "workforce.json").read_text())
        assert payload["current_month"] == current_month.strftime("%Y-%m")
        assert len(payload["reporting_months"]) == 7
        assert payload["clients"] == ["Fortescue", "Rio Tinto", "BHP", "Roy Hill/Hancock"]

        workers = {w["name"]: w for w in payload["workers"]}
        assert set(workers) == {"Jane Smith", "John Doe", "Mary O'Brien", "Bruce Wayne"}, \
            f"unexpected names: {sorted(workers)}"

        # Jane — primary client Fortescue, trailing hours > 0, future months 0
        jane = workers["Jane Smith"]
        assert jane["primary_client"] == "Fortescue"
        cur_key = payload["current_month"]
        fwd_keys = payload["reporting_months"][payload["reporting_months"].index(cur_key) + 1:]
        for fk in fwd_keys:
            assert jane["monthly"][fk]["hours"] == 0, \
                f"expected Jane to drop off, saw {jane['monthly'][fk]}"
            assert jane["monthly"][fk]["committed"] is True

        # John — BHP, forward commitments present
        john = workers["John Doe"]
        assert john["primary_client"] == "BHP"
        assert john["monthly"][fwd_keys[0]]["hours"] > 0
        assert john["monthly"][fwd_keys[0]]["committed"] is True

        # Mary — Rio Tinto consistently
        mary = workers["Mary O'Brien"]
        assert mary["primary_client"] == "Rio Tinto"
        for mk in payload["reporting_months"]:
            assert mary["monthly"][mk]["client"] == "Rio Tinto", \
                f"Mary's client wrong at {mk}"

        # Bruce — Roy Hill, employment_start backfilled from first_seen
        bruce = workers["Bruce Wayne"]
        assert bruce["primary_client"] == "Roy Hill/Hancock"
        assert bruce["employment_start"].startswith(payload["reporting_months"][0])

        # Per-client files contain the expected subsets
        fort = json.loads((out / "fortescue.json").read_text())
        fort_names = {w["name"] for w in fort["workers"]}
        assert "Jane Smith" in fort_names
        assert "Mary O'Brien" not in fort_names, "Mary only worked Rio Tinto"

        rio = json.loads((out / "rio-tinto.json").read_text())
        rio_names = {w["name"] for w in rio["workers"]}
        assert rio_names == {"Mary O'Brien"}, f"rio names: {rio_names}"

        # Top positions should include the four we seeded
        for pos in ["Boilermaker", "Welder", "Advanced Rigger", "Scaffolder"]:
            assert pos in payload["positions_top20"], \
                f"missing {pos} in top20: {payload['positions_top20']}"

        # Non-NW client (Covalent) and "Personal Leave" rows must not show up
        # in Jane's Fortescue data — a "Personal Leave" entry shouldn't have
        # added any hours.
        # Jane's Fortescue-only hours should be ~ 14 days * 12h * 4 trailing months
        trailing = payload["reporting_months"][:4]
        jane_trailing_hours = sum(jane["monthly"][m]["hours"] for m in trailing)
        assert 500 <= jane_trailing_hours <= 800, \
            f"unexpected Jane trailing hours: {jane_trailing_hours}"

        # John's RNR contributed 0h (added on top of 12 day shifts that month)
        # so his hours for that month should be exactly 12 * 12.
        john_m2 = payload["reporting_months"][2]
        assert john["monthly"][john_m2]["hours"] == 12 * 12, \
            f"RNR should not add hours, saw {john['monthly'][john_m2]}"

        print("PASS — parser produced expected workforce.json")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    # Pin the fixture around a known month so the test is deterministic.
    rc = _run(date(2026, 4, 1))
    sys.exit(rc)
