"""Shared helpers: crop, quantize, manifest writing.

Data contract lives in ARCHITECTURE.md and README.md.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np

ROI = {"latMin": -35.0, "latMax": 30.0, "lonMin": 40.0, "lonMax": 100.0}

DATA_DIR = Path(__file__).resolve().parent.parent / "public" / "data"


def ensure_data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def crop_ds(ds, lat_name="lat", lon_name="lon"):
    """Crop an xr.Dataset to the ROI box."""
    return ds.sel(**{lat_name: slice(ROI["latMin"], ROI["latMax"]),
                     lon_name: slice(ROI["lonMin"], ROI["lonMax"])})


def quantize(arr: np.ndarray, vmin: float, vmax: float, fill_byte: int = 255) -> np.ndarray:
    """q = round((v - min) * 254 / (max - min)); fillByte for NaN."""
    q = np.round((arr - vmin) * 254.0 / (vmax - vmin)).astype(np.uint8)
    q[np.isnan(arr)] = fill_byte
    q[arr < vmin] = 0
    q[arr > vmax] = 254
    return q


def write_bin(name: str, arr: np.ndarray) -> None:
    ensure_data_dir()
    arr.astype(np.uint8).tofile(DATA_DIR / name)


def write_json(name: str, obj) -> None:
    ensure_data_dir()
    with open(DATA_DIR / name, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))


def field_entry(id_, name, unit, source, depths_m, gmin, gmax, file_, provenance,
                times=None):
    entry = {
        "id": id_,
        "name": name,
        "unit": unit,
        "source": source,
        "depthsM": [float(d) for d in depths_m],
        "globalMin": round(float(gmin), 4),
        "globalMax": round(float(gmax), 4),
        "encoding": {"dtype": "uint8", "scale": (gmax - gmin) / 254.0,
                     "offset": float(gmin), "fillByte": 255},
        "file": file_,
        "provenance": provenance,
        "dims": {"nDepth": len(depths_m), "nLat": None, "nLon": None,
                 "nTime": len(times) if times else 1},
    }
    if times is not None:
        entry["times"] = times
    return entry


def finalize_manifest(grid, variables, profiles_meta):
    manifest = {
        "roi": ROI,
        "grid": grid,
        "variables": variables,
        "profiles": profiles_meta,
        "generatedUtc": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).isoformat(timespec="seconds"),
    }
    write_json("manifest.json", manifest)
    return manifest
