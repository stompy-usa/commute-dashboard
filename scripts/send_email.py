"""Email the latest commute snapshot's recommended route.

Reads docs/data/latest.json, picks the fastest option, and sends a summary
email via SMTP. Intended to run on the final slot of each commute window
(06:30 ET morning, 16:00 ET evening) as a lightweight daily digest.
"""
from __future__ import annotations

import json
import os
import smtplib
import sys
from email.message import EmailMessage
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LATEST = REPO_ROOT / "docs" / "data" / "latest.json"


def fmt_duration(seconds: int) -> str:
    minutes = round(seconds / 60)
    if minutes < 60:
        return f"{minutes} min"
    h, m = divmod(minutes, 60)
    return f"{h}h {m}m"


def fmt_miles(meters: int) -> float:
    return round(meters / 1609.34, 1)


def main() -> int:
    if not LATEST.exists():
        print("no latest.json found", file=sys.stderr)
        return 1

    snap = json.loads(LATEST.read_text())
    routes = snap.get("routes", [])
    if not routes:
        print("no routes in snapshot", file=sys.stderr)
        return 1

    period = snap.get("period", "morning")
    direction = "Home -> Office" if period == "morning" else "Office -> Home"
    slot = snap.get("et_slot", "")

    fastest = min(routes, key=lambda r: r["summary"]["duration_s"])
    f_sum = fastest["summary"]
    f_eta = f_sum.get("arrival_et", "?")

    lines = [
        f"Commute snapshot - {direction} ({slot} ET)",
        "",
        f"Recommended: {fastest['label']}",
        f"  ETA: {f_eta}",
        f"  Drive time: {fmt_duration(f_sum['duration_s'])}",
        f"  Delay: {fmt_duration(f_sum.get('traffic_delay_s', 0))}",
        f"  Distance: {fmt_miles(f_sum['distance_m'])} mi",
        "",
        "All options:",
    ]
    for r in routes:
        s = r["summary"]
        marker = "*" if r["label"] == fastest["label"] else " "
        lines.append(
            f" {marker} {r['label']}: {fmt_duration(s['duration_s'])}"
            f" -> arrives {s.get('arrival_et', '?')}"
            f" (delay {fmt_duration(s.get('traffic_delay_s', 0))})"
        )

    body = "\n".join(lines)
    subject = f"Commute {slot} ET - {fastest['label']} arrives {f_eta}"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.environ["SMTP_USER"]
    msg["To"] = os.environ["EMAIL_TO"]
    msg.set_content(body)

    host = os.environ.get("SMTP_HOST") or "smtp.gmail.com"
    port = int(os.environ.get("SMTP_PORT") or "587")
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]

    with smtplib.SMTP(host, port) as s:
        s.starttls()
        s.login(user, password)
        s.send_message(msg)

    print(f"email sent: {subject}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
