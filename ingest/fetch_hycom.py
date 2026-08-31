"""HYCOM ocean current ingestion (upgrade L) — REAL data, no fakes.

Source: HYCOM GLBu0.08 expt_93.0 via THREDDS DODS (verified reachable).
Extracts water_u / water_v on three depth levels over the ROI,
subsampled toward ~0.5 deg spacing, quantized to int8 (-127..127 cm/s).
Emits public/data/currents.bin + manifest['currents'] metadata.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import xarray as xr

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import DATA_DIR, ensure_data_dir

URL = "https://tds.hycom.org/thredds/dodsC/GLBu0.08/expt_93.0"
ROI = {"latMin": -35.0, "latMax": 30.0, "lonMin": 40.0, "lonMax": 100.0}
DEPTHS_WANTED = [0.0, 50.0, 150.0]
LAT_STEP = 6   # 0.08 deg grid -> ~0.48 deg
LON_STEP = 6


def main():
    ensure_data_dir()
    ds = xr.open_dataset(URL, decode_times=False)
    lat = ds.lat.values
    lon = ds.lon.values
    depth = ds.depth.values

    la = int(np.argmin(np.abs(lat - ROI["latMin"])))
    lb = int(np.argmin(np.abs(lat - ROI["latMax"])))
    lo_a = int(np.argmin(np.abs(lon - ROI["lonMin"])))
    lo_b = int(np.argmin(np.abs(lon - ROI["lonMax"])))
    la, lb = sorted((la, lb))
    lo_a, lo_b = sorted((lo_a, lo_b))

    sub_lat = lat[max(0, la - 1): lb + 2: LAT_STEP]
    sub_lon = lon[max(0, lo_a - 1): lo_b + 2: LON_STEP]
    us, vs, used_depths = [], [], []
    for dw in DEPTHS_WANTED:
        di = int(np.argmin(np.abs(depth - dw)))
        used_depths.append(float(depth[di]))
        u = np.asarray(ds.water_u.isel(time=0).isel(depth=di).values[
            max(0, la - 1): lb + 2: LAT_STEP,
            max(0, lo_a - 1): lo_b + 2: LON_STEP], dtype=np.float64)
        v = np.asarray(ds.water_v.isel(time=0).isel(depth=di).values[
            max(0, la - 1): lb + 2: LAT_STEP,
            max(0, lo_a - 1): lo_b + 2: LON_STEP], dtype=np.float64)
        us.append(u)
        vs.append(v)
        print(f"depth {used_depths[-1]}m: {u.shape}, "
              f"speed max {np.nanmax(np.hypot(u, v)):.1f} cm/s", flush=True)
    ds.close()

    U = np.stack(us)
    V = np.stack(vs)
    nLat, nLon = U.shape[1], U.shape[2]
    speed = float(np.nanmax(np.hypot(U, V)))

    # quantize u,v separately into [-127,127]; NaN -> -128
    def q16(a):
        out = np.full(a.shape, -128, dtype=np.int8)
        mask = np.isfinite(a)
        out[mask] = np.clip(np.round(a[mask] / speed * 127), -127, 127).astype(np.int8)
        return out

    qu, qv = q16(U), q16(V)
    interleave = np.empty((len(DEPTHS_WANTED), 2, nLat, nLon), dtype=np.int8)
    interleave[:, 0] = qu
    interleave[:, 1] = qv
    (DATA_DIR / "currents.bin").write_bytes(interleave.tobytes())

    manifest_path = DATA_DIR / "manifest.json"
    m = json.load(open(manifest_path))
    m["currents"] = {
        "file": "currents.bin",
        "source": "HYCOM GLBu0.08 expt_93.0 (thredds.hycom.org, DODS)",
        "depthsM": used_depths,
        "nLat": int(nLat), "nLon": int(nLon),
        "lats": [round(float(v), 3) for v in sub_lat],
        "lons": [round(float(v), 3) for v in sub_lon],
        "scaleCms": round(speed, 2),
        "nanByte": -128,
        "citation": "Chassignet et al., HYCOM consortium",
    }
    json.dump(m, open(manifest_path, "w"), separators=(",", ":"))
    total = (DATA_DIR / "currents.bin").stat().st_size
    print(f"currents.bin written ({total} bytes), grid {nLat}x{nLon}")


if __name__ == "__main__":
    sys.exit(main())
