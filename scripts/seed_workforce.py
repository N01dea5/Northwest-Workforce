"""Seed generator for the Northwest Workforce dashboard.

Produces deterministic mock data for ~400 workers across the four NW majors
(Fortescue, Rio Tinto, BHP, Roy Hill/Hancock) over a 7-month window
(3 historical + current + 3 forward-committed).

Output:
  data/workforce.json          - full dataset
  data/fortescue.json          - pre-filtered per client
  data/rio-tinto.json
  data/bhp.json
  data/roy-hill.json

The per-client files contain the same worker records but only those whose
monthly[] dict references that client in at least one month in the window.
"""
from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from dateutil.relativedelta import relativedelta

SEED = 20260424
CURRENT_MONTH = date(2026, 4, 1)
MONTHS_BEHIND = 3
MONTHS_AHEAD = 3
WORKER_COUNT = 420

CLIENTS = ["Fortescue", "Rio Tinto", "BHP", "Roy Hill/Hancock"]
CLIENT_SLUG = {
    "Fortescue": "fortescue",
    "Rio Tinto": "rio-tinto",
    "BHP": "bhp",
    "Roy Hill/Hancock": "roy-hill",
}

POSITIONS_TOP20 = [
    ("Boilermaker", 0.12),
    ("Welder", 0.10),
    ("Advanced Rigger", 0.08),
    ("Scaffolder", 0.09),
    ("Trades Assistant", 0.08),
    ("Electrician", 0.06),
    ("Mechanical Fitter", 0.07),
    ("Pipefitter", 0.05),
    ("Rope Access Tech", 0.04),
    ("Supervisor", 0.04),
    ("Safety Officer", 0.03),
    ("Dogger", 0.03),
    ("EWP Operator", 0.03),
    ("Forklift Operator", 0.03),
    ("Crane Operator", 0.03),
    ("Blaster", 0.02),
    ("NDT Technician", 0.02),
    ("Planner", 0.02),
    ("Storeperson", 0.03),
    ("Leading Hand", 0.03),
]

FIRST_NAMES = [
    "Jack", "Oliver", "William", "Noah", "Jackson", "Thomas", "James", "Lucas",
    "Ethan", "Mason", "Liam", "Henry", "Charlie", "Cooper", "Hunter", "Leo",
    "Riley", "Harrison", "Archie", "Max", "Tyler", "Kai", "Zac", "Dylan",
    "Brodie", "Jayden", "Kyle", "Reece", "Mitch", "Brett", "Wayne", "Craig",
    "Darren", "Shane", "Steve", "Troy", "Glenn", "Nathan", "Ashley", "Damien",
    "Sarah", "Emma", "Olivia", "Chloe", "Sophie", "Mia", "Ella", "Grace",
    "Jessica", "Amelia", "Charlotte", "Hannah", "Lily", "Zoe", "Ruby", "Holly",
    "Kylie", "Bianca", "Stacey", "Kirsty", "Brooke", "Tara", "Danielle", "Kate",
]

LAST_NAMES = [
    "Smith", "Jones", "Williams", "Brown", "Taylor", "Wilson", "Thomas", "Clark",
    "Walker", "White", "Harris", "Martin", "Thompson", "Robinson", "Lewis",
    "Hall", "Allen", "Young", "King", "Wright", "Scott", "Green", "Baker",
    "Mitchell", "Carter", "Phillips", "Evans", "Turner", "Parker", "Campbell",
    "Edwards", "Stewart", "Morris", "Murphy", "Cook", "Rogers", "Reed", "Bailey",
    "Cooper", "Richardson", "Cox", "Ward", "Peterson", "Gray", "Ramirez",
    "James", "Watson", "Brooks", "Kelly", "Sanders", "Price", "Bennett", "Wood",
    "Barnes", "Ross", "Henderson", "Coleman", "Jenkins", "Perry", "Powell",
    "Long", "Patterson", "Hughes", "Flynn", "Sullivan", "Byrne", "O'Brien",
]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def month_list() -> list[date]:
    start = CURRENT_MONTH - relativedelta(months=MONTHS_BEHIND)
    return [start + relativedelta(months=i) for i in range(MONTHS_BEHIND + 1 + MONTHS_AHEAD)]


def month_key(d: date) -> str:
    return d.strftime("%Y-%m")


@dataclass
class Worker:
    id: str
    name: str
    position: str
    primary_client: str
    employment_start: date
    employment_end: date | None = None
    monthly: dict[str, dict] = field(default_factory=dict)


def _pick_weighted(rng: random.Random, items: list[tuple[str, float]]) -> str:
    total = sum(w for _, w in items)
    r = rng.random() * total
    acc = 0.0
    for name, w in items:
        acc += w
        if r <= acc:
            return name
    return items[-1][0]


