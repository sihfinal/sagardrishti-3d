import sys
import numpy as np
import xarray as xr

url = "https://tds.hycom.org/thredds/dodsC/GLBy0.088/latest"
ds = xr.open_dataset(url, decode_times=False)
print("vars:", [str(v) for v in ds.data_vars][:12])
u = ds["water_u"]
print("dims:", u.dims, dict(zip(u.dims, u.shape)))
lat = ds.lat.values
lon = ds.lon.values
depth = ds.depth.values
print("lat", lat.min(), lat.max(), "lon", lon.min(), lon.max(), "ndepth", len(depth))
da = u.isel(time=0).sel(lat=slice(-35, 30), lon=slice(40, 100), depth=0)
arr = np.asarray(da.values, dtype=np.float32)
print("ROI u:", arr.shape, "valid%", round(float(np.isfinite(arr).mean() * 100)), "range", float(np.nanmin(arr)), float(np.nanmax(arr)))
