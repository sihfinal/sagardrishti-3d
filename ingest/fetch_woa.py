"""Fetch WOA23 gridded temperature/salinity -> cropped quantized field binaries.

WOA23 NetCDF layout (verified live): woa23_decav_{t|s}00_01.nc holds ALL 102
standard depth levels (0-5500 m); monthly files t{01..12} hold the seasonal
cycle at all levels. Primary transport: NCEI THREDDS OPeNDAP (server-side ROI
crop). Fallback: direct HTTPS download + local open.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
import xarray as xr

from common import crop_ds, field_entry, quantize, write_bin

# Subsample of the 102 standard levels (per master prompt §2.1)
DEPTH_SUBSET_M = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80,
                  90, 100, 125, 150, 175, 200, 300, 400, 500, 600]

VAR_DIR = {"t": "temperature", "s": "salinity"}
VAR_NAME = {"t": "t_an", "s": "s_an"}
DODS = ("https://www.ncei.noaa.gov/thredds-ocean/dodsC/woa23/DATA/"
        "{vardir}/netcdf/decav/1.00/woa23_decav_{var}{tp}_01.nc")
HTTPS = ("https://www.ncei.noaa.gov/data/oceans/woa/WOA23/DATA/"
         "{vardir}/netcdf/decav/1.00/woa23_decav_{var}{tp}_01.nc")

CACHE = Path(__file__).resolve().parent / "_cache_woa"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _open_local(var: str, tp: str):
    url = HTTPS.format(vardir=VAR_DIR[var], var=var, tp=tp)
    fp = CACHE / f"woa23_decav_{var}{tp}_01.nc"
    if not (fp.exists() and fp.stat().st_size > 1_000_000):
        fp.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, fp)
    ds = xr.open_dataset(fp, decode_times=False)
    return ds


def open_var(var: str, tp: str):
    """OPeNDAP first (tiny server-side crop), local-download fallback."""
    try:
        url = DODS.format(vardir=VAR_DIR[var], var=var, tp=tp)
        return xr.open_dataset(url, decode_times=False)
    except Exception as e:  # noqa: BLE001
        print(f"  dods failed for {var}{tp} ({type(e).__name__}); "
              f"falling back to direct download")
        return _open_local(var, tp)


def fetch_annual(var: str):
    """Full water column from the single decav annual file, cropped + subset."""
    ds = open_var(var, "00")
    da = crop_ds(ds[VAR_NAME[var]]).squeeze("time", drop=True)  # (depth,lat,lon)
    depths = np.asarray(ds["depth"].values, dtype=float)
    idx = [int(np.argmin(np.abs(depths - d))) for d in DEPTH_SUBSET_M]
    used = sorted(set(idx))
    arr = np.stack([np.asarray(da.isel(depth=i).values, dtype=np.float64)
                    for i in used])
    used_depths = [float(depths[i]) for i in used]
    lats = da["lat"].values.astype(float)
    lons = da["lon"].values.astype(float)
    ds.close()
    print(f"  {var}: {arr.shape}, depths {used_depths[:4]}...{used_depths[-1]}")
    return arr, used_depths, lats, lons


def fetch_monthly_sst():
    frames = []
    lats = lons = None
    for mm in range(1, 13):
        tp = f"{mm:02d}"
        try:
            ds = open_var("t", tp)
            da = crop_ds(ds["t_an"]).isel(time=0, depth=0)
            frames.append(np.asarray(da.values, dtype=np.float64))
            if mm == 1:
                lats = da["lat"].values.astype(float)
                lons = da["lon"].values.astype(float)
            ds.close()
            print(f"  monthly t{tp}")
        except Exception as e:  # noqa: BLE001
            print(f"  monthly {tp} failed: {type(e).__name__} {e}")
            return None, None, None
    return np.stack(frames), lats, lons


def main():
    variables = []

    t_arr, t_depths, lats, lons = fetch_annual("t")
    s_arr, s_depths, _, _ = fetch_annual("s")

    grid = {"nLat": int(len(lats)), "nLon": int(len(lons)),
            "lats": [round(float(v), 3) for v in lats],
            "lons": [round(float(v), 3) for v in lons]}

    for vid, name, unit, arr, depths in [
        ("temp_annual", "Temperature", "°C", t_arr, t_depths),
        ("salt_annual", "Salinity", "PSU", s_arr, s_depths),
    ]:
        gmin = float(np.nanmin(arr))
        gmax = float(np.nanmax(arr))
        write_bin(f"{vid}.bin", quantize(arr, gmin, gmax))
        entry = field_entry(
            vid, name, unit,
            "WOA23 decav annual (NOAA NCEI, CF-compliant gridded analysis)",
            depths, gmin, gmax, f"{vid}.bin",
            {"url": HTTPS.format(vardir=VAR_DIR[vid[0]], var=vid[0], tp="00"),
             "citation": "Locarnini et al. 2024 / Zweng et al. 2024, WOA23"})
        entry["dims"]["nLat"] = grid["nLat"]
        entry["dims"]["nLon"] = grid["nLon"]
        variables.append(entry)

    sst, m_lats, m_lons = fetch_monthly_sst()
    if sst is not None:
        gmin, gmax = float(np.nanmin(sst)), float(np.nanmax(sst))
        write_bin("sst_monthly.bin", quantize(sst, gmin, gmax))
        entry = field_entry(
            "sst_monthly", "Sea Surface Temperature", "°C",
            "WOA23 decav monthly surface (seasonal cycle)",
            [0.0], gmin, gmax, "sst_monthly.bin",
            {"url": DODS.format(vardir="temperature", var="t", tp="01"),
             "citation": "Locarnini et al. 2024, WOA23"},
            times=MONTHS)
        entry["dims"]["nLat"] = grid["nLat"]
        entry["dims"]["nLon"] = grid["nLon"]
        variables.append(entry)
        print(f"sst_monthly OK shape={sst.shape}")
    else:
        print("DECISION: monthly surface unavailable — animation falls back "
              "to depth-level sweep; noted in README.")

    CACHE.mkdir(parents=True, exist_ok=True)
    with open(CACHE / "woa_meta.json", "w") as f:
        json.dump({"grid": grid, "variables": variables}, f)
    print(f"WOA done: temp {t_arr.shape}, salt {s_arr.shape}, "
          f"depths({len(t_depths)})")


if __name__ == "__main__":
    sys.exit(main())
