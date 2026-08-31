"""Plugin adapter proof (upgrade D): BGC-Argo chlorophyll via Ifremer ERDDAP.

Adds a NEW instrument source by writing ONE new adapter file — no changes to
the core pipeline. Points carry `chla` (mg/m3) in the unified schema.
"""
from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DATA_DIR  # noqa: E402

URL = ("https://erddap.ifremer.fr/erddap/tabledap/"
       "ArgoFloats-synthetic-BGC.csv"
       "?platform_number,cycle_number,time,latitude,longitude,pres,chla"
       "&time%3E=2026-03-01T00:00:00Z"
       "&longitude%3E=60&longitude%3C=75"
       "&latitude%3E=5&latitude%3C=25")


def fnum(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def main():
    print("downloading BGC-Argo chla CSV...", flush=True)
    resp = requests.get(URL, timeout=(30, 600))
    resp.raise_for_status()
    rows = list(csv.reader(io.StringIO(resp.text)))
    header = rows[0]
    by_key: dict[str, dict[str, list]] = {}
    n_pts = 0
    for r in rows[1:]:
        rec = dict(zip(header, r))
        pid = (rec.get("platform_number") or "").strip()
        cyc = fnum(rec.get("cycle_number"))
        pres = fnum(rec.get("pres"))
        chla = fnum(rec.get("chla"))
        if not pid or cyc is None or pres is None or chla is None:
            continue
        key = f"{pid}|{int(cyc)}"
        by_key.setdefault(pid, {}).setdefault(key, []).append({
            "time": (rec.get("time") or "").strip(),
            "lat": fnum(rec.get("latitude")),
            "lon": fnum(rec.get("longitude")),
            "depthM": pres,
            "chla": round(chla, 5),
        })
        n_pts += 1

    platforms = []
    for pid, cycles_raw in sorted(by_key.items()):
        def latest(k):
            return max(p["time"] for p in cycles_raw[k])
        keys = sorted(cycles_raw, key=latest)[-3:]
        cycles = []
        for k in keys:
            pts = sorted(cycles_raw[k], key=lambda p: p["depthM"])
            if len(pts) > 120:
                step = len(pts) / 120
                pts = [pts[int(i * step)] for i in range(120)]
            last = pts[-1]
            cycles.append({
                "time": latest(k),
                "lon": last["lon"], "lat": last["lat"],
                "profile": [{"depthM": p["depthM"], "tempC": None,
                             "salPsu": None, "chla": p["chla"]} for p in pts],
            })
        if not cycles:
            continue
        lastc = cycles[-1]
        platforms.append({
            "id": f"bgc-{pid}", "type": "bgc",
            "lon": lastc["lon"], "lat": lastc["lat"],
            "lastSeen": lastc["time"],
            "cycles": cycles,
        })

    prof_path = DATA_DIR / "profiles.json"
    merged = json.load(open(prof_path))
    merged["platforms"] = [
        p for p in merged["platforms"] if p["type"] != "bgc"
    ] + platforms
    write_json_compact(prof_path, merged)
    counts: dict[str, int] = {}
    for p in merged["platforms"]:
        counts[p["type"]] = counts.get(p["type"], 0) + 1
    # refresh manifest profile stats
    mpath = DATA_DIR / "manifest.json"
    m = json.load(open(mpath))
    m["profiles"] = {"file": "profiles.json", "count": len(merged["platforms"]),
                     "platformsByType": counts}
    write_json_compact(mpath, m)
    print(f"BGC done: {len(platforms)} floats, {n_pts} points; "
          f"totals {counts}", flush=True)


def write_json_compact(path: Path, obj) -> None:
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))
    tmp.replace(path)


if __name__ == "__main__":
    sys.exit(main())
