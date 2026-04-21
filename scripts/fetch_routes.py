"""Call TomTom Routing API and write a snapshot JSON file.

Environment variables required:
  TOMTOM_API_KEY   TomTom Routing API key
  HOME_COORDS      "lat,lon" of the starting point
  OFFICE_COORDS    "lat,lon" of the destination
  ET_SLOT          Optional. ET slot label like "05:45". If unset, computed
                   from the current Eastern Time.

Writes:
  data/YYYY/MM/DD/HHMM.json   the snapshot
  data/latest.json            copy of the latest snapshot
  data/index.json             rolling list (newest first) of recent snapshots
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

ET = ZoneInfo("America/New_York")

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = REPO_ROOT / "docs"
DATA_DIR = DOCS_DIR / "data"
INDEX_MAX_ENTRIES = 200

TOMTOM_URL = "https://api.tomtom.com/routing/1/calculateRoute/{locations}/json"


def env_required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"error: required environment variable {name} is not set")
    return value


def parse_coords(raw: str, label: str) -> tuple[float, float]:
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 2:
        sys.exit(f"error: {label} must be 'lat,lon', got {raw!r}")
    try:
        return float(parts[0]), float(parts[1])
    except ValueError:
        sys.exit(f"error: {label} coords are not numeric: {raw!r}")


def call_tomtom(
    api_key: str,
    home: tuple[float, float],
    office: tuple[float, float],
) -> dict:
    locations = f"{home[0]},{home[1]}:{office[0]},{office[1]}"
    params = {
        "key": api_key,
        "traffic": "true",
        "maxAlternatives": "2",
        "alternativeType": "anyRoute",
        "routeRepresentation": "polyline",
        "instructionsType": "text",
        "travelMode": "car",
        "routeType": "fastest",
        "departAt": "now",
    }
    resp = requests.get(
        TOMTOM_URL.format(locations=locations), params=params, timeout=30
    )
    if resp.status_code != 200:
        sys.exit(f"error: TomTom {resp.status_code}: {resp.text[:500]}")
    return resp.json()


def derive_period(et_slot: str) -> str:
    try:
        hour = int(et_slot.split(":")[0])
    except (ValueError, IndexError):
        return "morning"
    return "morning" if hour < 12 else "evening"


def build_snapshot(raw: dict, et_slot: str, period: str) -> dict:
    captured_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    routes_out: list[dict] = []
    for i, route in enumerate(raw.get("routes", [])):
        summary = route.get("summary", {}) or {}
        arrival_iso = summary.get("arrivalTime")
        arrival_et = ""
        if arrival_iso:
            try:
                arrival_et = (
                    datetime.fromisoformat(arrival_iso.replace("Z", "+00:00"))
                    .astimezone(ET)
                    .strftime("%H:%M")
                )
            except ValueError:
                arrival_et = ""

        polyline: list[list[float]] = []
        for leg in route.get("legs", []) or []:
            for point in leg.get("points", []) or []:
                lat = point.get("latitude")
                lon = point.get("longitude")
                if lat is not None and lon is not None:
                    polyline.append([lat, lon])

        instructions: list[dict] = []
        for inst in (route.get("guidance", {}) or {}).get("instructions", []) or []:
            instructions.append(
                {
                    "message": inst.get("message"),
                    "street": inst.get("street"),
                    "maneuver": inst.get("maneuver"),
                    "offset_m": inst.get("routeOffsetInMeters"),
                    "time_s": inst.get("travelTimeInSeconds"),
                }
            )

        label = "primary" if i == 0 else f"alt_{i}"
        routes_out.append(
            {
                "label": label,
                "summary": {
                    "distance_m": summary.get("lengthInMeters"),
                    "duration_s": summary.get("travelTimeInSeconds"),
                    "traffic_delay_s": summary.get("trafficDelayInSeconds"),
                    "arrival_et": arrival_et,
                },
                "polyline": polyline,
                "instructions": instructions,
            }
        )

    return {
        "captured_at": captured_at,
        "et_slot": et_slot,
        "period": period,
        "routes": routes_out,
    }


def write_snapshot(snapshot: dict) -> Path:
    now_et = datetime.now(ET)
    day_dir = DATA_DIR / f"{now_et:%Y}" / f"{now_et:%m}" / f"{now_et:%d}"
    day_dir.mkdir(parents=True, exist_ok=True)
    slot_name = snapshot["et_slot"].replace(":", "")
    target = day_dir / f"{slot_name}.json"
    target.write_text(json.dumps(snapshot, indent=2))

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "latest.json").write_text(json.dumps(snapshot, indent=2))
    update_index(target, snapshot)
    return target


def update_index(snapshot_path: Path, snapshot: dict) -> None:
    index_path = DATA_DIR / "index.json"
    index: list[dict] = []
    if index_path.exists():
        try:
            index = json.loads(index_path.read_text())
            if not isinstance(index, list):
                index = []
        except json.JSONDecodeError:
            index = []

    rel = snapshot_path.relative_to(DOCS_DIR).as_posix()
    entry = {
        "path": rel,
        "captured_at": snapshot["captured_at"],
        "et_slot": snapshot["et_slot"],
    }
    index = [e for e in index if e.get("path") != rel]
    index.insert(0, entry)
    index = index[:INDEX_MAX_ENTRIES]
    index_path.write_text(json.dumps(index, indent=2))


def infer_slot() -> str:
    now = datetime.now(ET)
    return f"{now.hour:02d}:{now.minute - now.minute % 15:02d}"


def main() -> int:
    api_key = env_required("TOMTOM_API_KEY")
    home = parse_coords(env_required("HOME_COORDS"), "HOME_COORDS")
    office = parse_coords(env_required("OFFICE_COORDS"), "OFFICE_COORDS")
    et_slot = os.environ.get("ET_SLOT", "").strip() or infer_slot()

    period = derive_period(et_slot)
    origin, destination = (office, home) if period == "evening" else (home, office)

    raw = call_tomtom(api_key, origin, destination)
    snapshot = build_snapshot(raw, et_slot, period)
    target = write_snapshot(snapshot)

    print(f"wrote {target.relative_to(REPO_ROOT).as_posix()}  ({period}, {len(snapshot['routes'])} routes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
