# SIH26067 Ocean 3D — Complete Phase-by-Phase Build Documentation

> Reference document for frontend design work. Every component, its file,
> its data flow, and its user-facing behavior is described here.
> Live app: `http://localhost:3000/explore`

---

## PROJECT IDENTITY

| Item | Value |
|---|---|
| Problem statement | SIH26067 — Web-based interactive 3D ocean data visualization |
| Organization | INCOIS (MoES), theme: Smart Automation |
| Stack | Next.js 16 (App Router, TS, Tailwind v4) · React Three Fiber + drei · recharts · zustand · Python xarray ingest |
| Region of interest | Indian Ocean box: lat [−35, 30], lon [40, 100] |
| Data budget | `public/data` = **8.4 MB** committed, fully offline runtime |

---

## PHASE 0 — SCAFFOLD & ASSETS

**What was built**
- Next.js 16 repo (`create-next-app@16.3.1`, pnpm, TS strict, Tailwind 4)
- Dependencies: `three`, `@react-three/fiber`, `@react-three/drei`, `recharts`, `zustand`, `@react-three/postprocessing`
- Assets: NASA earth equirectangular texture (`public/textures/earth_atmos_2048.jpg`), Natural Earth coastlines cropped to ROI+buffer (`public/data/coastlines.json`, 31 features)
- Python venv (`.venv`) for ingestion

**Design-relevant facts**
- Single-screen app: everything happens on `/explore`; `/` redirects there
- Dark UI theme: slate-900/950 panels over a deep-blue WebGL canvas

---

## PHASE 1 — DATA INGESTION PIPELINE (offline, one-time)

**Pipeline:** public CF-compliant sources → Python adapters → quantized binaries + JSON manifest → REST routes → browser

| Script | Source | Output |
|---|---|---|
| `ingest/fetch_woa.py` | NOAA WOA23 decav annual (1 file = all depths!) via OPeNDAP server-side crop | `temp_annual.bin`, `salt_annual.bin` — 25 depth levels (0→600 m), grid 65×60 |
| `ingest/fetch_monthly_full.py` | WOA23 monthly files (57 levels each) | `temp_monthly.bin` (12 months × 25 levels) — powers seasonal morph; `sst_anomaly.bin` (monthly − annual surface, symmetric range) |
| `ingest/fetch_argo.py` | Ifremer ERDDAP ArgoFloats (~49 MB CSV streamed) | platforms array in `profiles.json` — **463 floats**, ≤3 cycles each, ≤120 points/cycle |
| `ingest/fetch_glider.py` | IOOS Glider DAC (auto-discovers ROI deployments) | glider platforms (ru29), day-bucketed pseudo-cycles |
| `ingest/fetch_hycom.py` | HYCOM GLBu0.08 expt_93.0 THREDDS DODS | `currents.bin` — real u/v at 0/50/150 m, 136×126 subsampled grid |

**Data contract (everything the frontend consumes):**

```jsonc
// manifest.json
{
  "roi": { latMin:-35, latMax:30, lonMin:40, lonMax:100 },
  "grid": { nLat:65, nLon:60, lats:[...], lons:[...] },
  "variables": [
    {
      "id": "temp_annual",            // salt_annual | temp_monthly | sst_monthly | sst_anomaly
      "name": "Temperature", "unit": "°C",
      "depthsM": [0,5,...,600],        // ascending
      "globalMin": 7.51, "globalMax": 30.29,
      "encoding": { dtype:"uint8", scale, offset, fillByte:255 },
      "file": "temp_annual.bin",       // uint8, depth-major [k][lat][lon]
      "dims": { nDepth, nLat, nLon, nTime },
      "times": ["Jan"..."Dec"],        // only temporal fields
      "provenance": { url, citation }
    }
  ],
  "profiles": { count: 464, platformsByType: {argo:463, glider:1} },
  "currents": { depthsM:[0,50,150], nLat:136, nLon:126, scaleCms, lats[], lons[] }
}
```

```jsonc
// profiles.json — the plugin contract
{ "platforms": [{
    "id":"1901839", "type":"argo",          // argo | glider
    "lon":74.28, "lat":-15.58,
    "lastSeen":"2024-06-10T03:52Z",
    "cycles":[{ "time","lon","lat",
      "profile":[{ "depthM", "tempC", "salPsu" }] }]   // ≤5 cycles kept
  }]}
```

**Quantization rule:** `q = round((v−min)×254/(max−min))`, byte 255 = land/missing. Decode: `v = offset + q×(max−min)/254`.

