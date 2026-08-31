"""Full-depth monthly ingestion (upgrade M1) + SST anomaly (M5).

Monthly WOA23 files contain 57 depth levels (0-1500 m). We extract the same
25-level ROI subset for all 12 months -> temp_monthly.bin (time-major).
Also derives sst_anomaly.bin: monthly surface minus annual surface,
quantized on a symmetric range for diverging colormap.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import crop_ds, ensure_data_dir, field_entry, quantize, write_bin
from fetch_woa import (CACHE, DODS, HTTPS, MONTHS, VAR_NAME, DEPTH_SUBSET_M,
                       fetch_annual, open_var)

OUT_VARS = []


def fetch_monthly_full():
    """(12, nLevels, nLat, nLon) from the 12 monthly decav files."""
    frames = []
    lats = lons = None
    used_depths = None
    for mm in range(1, 13):
        tp = f"{mm:02d}"
        ds = open_var("t", tp)
        da = crop_ds(ds["t_an"]).isel(time=0)
        depths = np.asarray(ds["depth"].values, dtype=float)
        idx = sorted({int(np.argmin(np.abs(depths - d))) for d in DEPTH_SUBSET_M})
        planes = []
        for i in idx:
            planes.append(np.asarray(da.isel(depth=i).values, dtype=np.float64))
            if used_depths is None:
                pass
        if used_depths is None:
            used_depths = [float(depths[i]) for i in idx]
        frames.append(np.stack(planes))
        lats = da["lat"].values.astype(float)
        lons = da["lon"].values.astype(float)
        ds.close()
        print(f"  monthly full {tp}")
    return np.stack(frames), used_depths, lats, lons


def main():
    ensure_data_dir()

    # annual needed for the anomaly baseline
    t_arr_annual, annual_depths, _, _ = fetch_annual("t")

    vol, depths, lats, lons = fetch_monthly_full()
    print(f"monthly volume: {vol.shape}, depths {len(depths)}")

    grid = {"nLat": int(len(lats)), "nLon": int(len(lons)),
            "lats": [round(float(v), 3) for v in lats],
            "lons": [round(float(v), 3) for v in lons]}

    gmin, gmax = float(np.nanmin(vol)), float(np.nanmax(vol))
    write_bin("temp_monthly.bin", quantize(vol, gmin, gmax))
    entry = field_entry(
        "temp_monthly", "Temperature", "°C",
        "WOA23 decav monthly, full upper column (seasonal cycle)",
        depths, gmin, gmax, "temp_monthly.bin",
        {"url": DODS.format(vardir="temperature", var="t", tp="01"),
         "citation": "Locarnini et al. 2024, WOA23"},
        times=MONTHS)
    OUT_VARS.append((entry, grid))

    # anomaly: monthly surface minus annual surface (index 0 = 0 m)
    surf_monthly = vol[:, 0, :, :]
    surf_annual = t_arr_annual[0]
    anom = surf_monthly - surf_annual
    span = max(abs(float(np.nanmin(anom))), abs(float(np.nanmax(anom))))
    write_bin("sst_anomaly.bin", quantize(anom, -span, span))
    entry = field_entry(
        "sst_anomaly", "SST Anomaly", "°C",
        "WOA23 monthly surface minus annual mean (derived)",
        [0.0], -span, span, "sst_anomaly.bin",
        {"url": DODS.format(vardir="temperature", var="t", tp="01"),
         "citation": "Derived from Locarnini et al. 2024, WOA23"},
        times=MONTHS)
    entry["dims"]["nDepth"] = 1
    OUT_VARS.append((entry, grid))

    # merge with existing manifest variables
    manifest_path = Path(__file__).resolve().parent.parent / "public" / "data" / "manifest.json"
    old_vars = []
    if manifest_path.exists():
        m = json.load(open(manifest_path))
        old_vars = [v for v in m["variables"]
                    if v["id"] not in ("temp_monthly", "sst_anomaly")]
    variables = old_vars
    for entry, grid_ in OUT_VARS:
        entry["dims"]["nLat"] = grid_["nLat"]
        entry["dims"]["nLon"] = grid_["nLon"]
        variables.append(entry)

    # rewrite manifest preserving other sections
    profiles_meta = {"file": "profiles.json", "count": 0, "platformsByType": {}}
    if manifest_path.exists():
        m = json.load(open(manifest_path))
        profiles_meta = m.get("profiles", profiles_meta)
    from common import finalize_manifest
    finalize_manifest(grid, variables, profiles_meta)
    print("manifest updated with temp_monthly + sst_anomaly")


if __name__ == "__main__":
    sys.exit(main())