def generate_workers(rng: random.Random) -> list[Worker]:
    months = month_list()
    current_idx = MONTHS_BEHIND
    workers: list[Worker] = []
    used_ids: set[str] = set()

    for i in range(WORKER_COUNT):
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)
        name = f"{first} {last}"

        base_id = f"w-{_norm(name)[:14]}"
        wid = base_id
        suffix = 1
        while wid in used_ids:
            suffix += 1
            wid = f"{base_id}{suffix}"
        used_ids.add(wid)

        position = _pick_weighted(rng, POSITIONS_TOP20)
        primary_client = rng.choice(CLIENTS)

        # Employment start: 60% between 2 and 5 years ago (tenured),
        # 25% in the last 12 months (newer), 15% in the last 3 months (fresh new starts).
        r = rng.random()
        if r < 0.15:
            months_back = rng.randint(0, 2)
        elif r < 0.40:
            months_back = rng.randint(3, 11)
        else:
            months_back = rng.randint(24, 60)
        employment_start = CURRENT_MONTH - relativedelta(months=months_back)

        # Churn: ~8% of workers will have an employment_end in the window
        # (worker drops off during the historical period).
        employment_end: date | None = None
        if rng.random() < 0.08:
            end_offset = rng.randint(0, MONTHS_BEHIND + 1)
            employment_end = months[current_idx - end_offset] if current_idx - end_offset >= 0 else months[0]

        monthly: dict[str, dict] = {}
        current_client = primary_client

        for idx, m in enumerate(months):
            mk = month_key(m)
            is_future = idx > current_idx
            before_start = m < date(employment_start.year, employment_start.month, 1)
            after_end = employment_end is not None and m > employment_end

            if before_start or after_end:
                monthly[mk] = {"client": None, "hours": 0, "committed": is_future}
                continue

            # 70% chance worker stays on the same client month to month
            # 15% chance to switch to a different NW client
            # 15% chance of a gap month
            roll = rng.random()
            if roll < 0.70:
                pass  # same client
            elif roll < 0.85:
                current_client = rng.choice([c for c in CLIENTS if c != current_client])
            else:
                current_client = None

            if current_client is None:
                monthly[mk] = {"client": None, "hours": 0, "committed": is_future}
                # Next month they'll likely come back on primary
                if rng.random() < 0.7:
                    current_client = primary_client
                continue

            if is_future:
                # Forward commitments decay: next month mostly booked, later months thinner
                future_offset = idx - current_idx  # 1, 2, 3
                commit_chance = [0.85, 0.55, 0.35][future_offset - 1]
                if rng.random() > commit_chance:
                    monthly[mk] = {"client": None, "hours": 0, "committed": True}
                    continue
                hours_mean = [160, 130, 100][future_offset - 1]
                hours = max(0, int(rng.gauss(hours_mean, 28)))
                monthly[mk] = {"client": current_client, "hours": hours, "committed": True}
            else:
                hours = max(0, int(rng.gauss(168, 22)))
                monthly[mk] = {"client": current_client, "hours": hours, "committed": False}

        # Tune a subset to be at-risk: high trailing hours but low forward
        if rng.random() < 0.08:
            for back_idx in range(MONTHS_BEHIND):
                bk = month_key(months[current_idx - back_idx])
                if monthly[bk]["client"] is None:
                    monthly[bk] = {
                        "client": primary_client,
                        "hours": rng.randint(150, 190),
                        "committed": False,
                    }
                else:
                    monthly[bk]["hours"] = rng.randint(150, 190)
            for fwd_idx in range(1, MONTHS_AHEAD + 1):
                fk = month_key(months[current_idx + fwd_idx])
                monthly[fk] = {"client": None, "hours": 0, "committed": True}

        workers.append(
            Worker(
                id=wid,
                name=name,
                position=position,
                primary_client=primary_client,
                employment_start=employment_start,
                employment_end=employment_end,
                monthly=monthly,
            )
        )

    # Ensure seed has at least one red-tint retention example for QA:
    # force a dramatic headcount drop in Blaster at Roy Hill/Hancock between
    # month_behind_1 and current for visual confirmation.
    target_pos = "Blaster"
    target_client = "Roy Hill/Hancock"
    target_month = month_key(months[current_idx])
    prior_month = month_key(months[current_idx - 1])
    switched = 0
    for w in workers:
        if w.position != target_pos:
            continue
        if w.monthly[prior_month]["client"] == target_client:
            if switched < 3 and rng.random() < 0.7:
                w.monthly[target_month] = {"client": None, "hours": 0, "committed": False}
                switched += 1

    return workers


def worker_to_json(w: Worker) -> dict:
    return {
        "id": w.id,
        "name": w.name,
        "position": w.position,
        "primary_client": w.primary_client,
        "employment_start": w.employment_start.isoformat(),
        "employment_end": w.employment_end.isoformat() if w.employment_end else None,
        "monthly": w.monthly,
    }


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=False), encoding="utf-8")


def main() -> None:
    rng = random.Random(SEED)
    workers = generate_workers(rng)
    months = month_list()

    payload = {
        "generated_at": date.today().isoformat(),
        "current_month": month_key(CURRENT_MONTH),
        "reporting_months": [month_key(m) for m in months],
        "months_behind": MONTHS_BEHIND,
        "months_ahead": MONTHS_AHEAD,
        "positions_top20": [p for p, _ in POSITIONS_TOP20],
        "clients": CLIENTS,
        "disciplines": sorted({w.discipline for w in workers if getattr(w, "discipline", None)}),
        "workers": [worker_to_json(w) for w in workers],
    }

    data_dir = Path(__file__).resolve().parent.parent / "data"
    write_json(data_dir / "workforce.json", payload)

    for client in CLIENTS:
        slug = CLIENT_SLUG[client]
        filtered = [
            w for w in workers
            if any(m["client"] == client for m in w.monthly.values())
        ]
        per_client = dict(payload)
        per_client["workers"] = [worker_to_json(w) for w in filtered]
        per_client["scoped_client"] = client
        write_json(data_dir / f"{slug}.json", per_client)

    print(f"Wrote {len(workers)} workers across {len(months)} months -> {data_dir}")
    for client in CLIENTS:
        slug = CLIENT_SLUG[client]
        path = data_dir / f"{slug}.json"
        n = len(json.loads(path.read_text())["workers"])
        print(f"  {client:20s} -> {path.name} ({n} workers)")


if __name__ == "__main__":
    main()
