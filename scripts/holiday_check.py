"""US federal holiday check for commute snapshots.

Named `holiday_check` to avoid shadowing the PyPI `holidays` package.
"""
from __future__ import annotations

from datetime import date

import holidays


def is_us_federal_holiday(d: date) -> bool:
    cal = holidays.UnitedStates(years=d.year, observed=True)
    return d in cal
