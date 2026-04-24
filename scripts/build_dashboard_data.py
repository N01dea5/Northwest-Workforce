"""Orchestrator: build `data/workforce.json` from the best available source.

Priority:
  1. If `data/raw/Rapidcrews Macro Data.xlsx` exists, run `parse_macro_data`.
  2. Otherwise, run the deterministic `seed_workforce` mock generator.

This is the single entry point the GitHub Actions workflow invokes, which
means Power Automate dropping a fresh Excel into `data/raw/` is enough to
trigger a real refresh, without removing the seed fallback that keeps the
dashboard demo-able when no workbook is present.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EXCEL = REPO_ROOT / "data" / "raw" / "Rapidcrews Macro Data.xlsx"


def main() -> int:
    if EXCEL.exists():
        print(f"Found {EXCEL.relative_to(REPO_ROOT)} — running Excel parser.")
        from parse_macro_data import main as parse_main
        return parse_main([])
    print(
        f"No Excel at {EXCEL.relative_to(REPO_ROOT)} — falling back to "
        "seed_workforce (mock data)."
    )
    from seed_workforce import main as seed_main
    seed_main()
    return 0


if __name__ == "__main__":
    sys.exit(main())
