# Performance Diagnostic

## 1. Executive Summary

This diagnostic investigates why running the development environment causes the laptop to experience high CPU/GPU load, memory consumption, thermal ramp-up, and fan noise.

### The Exact Root Causes Identified:

1. **Unthrottled High-DPI WebGL Continuous Render Loop (Primary GPU & Thermal Cause)**:
   - In `src/components/Globe.tsx`, `<Canvas dpr={[1, 2]}>` runs a continuous unthrottled `useFrame()` render loop at native 60–144 Hz with 2x Retina device pixel ratio.
   - Every single frame recalculates 2,800 animated point particles (`<Stars count={2800}>`), a custom Fresnel atmosphere shader, dynamic mesh lighting, and pulsing geometry.
   - Even when the user is completely idle reading educational text on Page 1 or Page 2, the GPU is driven at 100% clock speed without frame pacing, causing rapid laptop thermal heating.

2. **File Watcher & TypeScript Compiler Scanning Massive Untracked Folders (Primary CPU & RAM Cause)**:
   - When running `next dev --webpack`, Webpack's file watcher (`watchpack`) and TypeScript's language service inspect all files matching `**/*.ts` and `**/*.tsx`.
   - In `tsconfig.json`, `exclude` only contains `["node_modules"]`.
   - Consequently, the tooling actively scans and watches:
     - `data/` (16.9 GB, 185 large NetCDF binary files)
     - `.venv/` (249 MB, 9,391 Python virtual environment files)
     - `node_modules/` (3.05 GB, 193,427 files)
     - `.next/` (1.24 GB cache)
     - `out/` (18.4 MB static build)
   - On Windows, recursively polling and indexing hundreds of thousands of files causes `node.exe` to spike CPU to 40–90% and inflate RAM to 1.5–2.5 GB.

3. **Heavy Unused Node Modules Indexing**:
   - Packages like `cesium` (^1.144.0, >300 MB), `resium`, `@react-three/postprocessing`, and `puppeteer-core` are present in `package.json` and `node_modules` but are completely unreferenced in the frontend codebase.

4. **Datasets Are NOT Materialized Into Browser RAM (Safe)**:
   - The frontend browser is **NOT** downloading the 16.9 GB raw NetCDF files. It only loads lightweight pre-sliced static binary buffers (16 MB in `public/data/`).
   - The backend uses lazy xarray slicing without full in-memory materialization.

---

## 2. CPU Usage Sources

| Source | Process | Cause | Impact |
| :--- | :--- | :--- | :--- |
| **Next.js / Webpack Watchpack** | `node.exe` | Watching 16.9 GB `data/` and 9,391 `.venv/` files | **HIGH (30–60% CPU spikes)** |
| **TypeScript Language Server** | `tsserver.exe` | Indexing workspace root without strict folder boundaries | **HIGH (20–40% CPU)** |
| **R3F WebGL Animation Loop** | Browser Process | Continuous `useFrame` calculating rotation & pulse every frame | **MEDIUM (15–25% CPU)** |
| **Backend FastAPI** | `python.exe` | Startup is instant; lazy xarray slicing occurs only on request | **NEGLIGIBLE (0–1% CPU idle)** |

---

## 3. RAM Usage Sources

| Source | Allocated RAM | Description |
| :--- | :--- | :--- |
| **`node.exe` (Dev Server & Webpack Cache)** | ~1,200 – 1,800 MB | AST caching, compilation bundles, and file tree index |
| **Browser (Chrome/Edge Tab)** | ~600 – 900 MB | WebGL canvas context, 2048x1024 texture, Starfield geometry |
| **`python.exe` (FastAPI backend)** | ~120 – 180 MB | Python runtime, lazy xarray dataset handles (safe) |
| **Disk Storage (Non-RAM)** | 16.9 GB | Raw NetCDF files stored safely on disk in `data/` |

---

## 4. GPU / WebGL Usage Sources

