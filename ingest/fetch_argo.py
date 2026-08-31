"""ERDDAP tabledap adapter: Argo floats (Ifremer).

Downloads the verified query, skips the units row (CSV line 2), groups by
platform/cycle, keeps latest <=5 cycles, downsamples each profile to <=200
depth points. Emits unified platform JSON matching the plugin contract.
"""
from __future__ import annotations

import csv
import io

import requests

ARGO_URL = ("https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.csv"
            "?platform_number,cycle_number,time,latitude,longitude,pres,temp,psal"
            "&time%3E=2024-06-01T00%3A00%3A00Z"
            "&longitude%3E=60&longitude%3C=100"
            "&latitude%3E=-35&latitude%3C=30")


def fnum(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def parse_erddap_csv(text: str):
    """List of dict rows; units row (line 2) is skipped by numeric coercion."""
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    header = rows[0]
    out = []
    for r in rows[1:]:
        if not r or all(not c.strip() for c in r):
            continue
        out.append(dict(zip(header, r)))
    return out


def build_platforms(rows, ptype, max_cycles=5, max_points=200):
    """Generic adapter core shared by Argo and Glider fetchers."""
    by_key = {}
    for r in rows:
        pid = (r.get("platform_number") or r.get("trajectory") or "").strip()
        if not pid:
            continue
        t = (r.get("time") or "").strip()
        lat = fnum(r.get("latitude"))
        lon = fnum(r.get("longitude"))
        depth = fnum(r.get("pres"))
        if depth is None:
            depth = fnum(r.get("depth"))
        temp = fnum(r.get("temp"))
        if temp is None:
            temp = fnum(r.get("temperature"))
        psal = fnum(r.get("psal"))
        if psal is None:
            psal = fnum(r.get("salinity"))
        cyc = r.get("cycle_number")
        key = cyc if cyc is not None else ""
        by_key.setdefault(pid, {})
        by_key[pid].setdefault(key, []).append(
            {"time": t, "lat": lat, "lon": lon,
             "depthM": depth, "tempC": temp, "salPsu": psal})

    platforms = []
    for pid in sorted(by_key):
        cycles_raw = by_key[pid]
        # sort cycle keys by their latest timestamp; keep latest max_cycles
        def latest(k):
            return max(p["time"] for p in cycles_raw[k])
        keys = sorted(cycles_raw, key=latest)[-max_cycles:]
        cycles = []
        for k in keys:
            pts = sorted(cycles_raw[k], key=lambda p: (p["depthM"] is None,
                                                       p["depthM"] or 0))
            pts = [p for p in pts if p["depthM"] is not None]
            if len(pts) > max_points:
                step = len(pts) / max_points
                pts = [pts[int(i * step)] for i in range(max_points)]
            last = cycles_raw[k][-1]
            cycles.append({
                "time": latest(k),
                "lon": last["lon"], "lat": last["lat"],
                "profile": [{"depthM": round(p["depthM"], 2),
                             "tempC": round(p["tempC"], 3) if p["tempC"] is not None else None,
                             "salPsu": round(p["salPsu"], 3) if p["salPsu"] is not None else None}
                            for p in pts],
            })
        if not cycles:
            continue
        lastc = cycles[-1]
        platforms.append({
            "id": pid, "type": ptype,
            "lon": lastc["lon"], "lat": lastc["lat"],
            "lastSeen": lastc["time"],
            "cycles": cycles,
        })
    return platforms


def fetch_argo(max_cycles=3, max_points=120):
    print("downloading Argo CSV (~49 MB)...")
    resp = requests.get(ARGO_URL, timeout=(30, 600))
    resp.raise_for_status()
    rows = parse_erddap_csv(resp.text)
    platforms = build_platforms(rows, "argo", max_cycles=max_cycles,
                                max_points=max_points)
    print(f"Argo: {len(platforms)} platforms from {len(rows)} rows")
    return platforms


if __name__ == "__main__":
    fetch_argo()