**REST API**
| Route | Returns |
|---|---|
| `GET /api/manifest` | full manifest JSON |
| `GET /api/field/[id]` | quantized binary (`application/octet-stream`) |
| `GET /api/profiles` | profiles.json (optional `?type=argo|glider` filter) |
| `GET /api/field/currents` | currents.bin |

---

## PHASE 2 — CORE 3D SCENE

### Coordinate mapping (`src/scene/mapping.ts`)
- **lon → x**, **lat → z** (north = −z), **depth → −y**
- `HORIZ_SCALE = 1.5` world-units per degree (ROI ≈ 90 × 97 units)
- Vertical: `y = −depthM × exaggeration × 0.00025` (default exaggeration 50×)
- `makeMapping(roi)` returns converters used by every scene object
- `sampleField(data, grid, depthsM, lon, lat, depth)` — bilinear horizontal sampling at nearest level, returns quantized byte or null (land)

### Scene root (`src/scene/OceanScene.tsx`)
- `<Canvas>` camera fov 45 framed on ROI center from SE-above
- Sky dome: inverted sphere, custom gradient shader (navy→teal) + dither
- Underwater fog: `fogExp2 #0a1a2e @ 0.0035`
- Post-processing: **Bloom** (mipmapBlur, threshold 0.25) + **ACES Filmic tone-mapping**
- Lights: hemisphere fill + `SunRig` (elevation-driven directional light, warm at low sun)

### Sea surface (`src/scene/Basemap.tsx`)
- Plane 96×96 segments, earth texture UV-windowed exactly to ROI
- Vertex shader: 3 Gerstner wave trains with true deep-water dispersion ω=√(gk) (14 m swell / 6.5 m cross-swell / 2.8 m chop) + horizontal choppiness displacement
- Fragment: UV shimmer + crest highlight
- Coastline polylines drawn from cropped GeoJSON

### Bathymetry (`src/scene/Bathymetry.tsx`)
- **Derived purely from our data**: deepest non-land cell per column of the temperature field = seafloor depth
- Displaced mesh, vertex-colored sand→abyssal blue, follows exaggeration slider

### Depth slices → dense volume stack (`src/scene/SliceEngine.ts` + wrapper)
- `SliceEngine`: imperative class managing 72 interpolated planes between the 25 real levels (React shell stays thin; all mutation in `useFrame`)
- Each plane blends two bracketing levels in-shader (`uData`/`uDataB`/`uMix`)
- Seasonal morph: when the field has `times`, engine blends two time frames CPU-side per change and re-uploads textures
- Opacity profile: surface ≈ opaque, deeper planes fade; band around selected level highlighted; white outline ring hugs selected depth
- Palette LUT texture rewritten in-place on palette change; **anomaly fields force diverging palette**
- Shader family: `ColormapShader.ts` — value → linear/log normalize → 256×1 LUT lookup, land discarded

### Aquarium walls (`src/scene/VolumeWalls.tsx`)
- N/S/E/W vertical faces built from real field rows/columns (module-scoped engine state)
- Textures re-extracted with seasonal blending; height tracks exaggeration

### Isosurface (`src/scene/marching.ts` + `Isosurface.tsx`)
- **Marching tetrahedra** on the 60×65×25 scalar volume (land-masked), iso-value slider
- Surface color sampled from same palette at iso value
- Morphs through seasons at 4 rebuild-steps/month while playing

### Instrument markers (`src/scene/InstrumentMarkers.tsx`)
- Argo = cyan spheres, glider = pink cones, gold when selected
- Continuous pulse animation (deterministic id-hash phase); selected pulses stronger
- Hover tooltip: id, type, last-seen, **surface obs temp vs model temp at same cell**
- Click → sets `cameraFocus` → smooth fly-to + opens profile panel

### Extra scene objects
| Component | Feature |
|---|---|
| `ClassClouds.tsx` | Value-band point clouds — cells inside [bandMin,bandMax] as glowing points |
| `Transect.tsx` | Vertical curtain at chosen latitude (depth×lon resample) |
| `MarineSnow.tsx` | 700 shader-animated drifting motes (zero CPU/frame) |
| `GodRays.tsx` | 7 additive breathing light shafts |
| `DepthScan.tsx` | Eased glowing sweep plane cycling surface→floor (7 s period) |
| `CurrentVectors.tsx` | Instanced cone arrows from REAL HYCOM u/v; orientation=flow, size=speed, snapped to nearest available depth (0/50/150 m) |
| `CameraRig` | Lerps camera + orbit target to clicked instrument |
| `CinemaRig` | Slow attract-mode orbit when enabled |

---

## PHASE 3 — CONTROLS & UI

Layout: floating glass cards on the left stack over the fullscreen canvas.

