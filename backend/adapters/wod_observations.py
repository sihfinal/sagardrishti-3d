from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional
import netCDF4
import numpy as np

log = logging.getLogger(__name__)

def _to_float(val: Any) -> Optional[float]:
    if val is None or np.ma.is_masked(val):
        return None
    try:
        f = float(val)
        return None if np.isnan(f) else f
    except (ValueError, TypeError):
        return None

def _format_date(d_val: Any) -> Optional[str]:
    if d_val is None or np.ma.is_masked(d_val):
        return None
    try:
        s = str(int(d_val))
        if len(s) == 8:
            return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
        return s
    except (ValueError, TypeError):
        return None

class WODObservationAdapter:
    """
    High-performance indexed adapter for NOAA/WOD Discrete Sampling Geometries (DSG)
    Ragged Array NetCDF files:
      - Argo Floats (PFL)
      - Gliders (GLD)
      - Shipboard CTD (CTD)
      - Genuine Biogeochemical (BGC) Profiles
    """

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.argo_path = data_dir / "argo" / "ocldb1788270080.21439_PFL.nc"
        self.glider_path = data_dir / "glider" / "ocldb1788270080.21439_GLD.nc"
        self.ctd_path = data_dir / "ctd" / "ocldb1788270080.21439_CTD.nc"
        
        self._index_cache: dict[str, list[dict[str, Any]]] = {}
        self._counts_by_type: dict[str, int] = {}
        self._build_index()

    def _build_index(self) -> None:
        """Extract lightweight cast index (id, lat, lon, time) into memory."""
        datasets = [
            ("argo", self.argo_path),
            ("glider", self.glider_path),
            ("ctd", self.ctd_path),
        ]

        bgc_records = []

        for dtype, path in datasets:
            if not path.exists():
                self._index_cache[dtype] = []
                self._counts_by_type[dtype] = 0
                continue

            try:
                nc = netCDF4.Dataset(str(path), "r")
                cast_ids = nc.variables["wod_unique_cast"][:]
                lats = nc.variables["lat"][:]
                lons = nc.variables["lon"][:]
                dates = nc.variables["date"][:] if "date" in nc.variables else [None] * len(cast_ids)
                
                # Check for available sensor row sizes
                temp_sizes = nc.variables["Temperature_row_size"][:] if "Temperature_row_size" in nc.variables else np.zeros(len(cast_ids))
                sal_sizes = nc.variables["Salinity_row_size"][:] if "Salinity_row_size" in nc.variables else np.zeros(len(cast_ids))
                chl_sizes = nc.variables["Chlorophyll_row_size"][:] if "Chlorophyll_row_size" in nc.variables else np.zeros(len(cast_ids))
                oxy_sizes = nc.variables["Oxygen_row_size"][:] if "Oxygen_row_size" in nc.variables else np.zeros(len(cast_ids))
                nit_sizes = nc.variables["Nitrate_row_size"][:] if "Nitrate_row_size" in nc.variables else np.zeros(len(cast_ids))
                ph_sizes = nc.variables["pH_row_size"][:] if "pH_row_size" in nc.variables else np.zeros(len(cast_ids))

                records = []
                for i in range(len(cast_ids)):
                    cid = int(cast_ids[i])
                    d_str = _format_date(dates[i])
                    
                    # Discover specific measured variables for this cast based on positive row size
                    var_names = []
                    if not np.ma.is_masked(temp_sizes[i]) and int(temp_sizes[i]) > 0:
                        var_names.append("temperature")
                    if not np.ma.is_masked(sal_sizes[i]) and int(sal_sizes[i]) > 0:
                        var_names.append("salinity")

                    is_bgc_cast = False
                    if not np.ma.is_masked(chl_sizes[i]) and int(chl_sizes[i]) > 0:
                        var_names.append("chlorophyll")
                        is_bgc_cast = True
                    if not np.ma.is_masked(oxy_sizes[i]) and int(oxy_sizes[i]) > 0:
                        var_names.append("oxygen")
                        is_bgc_cast = True
                    if not np.ma.is_masked(nit_sizes[i]) and int(nit_sizes[i]) > 0:
                        var_names.append("nitrate")
                        is_bgc_cast = True
                    if not np.ma.is_masked(ph_sizes[i]) and int(ph_sizes[i]) > 0:
                        var_names.append("ph")
                        is_bgc_cast = True

                    rec = {
                        "id": f"{dtype}_{cid}",
                        "cast_id": cid,
                        "type": dtype,
                        "platform_id": str(cid),
                        "latitude": float(lats[i]),
                        "longitude": float(lons[i]),
                        "timestamp": d_str,
                        "variables": var_names,
                        "source": "NOAA / NCEI World Ocean Database",
                    }
                    records.append(rec)

                    # If this cast is equipped with genuine BGC sensors, index in bgc pool
                    if is_bgc_cast and dtype == "argo":
                        bgc_rec = dict(rec)
                        bgc_rec["id"] = f"bgc_{cid}"
                        bgc_rec["type"] = "bgc"
                        bgc_records.append(bgc_rec)

                nc.close()
                self._index_cache[dtype] = records
                self._counts_by_type[dtype] = len(records)
                log.info(f"Indexed {len(records)} {dtype.upper()} casts from {path.name}")
            except Exception as e:
                log.error(f"Error indexing {dtype} from {path}: {e}")
                self._index_cache[dtype] = []
                self._counts_by_type[dtype] = 0

        # Dedicated BGC-equipped profiling float records
        self._index_cache["bgc"] = bgc_records
        self._counts_by_type["bgc"] = len(bgc_records)
        log.info(f"Indexed {len(bgc_records)} genuine BGC casts with biochemical sensors")

    def get_counts(self) -> dict[str, int]:
        return self._counts_by_type

    def get_observations(
        self,
        obs_type: Optional[str] = "all",
        lat_min: Optional[float] = None,
        lat_max: Optional[float] = None,
        lon_min: Optional[float] = None,
        lon_max: Optional[float] = None,
        limit: int = 2000,
    ) -> list[dict[str, Any]]:
        """
        Query observations with balanced quota sampling across all platforms
        when obs_type is 'all'.
        """
        target_types = (
            ["argo", "glider", "ctd", "bgc"]
            if (not obs_type or obs_type.lower() == "all")
            else [obs_type.lower()]
        )

        # Step 1: Filter each requested observation type by geographic bounding box
        filtered_by_type: dict[str, list[dict[str, Any]]] = {}
        for t in target_types:
            pool = self._index_cache.get(t, [])
            matched = []
            for r in pool:
                if lat_min is not None and r["latitude"] < lat_min:
                    continue
                if lat_max is not None and r["latitude"] > lat_max:
                    continue
                if lon_min is not None and r["longitude"] < lon_min:
                    continue
                if lon_max is not None and r["longitude"] > lon_max:
                    continue
                matched.append(r)
            filtered_by_type[t] = matched

        # If single observation type requested, slice to limit directly
        if len(target_types) == 1:
            return filtered_by_type[target_types[0]][:limit]

        # Step 2: Balanced quota distribution algorithm with rollover for smaller pools
        available_counts = {t: len(filtered_by_type[t]) for t in target_types}
        total_available = sum(available_counts.values())

        if total_available <= limit:
            results = []
            for t in target_types:
                results.extend(filtered_by_type[t])
            return results

        # Compute fair share with quota redistribution for smaller pools
        allocated_quotas = {t: 0 for t in target_types}
        remaining_limit = limit
        active_types = [t for t in target_types if available_counts[t] > 0]

        while remaining_limit > 0 and active_types:
            base_quota = remaining_limit // len(active_types)
            remainder = remaining_limit % len(active_types)
            if base_quota == 0 and remainder > 0:
                base_quota = 1

            next_active = []
            for idx, t in enumerate(active_types):
                extra = 1 if idx < remainder else 0
                take = min(available_counts[t] - allocated_quotas[t], base_quota + extra)
                if take > 0:
                    allocated_quotas[t] += take
                    remaining_limit -= take
                if allocated_quotas[t] < available_counts[t]:
                    next_active.append(t)

            if len(next_active) == len(active_types) and all(base_quota == 0 for _ in next_active):
                break
            active_types = next_active

        # Step 3: Collect balanced samples from each type pool
        results = []
        for t in target_types:
            q = allocated_quotas[t]
            if q > 0:
                results.extend(filtered_by_type[t][:q])

        return results

    def get_profile(self, obs_id: str) -> Optional[dict[str, Any]]:
        """
        Extract depth-resolved vertical profile for a specific observation ID.
        Uses independent per-variable row_size offsets to correctly index
        disparate ragged arrays. Supports both 'argo_20059500' and '20059500'.
        """
        parts = obs_id.split("_")
        if len(parts) >= 2:
            dtype = parts[0].lower()
            try:
                cid = int(parts[1])
            except ValueError:
                return None
        else:
            try:
                cid = int(obs_id)
                dtype = None
            except ValueError:
                return None

        file_map = {
            "argo": self.argo_path,
            "glider": self.glider_path,
            "ctd": self.ctd_path,
            "bgc": self.argo_path,
        }

        search_targets = [(dtype, file_map[dtype])] if dtype and dtype in file_map else [
            ("argo", file_map["argo"]),
            ("glider", file_map["glider"]),
            ("ctd", file_map["ctd"]),
        ]

        for d_type, path in search_targets:
            if not path or not path.exists():
                continue

            try:
                nc = netCDF4.Dataset(str(path), "r")
                cast_ids = nc.variables["wod_unique_cast"][:]
                
                match_indices = np.where(cast_ids == cid)[0]
                if len(match_indices) == 0:
                    nc.close()
                    continue
                
                cast_idx = match_indices[0]
                lat = float(nc.variables["lat"][cast_idx])
                lon = float(nc.variables["lon"][cast_idx])
                d_str = _format_date(nc.variables["date"][cast_idx]) if "date" in nc.variables else None

                z_sizes = nc.variables["z_row_size"][:]
                if np.ma.is_masked(z_sizes[cast_idx]) or int(z_sizes[cast_idx]) <= 0:
                    nc.close()
                    return None

                z_count = int(z_sizes[cast_idx])
                z_start = int(np.sum(np.ma.filled(z_sizes[:cast_idx], 0)))
                depths = nc.variables["z"][z_start : z_start + z_count]

                # Extract each variable independently using its own row_size array
                var_slices: dict[str, Any] = {}
                var_mappings = [
                    ("temperature", "Temperature"),
                    ("salinity", "Salinity"),
                    ("chlorophyll", "Chlorophyll"),
                    ("oxygen", "Oxygen"),
                    ("nitrate", "Nitrate"),
                    ("ph", "pH"),
                ]

                for v_key, nc_var_name in var_mappings:
                    rs_name = f"{nc_var_name}_row_size"
                    if nc_var_name in nc.variables and rs_name in nc.variables:
                        v_rs = nc.variables[rs_name][:]
                        if not np.ma.is_masked(v_rs[cast_idx]) and int(v_rs[cast_idx]) > 0:
                            v_count = int(v_rs[cast_idx])
                            v_start = int(np.sum(np.ma.filled(v_rs[:cast_idx], 0)))
                            var_slices[v_key] = nc.variables[nc_var_name][v_start : v_start + v_count]
                        else:
                            var_slices[v_key] = None
                    else:
                        var_slices[v_key] = None

                profile_points = []
                for i in range(z_count):
                    d_val = _to_float(depths[i])
                    if d_val is None:
                        continue

                    pt = {"depth": d_val}
                    for v_key in ["temperature", "salinity", "chlorophyll", "oxygen", "nitrate", "ph"]:
                        vals = var_slices.get(v_key)
                        pt[v_key] = _to_float(vals[i]) if (vals is not None and i < len(vals)) else None
                    profile_points.append(pt)

                valid_depths = [p["depth"] for p in profile_points]
                max_d = float(max(valid_depths)) if valid_depths else 0.0
                nc.close()

                active_vars = [k for k in ["temperature", "salinity", "chlorophyll", "oxygen", "nitrate", "ph"] if any(p.get(k) is not None for p in profile_points)]

                return {
                    "id": f"{d_type}_{cid}",
                    "type": d_type,
                    "platform_id": str(cid),
                    "timestamp": d_str,
                    "latitude": lat,
                    "longitude": lon,
                    "max_depth": max_d,
                    "variables": active_vars,
                    "source": "NOAA / NCEI World Ocean Database",
                    "data": profile_points,
                }
            except Exception as e:
                log.error(f"Error reading profile {obs_id}: {e}")
                return None

        return None