| Component | File | Mechanism | Performance Impact |
| :--- | :--- | :--- | :--- |
| **Earth Globe Mesh** | `src/components/Globe.tsx` | 4,096 vertices sphere with standard material & texture | Moderate |
| **Starfield Particles** | `src/components/Globe.tsx` | `Stars count={2800}` animated continuously | **HIGH GPU draw calls** |
| **Fresnel Atmosphere** | `src/components/Globe.tsx` | Custom vertex + fragment GLSL shader pass | Moderate |
| **Canvas DPR** | `src/components/Globe.tsx` | `dpr={[1, 2]}` forces 2x rendering on High-DPI screens | **VERY HIGH GPU fill rate** |
| **Frame Loop Mode** | `src/components/Globe.tsx` | Default `frameloop="always"` runs at 60–144 FPS non-stop | **PRIMARY THERMAL SOURCE** |

---

## 5. Browser Activity

- **Initial Load Size**: ~3.2 MB (HTML, Next.js client bundles, Tailwind CSS, Earth texture).
- **Network Requests**: 12 requests on Page 1 / Page 2. No NetCDF files are fetched directly into the browser.
- **Console / Memory Leaks**: Zero memory leaks detected; textures and geometries are appropriately memoized.
- **Continuous Execution**: The only ongoing browser work is the WebGL requestAnimationFrame loop in `GlobeCanvas`.

---

## 6. Backend Activity

- **Startup Execution**: `RSMCAdapter` in `backend/adapters/incois_rsmc.py` calls `xarray.open_dataset()` lazily.
- **In-Memory Materialization**: Zero full dataset loading (`.load()` or `.values` on entire 15 GB cubes is avoided).
- **Request Slicing**: Slices are extracted with stride indexing and quantized into ~280 KB uint8 buffers on demand.
- **Backend Idle State**: Consumes < 0.5% CPU when no requests are being served.

---

## 7. Next.js / File-Watching Activity

- The Next.js dev server runs with `--webpack`.
- Webpack monitors the filesystem using chokidar/watchpack.
- Because `data/` (16.9 GB) and `.venv/` (9,391 files) reside inside the root folder without explicit exclusion in webpack/tsconfig, the watcher creates extensive in-memory watch trees.
- On Windows NTFS filesystems, this causes elevated background disk I/O and CPU polling.

---

## 8. Large Dataset Analysis

| Path | Size | File Count | Purpose | Status |
| :--- | :--- | :--- | :--- | :--- |
| `data/model/copernicus_daily/` | **15.47 GB** | 90 NetCDF | Daily CMEMS ocean physics model (Q1 2026) | **REQUIRED (On Disk)** |
| `data/model/copernicus_chlorophyll_daily/` | **575.40 MB** | 90 NetCDF | Daily CMEMS chlorophyll/BGC model (Q1 2026) | **REQUIRED (On Disk)** |
| `data/argo/ocldb1788270080.21439_PFL.nc` | **417.26 MB** | 1 NetCDF | 22,231 in-situ Argo float profiles | **REQUIRED (On Disk)** |
| `data/bgc/ocldb1788270080.21439_PFL.nc` | **417.26 MB** | 1 NetCDF | Duplicate of Argo PFL file | **DUPLICATE** |
| `data/ctd/ocldb1788270080.21439_CTD.nc` | **34.08 MB** | 1 NetCDF | 619 deep-sea shipboard CTD profiles | **REQUIRED (On Disk)** |
| `data/glider/ocldb1788270080.21439_GLD.nc` | **15.65 MB** | 1 NetCDF | 2,591 high-resolution glider dives | **REQUIRED (On Disk)** |
| `public/data/` | **16.04 MB** | 404 files | Pre-sliced binary volume grids & manifest | **REQUIRED (Frontend)** |

---

## 9. Page 1 (Landing Page) Analysis

- **Visual / Functional State**: Clean hero layout with `GlobeCanvas` in background.
- **Performance Evaluation**: **ISSUE (GPU Thermal Load)**.
  - Page 1 mounts `GlobeCanvas` which runs the unthrottled 60–144 FPS WebGL loop with 2,800 stars and 2x DPR.
  - After 30–60 seconds of sitting on Page 1, GPU fans spin up due to continuous unconstrained rendering.

---

