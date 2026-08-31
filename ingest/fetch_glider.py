"""ERDDAP tabledap adapter: underwater gliders (IOOS Glider DAC).

Scans the deployment index for ROI deployments, then pulls the verified
ru29 Indian Ocean dataset. Reuses the same adapter core as Argo — this file
is the plugin-contract proof that a new source costs one adapter.
"""
from __future__ import annotations

import requests

from fetch_argo import build_platforms, parse_erddap_csv

INDEX_URL = ("https://gliders.ioos.us/erddap/tabledap/allDatasets.csv"
             "?datasetID,title,minLongitude,maxLongitude,minLatitude,maxLatitude")

ROI_BOX = {"latMin": -35, "latMax": 30, "lonMin": 40, "lonMax": 100}

FALLBACK_DATASETS = ["ru29-20161105T0131"]


def find_roi_datasets():
    try:
        resp = requests.get(INDEX_URL, timeout=(30, 120))
        resp.raise_for_status()
        rows = parse_erddap_csv(resp.text)
        out = []
        for r in rows:
            try:
                if (float(r["minLatitude"]) >= ROI_BOX["latMin"]
                        and float(r["maxLatitude"]) <= ROI_BOX["latMax"]
                        and float(r["minLongitude"]) >= ROI_BOX["lonMin"]
                        and float(r["maxLongitude"]) <= ROI_BOX["lonMax"]):
                    out.append(r["datasetID"])
            except (KeyError, ValueError):
                continue
        return out or FALLBACK_DATASETS
    except requests.RequestException:
        return FALLBACK_DATASETS


def fetch_glider(dataset_ids=None, max_cycles=5, max_points=200):
    ids = dataset_ids or find_roi_datasets()
    all_platforms = []
    for dsid in ids[:3]:
        url = (f"https://gliders.ioos.us/erddap/tabledap/{dsid}.csv"
               "?time,latitude,longitude,depth,temperature,salinity"
               "&latitude%3E=-35&latitude%3C=30&longitude%3E=40&longitude%3C=100")
        try:
            print(f"glider {dsid}: downloading...")
            resp = requests.get(url, timeout=(30, 300))
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"glider {dsid} FAILED: {e}")
            continue
        rows = parse_erddap_csv(resp.text)
        # glider has no cycle_number: bucket points into pseudo-cycles by day
        for r in rows:
            r["cycle_number"] = (r.get("time") or "")[:10]  # YYYY-MM-DD
            r["trajectory"] = dsid
        plats = build_platforms(rows, "glider", max_cycles=max_cycles,
                                max_points=max_points)
        all_platforms.extend(plats)
        print(f"glider {dsid}: {len(plats)} platform(s), "
              f"{sum(len(p['cycles']) for p in plats)} day-profiles")
    return all_platforms


if __name__ == "__main__":
    fetch_glider()
