from __future__ import annotations

import glob
import logging
from pathlib import Path
from typing import Any, Optional
import numpy as np
import xarray as xr

log = logging.getLogger(__name__)

VARIABLE_MAPPING = {
    "temperature": ("thetao", "copernicus_daily", "°C", -2.0, 35.0),
    "salinity": ("so", "copernicus_daily", "PSU", 0.0, 42.0),
    "u_velocity": ("uo", "copernicus_daily", "m/s", -3.0, 3.0),
    "v_velocity": ("vo", "copernicus_daily", "m/s", -3.0, 3.0),
    "chlorophyll": ("chl", "copernicus_chlorophyll_daily", "mg/m³", 0.01, 10.0),
    # Aliases
    "thetao": ("thetao", "copernicus_daily", "°C", -2.0, 35.0),
    "so": ("so", "copernicus_daily", "PSU", 0.0, 42.0),
    "uo": ("uo", "copernicus_daily", "m/s", -3.0, 3.0),
    "vo": ("vo", "copernicus_daily", "m/s", -3.0, 3.0),
    "chl": ("chl", "copernicus_chlorophyll_daily", "mg/m³", 0.01, 10.0),
}

class CMEMSModelAdapter:
    """
    High-performance lazy adapter for CMEMS Physical & BGC daily NetCDF archives.
    Indexes daily NetCDF files without reading 16+ GB arrays into memory.
    """

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.phy_dir = data_dir / "model" / "copernicus_daily"
        self.bgc_dir = data_dir / "model" / "copernicus_chlorophyll_daily"
        self._phy_files = sorted(glob.glob(str(self.phy_dir / "*.nc")))
        self._bgc_files = sorted(glob.glob(str(self.bgc_dir / "*.nc")))
        self._date_to_phy_file: dict[str, str] = {}
        self._date_to_bgc_file: dict[str, str] = {}
        self._index_files()

    def _index_files(self) -> None:
        """Map YYYY-MM-DD to specific daily NetCDF file path for instant O(1) lookup."""
        for f in self._phy_files:
            # File name pattern: ..._YYYY-MM-DDT00-00-00.nc
            name = Path(f).stem
            if "T00-00-00" in name:
                d_str = name.split("_")[-1].replace("T00-00-00", "")
                self._date_to_phy_file[d_str] = f

        for f in self._bgc_files:
            name = Path(f).stem
            if "T00-00-00" in name:
                d_str = name.split("_")[-1].replace("T00-00-00", "")
                self._date_to_bgc_file[d_str] = f

    def get_metadata(self) -> dict[str, Any]:
        """Read sample coordinate metadata lazily from the first file."""
        if not self._phy_files:
            return {}

        with xr.open_dataset(self._phy_files[0]) as ds:
            lats = ds.latitude.values
            lons = ds.longitude.values
            depths = ds.depth.values

        times = sorted(list(self._date_to_phy_file.keys()))
        t_start = times[0] if times else "2026-01-01"
        t_end = times[-1] if times else "2026-03-31"

        return {
            "id": "cmems-global-ocean-physics-bgc",
            "name": "Copernicus Marine Global Ocean Analysis and Forecast (Q1 2026)",
            "source": "Copernicus Marine Service (CMEMS)",
            "product": "GLOBAL_ANALYSIS_PHY_001_024 / GLOBAL_ANALYSIS_BGC_001_028",
            "variables": ["temperature", "salinity", "u_velocity", "v_velocity", "chlorophyll"],
            "variable_mappings": {
                "temperature": "thetao",
                "salinity": "so",
                "u_velocity": "uo",
                "v_velocity": "vo",
                "chlorophyll": "chl",
            },
            "units": {
                "temperature": "°C",
                "salinity": "PSU",
                "u_velocity": "m/s",
                "v_velocity": "m/s",
                "chlorophyll": "mg/m³",
            },
            "latitude_range": (float(lats.min()), float(lats.max())),
            "longitude_range": (float(lons.min()), float(lons.max())),
            "depth_range": (float(depths.min()), float(depths.max())),
            "time_range": (t_start, t_end),
            "file_count": len(self._phy_files) + len(self._bgc_files),
            "grid": {
                "physics_res_deg": 0.083,
                "bgc_res_deg": 0.25,
                "lat_points": len(lats),
                "lon_points": len(lons),
                "depth_levels": len(depths),
            },
        }

    def get_available_times(self) -> list[str]:
        """Return list of all 90 available daily dates (YYYY-MM-DD)."""
        return sorted(list(self._date_to_phy_file.keys()))

    def get_available_depths(self, variable: str = "temperature") -> list[float]:
        """Return available depth levels from NetCDF depth coordinate."""
        if not self._phy_files:
            return []
        
        target_files = self._bgc_files if variable == "chlorophyll" else self._phy_files
        with xr.open_dataset(target_files[0]) as ds:
            return [float(d) for d in ds.depth.values]

    def get_field_slice(
        self,
        variable: str,
        date_str: str,
        depth: float,
        lat_min: float = -35.0,
        lat_max: float = 30.0,
        lon_min: float = 40.0,
        lon_max: float = 100.0,
        stride: int = 1,
    ) -> dict[str, Any]:
        """
        Lazily extract a 2D spatial slice for the requested variable, date, depth, and bounding box.
        """
        var_info = VARIABLE_MAPPING.get(variable.lower())
        if not var_info:
            raise ValueError(f"Unsupported model variable '{variable}'")

        nc_var, sub_dir, unit, min_fallback, max_fallback = var_info
        file_map = self._date_to_bgc_file if sub_dir == "copernicus_chlorophyll_daily" else self._date_to_phy_file

        # Resolve nearest date file
        if date_str not in file_map:
            # Pick nearest date
            avail_dates = sorted(file_map.keys())
            if not avail_dates:
                raise FileNotFoundError(f"No model NetCDF files found for {sub_dir}")
            target_date = min(avail_dates, key=lambda d: abs(np.datetime64(d) - np.datetime64(date_str)))
        else:
            target_date = date_str

        file_path = file_map[target_date]

        # Lazy open of the specific single daily file
        with xr.open_dataset(file_path) as ds:
            # Find nearest depth level
            depth_coord = ds.depth
            actual_depth = float(depth_coord.sel(depth=depth, method="nearest").values)

            # Lazy spatial subsetting using slice
            lat_slice = slice(lat_min, lat_max)
            lon_slice = slice(lon_min, lon_max)

            data_slice = ds[nc_var].sel(
                depth=actual_depth,
                latitude=lat_slice,
                longitude=lon_slice,
            )

            # Apply spatial stride if requested
            if stride > 1:
                data_slice = data_slice.isel(
                    latitude=slice(None, None, stride),
                    longitude=slice(None, None, stride),
                )

            # Squeeze time dim if present
            if "time" in data_slice.dims:
                data_slice = data_slice.squeeze("time")

            # Extract small 2D array
            lats = [float(x) for x in data_slice.latitude.values]
            lons = [float(x) for x in data_slice.longitude.values]
            arr = data_slice.values

        # Handle NaNs
        arr_clean = np.where(np.isnan(arr), None, arr)
        valid_mask = ~np.isnan(arr)
        min_val = float(np.nanmin(arr)) if np.any(valid_mask) else min_fallback
        max_val = float(np.nanmax(arr)) if np.any(valid_mask) else max_fallback

        return {
            "variable": variable,
            "nc_variable": nc_var,
            "time": target_date,
            "depth": actual_depth,
            "requested_depth": depth,
            "actual_depth": actual_depth,
            "lat_min": float(min(lats)) if lats else lat_min,
            "lat_max": float(max(lats)) if lats else lat_max,
            "lon_min": float(min(lons)) if lons else lon_min,
            "lon_max": float(max(lons)) if lons else lon_max,
            "width": len(lons),
            "height": len(lats),
            "latitudes": lats,
            "longitudes": lons,
            "values": arr_clean.tolist(),
            "min_value": min_val,
            "max_value": max_val,
            "unit": unit,
        }
