# ARCHITECTURE

## Pipeline

```
INGEST (offline, Python)
  NOAA WOA23 (annual+monthly) --xarray/OPeNDAP--> fetch_woa.py / fetch_monthly_full.py
  Ifremer ERDDAP Argo --------CSV stream-------> fetch_argo.py
  IOOS Glider DAC ------------------------------> fetch_glider.py
  HYCOM THREDDS DODS ---------------------------> fetch_hycom.py
  Ifremer BGC-Argo -----------------------------> fetch_bgc.py
        |
        v  quantize uint8 (fill=255) + crop to ROI + downsample profiles
  public/data/  (<15 MB committed)
    manifest.json | *.bin | profiles.json | coastlines.json | currents.bin
        |
        v  runtime: zero network calls
NEXT.JS SERVER
  /api/manifest          manifest JSON
  /api/field/[id]        quantized field binaries (octet-stream)
  /api/field/currents    HYCOM u/v binary
  /api/profiles          unified instrument profiles (plugin contract)
        |
        v
BROWSER (React Three Fiber)
  OceanScene ............ canvas root: sky dome, fog, bloom/ACES post chain,
                          quality tiers (low/medium/high)
    Basemap ............. animated Gerstner sea surface + coastline vectors
    SliceEngine ......... dense morphing slice stack (up to 72 planes, LUT shader)
    VolumeWalls ......... aquarium N/S/E/W faces from field rows/columns
    Isosurface .......... marching tetrahedra + seasonal re-mesh
    Bathymetry .......... seafloor derived from deepest valid cell per column
    ClassClouds ......... value-band point clouds
    Transect ............ vertical curtain at chosen latitude
    InstrumentMarkers ... Argo/glider/BGC markers, hover obs-vs-model, fly-to
    ObservationErrorLayer  Assimilation Lens evidence strips + halos
    CurrentVectors ...... instanced arrows from real HYCOM u/v

  zustand store (all controls); seasonClock + simClock drive animation
  UI: glass sidebar accordion, profile charts (recharts), scatter modal
```

## Data contract

`manifest.json` — one entry per gridded field:

```jsonc
{
  "id": "temp_monthly",
  "depthsM": [0, 5, 10, "…", 600],
  "globalMin": -1.2, "globalMax": 30.3,
  "encoding": { "dtype": "uint8", "scale": 0.124, "offset": -1.2, "fillByte": 255 },
  "file": "temp_monthly.bin",
  "dims": { "nDepth": 25, "nLat": 65, "nLon": 60, "nTime": 12 },
  "times": ["Jan", "…"],
  "provenance": { "url": "...", "citation": "..." }
}
```

Decode rule (identical in shaders and JS):
`v = offset + (q / 254) * (globalMax - globalMin)`; byte `255` = land/missing.

`profiles.json` — the **plugin contract**. Any instrument source becomes:

```jsonc
{ "platforms": [{
    "id": "...", "type": "argo|glider|bgc",
    "lon": 0, "lat": 0, "lastSeen": "...",
    "cycles": [{ "time": "...", "lon": 0, "lat": 0,
                 "profile": [{ "depthM": 0, "tempC": null, "salPsu": null, "chla": null }] }] }]
}
```

## Plugin adapter interface

A new data source is **one Python file** that:
1. Downloads from its endpoint (`requests`, xarray, OPeNDAP),
2. Normalizes rows into the platform/cycle/profile shape above,
3. Merges into `profiles.json` (or appends a manifest variable for gridded data).

Proof: `fetch_bgc.py` added 24 chlorophyll floats with zero changes to core
pipeline or frontend logic beyond a marker color.

## Validation engine

`src/lib/validation.ts` — per observation point: nearest grid cell (bilinear)
→ nearest depth level → decode → `error = obs − model`. Aggregates bias,
RMSE, max|error|. One cache feeds the 3D evidence strips, the profile panel
metrics/error curve, and the fleet-wide scatter.

## Runtime-offline rationale

Everything heavy happens at ingest. The committed store is 8.8 MB; binaries are
served by route handlers with immutable caching. The demo cannot fail on venue
Wi-Fi.

## OGC note

CF conventions are honored at ingest (coordinates, units, `_FillValue`
respected via xarray decoding). The REST shape mirrors WCS-style coverage
requests (`/api/field/{coverageId}`); a thin WMS GetMap PNG wrapper over the
same binaries is straightforward follow-up work.