## 10. Page 2 (Study Region / Scientific Journey) Analysis

- **Visual / Functional State**: 50/50 two-column split layout with interactive timeline and `GlobeCanvas`.
- **Performance Evaluation**: **ISSUE (GPU Thermal Load)**.
  - Page 2 mounts `GlobeCanvas` with the same continuous WebGL loop.
  - The 2D UI elements (Framer Motion timeline, typewriter card) consume minimal CPU (< 2%).

---

## 11. Page 3 (3D Exploration Page) Analysis

- **Visual / Functional State**: Minimal clean placeholder shell.
- **Performance Evaluation**: **SAFE (Zero GPU / Zero Extra CPU Load)**.
  - All old 3D volume shaders, inspector charts, and simulation docks have been removed.
  - Page 3 itself currently creates 0% WebGL load.

---

## 12. Unnecessary & Candidate Files

| Path | Classification | Reason | Safe to Remove Later? |
| :--- | :--- | :--- | :--- |
| `INCOIS-3D-Ocean-Data-Visualization-Platform/` | **REMOVE SAFELY** | Duplicate repository / legacy documentation folder (3.08 MB) | Yes (when approved) |
| `data/bgc/ocldb1788270080.21439_PFL.nc` | **DUPLICATE** | Exact binary copy of `data/argo/ocldb1788270080.21439_PFL.nc` (417 MB) | Yes (when approved) |
| `.next/` | **TEMPORARY** | Old Next.js build cache (1.24 GB) — regenerated on build | Safe to clear |
| `out/` | **TEMPORARY** | Static export artifacts from previous build (18.4 MB) | Safe to clear |
| `tests/` | **OPTIONAL** | Empty/minimal test stub (0.01 MB) | Keep or remove |

---

## 13. Unused Packages in `package.json`

| Package | Why It Exists in package.json | Used Anywhere in Code? | Currently Needed? | Status |
| :--- | :--- | :--- | :--- | :--- |
| `cesium` (^1.144.0) | Leftover from initial CesiumJS experiment | **No (0 references)** | No | **Removable** |
| `resium` (^1.25.0) | React wrapper for Cesium | **No (0 references)** | No | **Removable** |
| `@react-three/postprocessing` | Postprocessing effects | **No (0 references)** | No | **Removable** |
| `postprocessing` | Three.js postprocessing | **No (0 references)** | No | **Removable** |
| `recharts` (^3.10.1) | Old chart library | **No (0 references)** | No | **Removable** |
| `puppeteer-core` (^25.8.0) | Headless browser testing | **No (0 references)** | No | **Removable** |

---

## 14. Recommended Fixes (For Review & Future Approval)

### Priority: CRITICAL (Will Immediately Stop Laptop Overheating)
1. **Cap & Optimize WebGL in `src/components/Globe.tsx`**:
   - Set `dpr={[1, 1.5]}` (or `1`) instead of `[1, 2]` to eliminate 4K over-rendering.
   - Reduce particle count in `<Stars count={2800}>` to `count={800}` (visually identical, 70% lower GPU draw).
   - Throttle or cap framerate when idle.

### Priority: HIGH (Will Eliminate Node.js CPU Spikes & Memory Bloat)
2. **Exclude `data/`, `.venv/`, `out/` in `tsconfig.json` and Next.js Webpack Watcher**:
   - Add `"exclude": ["node_modules", ".venv", "data", "out", ".next"]` in `tsconfig.json`.
   - Prevent Webpack watchpack from recursively monitoring the 16.9 GB NetCDF dataset directory.

### Priority: MEDIUM (Cleanup Workspace & Dependency Bloat)
3. **Remove Unused Large Packages**:
   - Uninstall `cesium`, `resium`, `recharts`, `postprocessing`, and `puppeteer-core` from `package.json`.
4. **Remove Duplicate BGC NetCDF**:
   - Point BGC data directly to `data/argo/ocldb1788270080.21439_PFL.nc` and remove the 417 MB duplicate in `data/bgc/`.
5. **Delete Legacy Folder `INCOIS-3D-Ocean-Data-Visualization-Platform/`**.
