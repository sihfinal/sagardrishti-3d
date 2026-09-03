# Current Storage and Data Contract

This document outlines the file-based storage format and exact binary/JSON schema contracts that bind the ingestion scripts to the Next.js client frontend.

---

## 1. Storage Location & Overview

All data files are written to the repository at `/public/data/`. Because there is no runtime database or active server, the frontend fetches these files directly using standard HTTP GET requests.

### Data Catalog
| Filename | Format | Description | Size on Disk |
| :--- | :--- | :--- | :--- |
| `manifest.json` | JSON | Metadata, grid spacing, variables list, encoding values, profiles metrics. | ~6 KB |
| `profiles.json` | JSON | Merged database of all Argo, Glider, and BGC profile cycle readings. | ~7.5 MB |
| `coastlines.json` | JSON | GeoJSON-like boundary coordinates for the coastlines basemap overlays. | ~155 KB |
| `temp_annual.bin` | Binary | 3D gridded Temperature volume (uint8 quantized). | 97.5 KB |
| `salt_annual.bin` | Binary | 3D gridded Salinity volume (uint8 quantized). | 97.5 KB |
| `temp_monthly.bin` | Binary | 12 monthly frames of 3D Temperature volume (uint8 quantized). | 1.17 MB |
| `sst_monthly.bin` | Binary | 12 monthly frames of surface Temperature (uint8 quantized). | 46.8 KB |
| `sst_anomaly.bin` | Binary | 12 monthly frames of surface Temperature Anomaly (uint8 quantized). | 46.8 KB |
| `currents.bin` | Binary | 3D gridded Current vectors (int8 interleaved `u` and `v` currents). | 102.8 KB |

---

## 2. JSON Data Contracts

### A. `manifest.json` Schema
The entry point metadata file contains five root-level sections:
1. `roi`: Rectangle coordinates representing the Region of Interest bounds.
2. `grid`: Gridded grid dimensions (latitudes, longitudes).
3. `variables`: Array of 3D/climatology metadata definitions.
4. `profiles`: Observations profiling stats.
5. `currents`: Metadata describing the HYCOM currents array.

```json
{
  "roi": {
    "latMin": -35.0,
    "latMax": 30.0,
    "lonMin": 40.0,
    "lonMax": 100.0
  },
  "grid": {
    "nLat": 65,
    "nLon": 60,
    "lats": [-34.5, -33.5, ..., 29.5],
    "lons": [40.5, 41.5, ..., 99.5]
  },
  "variables": [
    {
      "id": "temp_annual",
      "name": "Temperature",
      "unit": "°C",
      "source": "...",
      "depthsM": [0.0, 5.0, ..., 600.0],
      "globalMin": 7.5118,
      "globalMax": 30.2948,
      "encoding": {
        "dtype": "uint8",
        "scale": 0.0896968,
        "offset": 7.5118,
        "fillByte": 255
      },
      "file": "temp_annual.bin",
      "provenance": {
        "url": "...",
        "citation": "..."
      },
      "dims": {
        "nDepth": 25,
        "nLat": 65,
        "nLon": 60,
        "nTime": 1
      },
      "times": ["Jan", "Feb", ..., "Dec"] // Optional, only present for time-stepped monthly grids
    }
  ],
  "profiles": {
    "file": "profiles.json",
    "count": 488,
    "platformsByType": {
      "argo": 463,
      "glider": 1,
      "bgc": 24
    }
  },
  "currents": {
    "file": "currents.bin",
    "source": "...",
    "depthsM": [0.0, 50.0, 150.0],
    "nLat": 136,
    "nLon": 126,
    "lats": [...],
    "lons": [...],
    "scaleCms": 3.21,
    "nanByte": -128,
    "citation": "..."
  }
}
```

