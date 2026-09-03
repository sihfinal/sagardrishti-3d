# Current Data Flow Map

This document describes the flow of every dataset from its original source provider, through the ingestion and quantization pipeline, to the final rendering components in the 3D client frontend.

---

## 1. Core Data Flow Map by Dataset

### A. WOA23 Annual Temperature
```
NOAA NCEI
→ fetch_woa.py
→ xarray (OPeNDAP slice / netcdf4)
→ crop (ROI) + depth subset (25 levels)
→ QC (gate1_check.py)
→ uint8 linear quantization
→ temp_annual.bin (committed to /public/data)
→ fetchFieldBinary (api.ts) & getFieldData (fieldCache.ts)
→ DepthSlices.tsx, Isosurface.tsx, Transect.tsx, VolumeWalls.tsx
→ 3D Temperature volume slices, isosurfaces, and vertical cross-sections
```

### B. WOA23 Annual Salinity
```
NOAA NCEI
→ fetch_woa.py
→ xarray (OPeNDAP slice / netcdf4)
→ crop (ROI) + depth subset (25 levels)
→ QC (gate1_check.py)
→ uint8 linear quantization
→ salt_annual.bin (committed to /public/data)
→ fetchFieldBinary (api.ts) & getFieldData (fieldCache.ts)
→ DepthSlices.tsx, Isosurface.tsx, Transect.tsx, VolumeWalls.tsx
→ 3D Salinity volume slices, isosurfaces, and vertical cross-sections
```

### C. WOA23 Monthly Surface Temperature (SST)
```
NOAA NCEI
→ fetch_woa.py
→ xarray (OPeNDAP slice / netcdf4)
→ crop (ROI) + surface slice (0m depth)
→ QC (gate1_check.py)
→ uint8 linear quantization
→ sst_monthly.bin (committed to /public/data)
→ fetchFieldBinary (api.ts) & getFieldData (fieldCache.ts)
→ DepthSlices.tsx, SimControls.tsx
→ 3D SST surface slice time-stepped animation
```

### D. WOA23 Monthly Temperature Volume
```
NOAA NCEI
→ fetch_monthly_full.py
→ xarray (OPeNDAP slice / netcdf4)
→ crop (ROI) + depth subset (25 levels)
→ QC (gate1_check.py)
→ uint8 linear quantization
→ temp_monthly.bin (committed to /public/data)
→ fetchFieldBinary (api.ts) & getFieldData (fieldCache.ts)
→ DepthSlices.tsx, SimControls.tsx, HovmollerStrip.tsx
→ 3D time-series temperature volume rendering & seasonal strip charts
```

### E. WOA23 Sea Surface Temperature Anomaly
```
Derived from WOA23 Monthly & Annual Surface
→ fetch_monthly_full.py
→ numpy (subtract monthly surface from annual mean)
→ crop (ROI)
→ QC (gate1_check.py)
→ uint8 symmetric diverging quantization
→ sst_anomaly.bin (committed to /public/data)
→ fetchFieldBinary (api.ts) & getFieldData (fieldCache.ts)
→ DepthSlices.tsx, ColormapShader.ts
→ 3D diverging color surface anomaly render (blue=colder, red=warmer)
```

### F. HYCOM Ocean Currents Vectors
```
HYCOM Consortium
→ fetch_hycom.py
→ xarray (OPeNDAP slice / netcdf4)
→ crop (ROI) + index sampling + depth subset (0, 50, 150m)
→ QC (verify max speed bounds)
→ int8 interleave quantization ([-127, 127] scaled by max speed)
→ currents.bin (committed to /public/data)
→ fetchFieldBinary (api.ts) & getFieldData (fieldCache.ts)
→ CurrentVectors.tsx
→ 3D vector arrows and flow particles
```

