"""Gate a snapshot run to real ET slots on US workdays.

The GitHub Actions cron schedule fires at UTC times that cover both EST and
EDT. Inside the job, we check the *current* Eastern Time against the allowed
slots (5:45, 6:00, 6:15, 6:30) with a small tolerance, and skip weekends and
US federal holidays.

Exit codes:
  0   = proceed with the snapshot (stdout: chosen ET slot like "05:45")
  10  = skip silently (weekend, holiday, or off-slot wakeup)
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from holiday_check import is_us_federal_holiday

ET = ZoneInfo("America/New_York")

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "docs" / "data"

ALLOWED_SLOTS = [
    # Morning (home -> office)
    (5, 45), (6, 0), (6, 15), (6, 30),
    # Evening (office -> home)
    (15, 15), (15, 30), (15, 45), (16, 0),
]
TOLERANCE_MIN = 7  # minutes; cron firing jitter on GitHub Actions is ~1-5 min


def already_captured(now_et: datetime, slot: str) -> bool:
    slot_name = slot.replace(":", "")
    path = DATA_DIR / f"{now_et:%Y}" / f"{now_et:%m}" / f"{now_et:%d}" / f"{slot_name}.json"
    return path.exists()


def pick_slot(now_et: datetime) -> str | None:
    for hh, mm in ALLOWED_SLOTS:
        slot_minutes = hh * 60 + mm
        now_minutes = now_et.hour * 60 + now_et.minute
        if abs(now_minutes - slot_minutes) <= TOLERANCE_MIN:
            return f"{hh:02d}:{mm:02d}"
    return None


def main() -> int:
    now_et = datetime.now(ET)

    if now_et.weekday() >= 5:
        print(f"skip: weekend ({now_et:%A})", file=sys.stderr)
        return 10

    if is_us_federal_holiday(now_et.date()):
        print(f"skip: US federal holiday ({now_et.date()})", file=sys.stderr)
        return 10

    slot = pick_slot(now_et)
    if slot is None:
        print(f"skip: off-slot ET={now_et:%H:%M}", file=sys.stderr)
        return 10

    if already_captured(now_et, slot):
        print(f"skip: slot {slot} already captured today", file=sys.stderr)
        return 10

    print(slot)
    return 0


if __name__ == "__main__":
    sys.exit(main())