### B. `profiles.json` Schema
Stores all profile observations bucketed under their platform numbers:
```json
{
  "platforms": [
    {
      "id": "1901633",
      "type": "argo", // "argo" | "glider" | "bgc"
      "lon": 72.84,
      "lat": -12.35,
      "lastSeen": "2024-08-23T08:48:00Z",
      "cycles": [
        {
          "time": "2024-08-10T12:00:00Z",
          "lon": 72.5,
          "lat": -12.5,
          "profile": [
            {
              "depthM": 0.0,
              "tempC": 25.52,
              "salPsu": 35.12,
              "chla": null
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 3. Binary Encoding Contracts

### A. 8-Bit Quantized Variables (`temp_annual`, `salt_annual`, `temp_monthly`, `sst_monthly`, `sst_anomaly`)
To minimize transmission size, floating-point data is quantized into a single `uint8` byte.
- **Conversion Equation during Ingest**:
  $$q = \text{round}\left((v - v_{\text{min}}) \times \frac{254}{v_{\text{max}} - v_{\text{min}}}\right)$$
- **Decoding Equation in Frontend**:
  $$v = \text{offset} + \left(\frac{q}{254}\right) \times (v_{\text{globalMax}} - v_{\text{globalMin}})$$
  *Where $\text{offset} = v_{\text{globalMin}}$.*
- **Special Values**:
  * `255`: Fill byte (representing Land/Missing Data). Discarded inside the shader.

### B. Interleaved Ocean Currents (`currents.bin`)
- Currents vectors contain both eastward ($u$) and northward ($v$) components.
- Stored as signed 8-bit `int8` values.
- **Interleaving Pattern**:
  For each grid node at a given depth layer, $u$ and $v$ are written adjacent to each other.
  - Data layout: `[nDepth][2][nLat][nLon]` (flat byte stream).
- **Conversion Equation during Ingest**:
  $$q_u = \text{clamp}\left(\text{round}\left(\frac{u}{\text{maxSpeed}} \times 127\right), -127, 127\right)$$
  $$q_v = \text{clamp}\left(\text{round}\left(\frac{v}{\text{maxSpeed}} \times 127\right), -127, 127\right)$$
- **Special Values**:
  * `-128`: NaN / missing velocity value (e.g. land block).

---

## 4. Coordinate Space & Projection Contract

- **Geographic Grid**:
  - Model grids use simple decimal degree coordinates.
  - Grid cell size is explicitly mapped by `lats` and `lons` indices in the manifest.
  - The standard model grid is `65 x 60` (latitude nodes $\times$ longitude nodes).
- **Three-Dimensional Projection (Local Coordinates)**:
  - Translated relative to the center of the ROI box:
    $$\text{centerLon} = \frac{\text{lonMin} + \text{lonMax}}{2} = 70.0^\circ\text{E}$$
    $$\text{centerLat} = \frac{\text{latMin} + \text{latMax}}{2} = -2.5^\circ\text{N}$$
  - **Horizontal Scaling**: `HORIZ_SCALE = 1.5` units per degree.
    $$X = (\text{lon} - 70.0) \times 1.5$$
    $$Z = -(\text{lat} - (-2.5)) \times 1.5$$
  - **Vertical Scaling**: `VERT_FACTOR = 0.00025` units per meter, adjusted by the vertical exaggeration slider.
    $$Y = -\text{depth} \times \text{exaggeration} \times 0.00025$$
- **Spherical Coordinate Projection (Globe Basemap)**:
  - Core sphere radius: `SPHERE_RADIUS = 30.0` units.
  - Radial depth layers are mapped slightly inward:
    $$R = 30.0 - \text{depth} \times \text{exaggeration} \times 0.00025$$
  - Spherical position derived by standard conversions:
    $$\phi = (90 - \text{lat}) \times \frac{\pi}{180}$$
    $$\theta = (\text{lon} + 180) \times \frac{\pi}{180}$$
    $$X = -R \sin(\phi) \cos(\theta), \quad Y = R \cos(\phi), \quad Z = R \sin(\phi) \sin(\theta)$$