### G. Ifremer Argo Float Profiles (Observations)
```
Ifremer ERDDAP
→ fetch_argo.py
→ csv.reader
→ CSV query filters (ROI coordinates + time window)
→ QC (drop empty records)
→ fnum() conversion & float rounding
→ profiles.json (committed to /public/data)
→ fetchProfiles (api.ts)
→ InstrumentMarkers.tsx, ProfilePanel.tsx, ObservationErrorLayer.tsx
→ 3D platform markers, profile charts, and "Assimilation Lens" error comparison
```

### H. IOOS Glider DAC Profiles (Observations)
```
IOOS Glider DAC
→ fetch_glider.py
→ csv.reader
→ index scanning + CSV query bounds (ROI)
→ QC (drop records missing depth)
→ day-based pseudo-cycle bucketing + profile downsampling (120 pts)
→ profiles.json (committed to /public/data)
→ fetchProfiles (api.ts)
→ InstrumentMarkers.tsx, ProfilePanel.tsx, ObservationErrorLayer.tsx
→ 3D platform markers, profile charts, and "Assimilation Lens" error comparison
```

### I. Ifremer Synthetic BGC-Argo Profiles (Observations)
```
Ifremer BGC ERDDAP
→ fetch_bgc.py
→ csv.reader
→ CSV query filters (ROI bounds + time window)
→ QC (drop records missing pres/chla)
→ platform grouping + profile downsampling (120 pts)
→ profiles.json (updated and committed to /public/data)
→ fetchProfiles (api.ts)
→ InstrumentMarkers.tsx, ProfilePanel.tsx, ObservationErrorLayer.tsx
→ 3D platform markers, chlorophyll profiles, and comparison charts
```

---

## 2. Current Architecture Diagram

```
[ NOAA NCEI WOA23 ]    [ HYCOM Consortium ]    [ Ifremer & IOOS ERDDAP ]
        │                       │                         │
        │ (OPeNDAP via HTTPS)   │ (OPeNDAP via HTTPS)     │ (HTTP CSV tabledap)
        ▼                       ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           OFFLINE PYTHON INGEST                          │
│                                                                          │
│  [ fetch_woa.py ]          [ fetch_hycom.py ]      [ fetch_argo.py ]     │
│  [ fetch_monthly_full.py ]                         [ fetch_glider.py ]   │
│                                                    [ fetch_bgc.py ]      │
│                                                                          │
│  Operations: Slicing, Subsampling, Downsampling, QC, Quantization        │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼ (Write Static Outputs)
┌──────────────────────────────────────────────────────────────────────────┐
│                            REPOSITORY STORAGE                            │
│                         (public/data/ Directory)                         │
│                                                                          │
│  manifest.json          temp_annual.bin          currents.bin            │
│  profiles.json          salt_annual.bin          sst_anomaly.bin         │
│  coastlines.json        temp_monthly.bin         sst_monthly.bin         │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼ (HTTP GET Fetch Requests)
┌──────────────────────────────────────────────────────────────────────────┐
│                       FRONTEND STATIC DATA LOADER                        │
│                           (src/lib/api.ts)                               │
│                                                                          │
│  fetchManifest()        fetchFieldBinary()       fetchProfiles()         │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼ (ArrayBuffer Decoding & Memory Cache)
┌──────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND COMPONENTS                           │
│                                                                          │
│   ┌───────────────────────────┐         ┌───────────────────────────┐    │
│   │    3D VISUALIZATIONS      │         │    DATA READOUTS & UI     │    │
│   │                           │         │                           │    │
│   │  * DepthSlices.tsx        │         │  * ControlPanel.tsx       │    │
│   │  * Isosurface.tsx         │         │  * ProfilePanel.tsx       │    │
│   │  * CurrentVectors.tsx     │         │  * ScatterPanel.tsx       │    │
│   │  * InstrumentMarkers.tsx  │         │  * HovmollerStrip.tsx     │    │
│   │  * ObsErrorLayer.tsx      │         │  * validatePlatform.ts    │    │
│   └───────────────────────────┘         └───────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```