| Card / file | Controls inside |
|---|---|
| Header card | Title, subtitle |
| `ControlPanel.tsx` | Variable select (5 fields) · depth slider (25 levels) · **Play/Pause + time scrubber** driving shared `seasonClock` · layer opacity |
| `ColorbarEditor.tsx` | 4 palettes (turbo/viridis/plasma/diverging) rendered **from the same LUT as the shader** · numeric min/max · log toggle (disabled if min≤0) · reset |
| `VerticalExaggeration.tsx` | Slider 10×–200×, live re-positioning of all geometry |
| `IsosurfaceControl.tsx` | Enable toggle + iso-value slider clamped to variable range |
| `VolumeViewsControl.tsx` | Class-cloud enable + numeric band · transect enable + latitude slider |
| `AtmosphereControl.tsx` | Aquarium walls · marine snow · light shafts · depth scan · cinematic orbit · current vectors · sun elevation |
| Top-right button | **Model vs Obs** modal (`ScatterPanel.tsx`): scatter of 425 platform surface obs vs gridded field, 1:1 line, bias/RMSE stats |
| Bottom-right | `ProfilePanel.tsx` on marker click: recharts depth-profile, observed dots vs model line, cycle switcher |

**State:** single zustand store (`src/lib/store.ts`) holds every control value; scene objects read via `useOcean.getState()` inside `useFrame` (no re-render storms).

**Shared animation clock** (`src/lib/season.ts`): `{ t: monthIndex(float), playing, monthsPerSecond:1.4 }`.

---

## PHASE 4 — INSTRUMENT OVERLAY (see markers + profile panel above)

Model-vs-obs correlation chain:
1. Marker hover → obs temp (shallowest <20 m reading of latest cycle) vs model temp (`sampleField` decode)
2. Click → ProfilePanel samples the field binary across all 25 depths at that cell → amber model line vs blue observed dots
3. ScatterPanel aggregates this across ALL platforms → fleet-level validation view

---

## PHASE 5 — STRETCH FEATURES DELIVERED

Isosurface · URL-ready store shape · Model-vs-obs scatter (n=425, bias −0.08 °C, RMSE 1.33 °C) · bathymetry · class clouds · transect · aquarium walls · dense stack · marine snow · god rays · sun control · cinematic orbit · depth scan · Gerstner waves · HYCOM currents · SST anomaly mode.

---

## KEY FILES MAP

```
app/
  page.tsx                     → redirect /explore
  explore/page.tsx             → THE screen: canvas + left cards + modals
  api/manifest/route.ts        → manifest JSON
  api/field/[id]/route.ts      → field binaries
  api/field/currents/route.ts  → HYCOM current binary
  api/profiles/route.ts        → instrument profiles
src/
  types.ts                     → Manifest, FieldMeta, InstrumentPlatform…
  lib/
    store.ts                   → zustand (all controls)
    season.ts                  → shared morph clock
    colormaps.ts               → turbo/viridis/plasma/diverging LUTs
    api.ts / fieldCache.ts     → fetchers + binary cache
    morph.ts                   → frame blending + level bracketing
  scene/
    OceanScene.tsx             → canvas root, sky/fog/postfx, rigs
    Basemap.tsx                → animated Gerstner sea surface + coastlines
    SliceEngine.tsx/DepthSlices.tsx → dense morphing volume stack
    VolumeWalls.tsx            → aquarium walls
    Isosurface.tsx/marching.ts → marching tetrahedra + morph loop
    Bathymetry.tsx             → data-derived seafloor
    InstrumentMarkers.tsx      → pulsing markers, tooltips, fly-to
    CurrentVectors.tsx         → HYCOM arrows
    ClassClouds/Transect/MarineSnow/GodRays/DepthScan
    ColormapShader.ts          → shared slice fragment shader
    mapping.ts                 → geo↔world transforms + sampling
  ui/
    ControlPanel, ColorbarEditor, VerticalExaggeration,
    IsosurfaceControl, VolumeViewsControl, AtmosphereControl,
    ProfilePanel, ScatterPanel
ingest/
  common.py fetch_woa.py fetch_monthly_full.py fetch_argo.py
  fetch_glider.py fetch_hycom.py run_all.py gate1_check.py
tests/
  smoke.test.ts (planned) scatter_check.ts
```

## HONESTY RULES (keep in any redesign)
- WOA23 = "gridded CF-compliant analysis", never "INCOIS model output"
- HYCOM = external real currents, cited; older experiment (expt_93.0) because newer DAP2 endpoint is broken
- Anomaly mode labeled "derived"
- Runtime fully offline after ingest
