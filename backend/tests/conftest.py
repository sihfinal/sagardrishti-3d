"""
backend/tests/conftest.py
-------------------------
Shared fixtures for all Phase 1 backend tests.

The `client` fixture creates a real TestClient wired to the live RSMCAdapter.
No mock is used for the integration tests — they run against the actual
RSMC_hycom_20260830.nc file.

Unit tests that only need a tiny synthetic NetCDF use the `tiny_nc` fixture,
which writes a minimal 3×4 LAT×LON dataset to a temp file.
"""
from __future__ import annotations

import io
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

import netCDF4 as nc4
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.adapters.incois_rsmc import RSMCAdapter
from backend.config import settings
from backend.main import app

# ─────────────────────────────────────────────────────────────────────────────
# Real-file fixture (integration)
# ─────────────────────────────────────────────────────────────────────────────

REAL_RSMC_PATH = settings.RSMC_NETCDF_PATH


@pytest.fixture(scope="session")
def real_adapter():
    """
    Open the real RSMC NetCDF file once for the entire test session.
    Skips all tests in a class/module if the file is missing.
    """
    if not REAL_RSMC_PATH.exists():
        pytest.skip(
            f"Real RSMC file not found at {REAL_RSMC_PATH}. "
            "Set RSMC_NETCDF_PATH to run integration tests."
        )
    adapter = RSMCAdapter(REAL_RSMC_PATH)
    yield adapter
    adapter.close()


@pytest.fixture(scope="session")
def client(real_adapter):
    """
    FastAPI TestClient using the real RSMCAdapter.
    The adapter is injected into app.state before the test session starts.
    """
    app.state.rsmc_adapter = real_adapter
    with TestClient(app, raise_server_exceptions=True) as tc:
        yield tc


# ─────────────────────────────────────────────────────────────────────────────
# Tiny synthetic fixture (unit)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def tiny_nc_path(tmp_path_factory):
    """
    Create a minimal valid NetCDF4 file with the same structure as the real
    RSMC dataset but with a tiny 3-lat × 4-lon grid.

    Used to verify adapter logic without touching the 9.8 GB file.
    """
    tmp = tmp_path_factory.mktemp("data") / "tiny_rsmc.nc"

    lats = np.array([-10.0, 0.0, 10.0], dtype=np.float32)
    lons = np.array([60.0, 70.0, 80.0, 90.0], dtype=np.float32)
    depths = np.array([0.0, 100.0, 500.0], dtype=np.float32)

    import pandas as pd
    base = pd.Timestamp("2026-08-30T06:00:00")
    times_dt = [base + pd.Timedelta(hours=6 * i) for i in range(4)]
    # netCDF4 time in hours since epoch
    ref = "hours since 1950-01-01 00:00:00"
    times_num = nc4.date2num(
        [t.to_pydatetime() for t in times_dt], units=ref
    )

    with nc4.Dataset(str(tmp), "w", format="NETCDF4") as ds:
        ds.Conventions = "CF-1.6"
        ds.createDimension("TIME", len(times_dt))
        ds.createDimension("DEPTH", len(depths))
        ds.createDimension("LAT", len(lats))
        ds.createDimension("LON", len(lons))

        v_time = ds.createVariable("TIME", "f8", ("TIME",))
        v_time.units = ref
        v_time.calendar = "gregorian"
        v_time[:] = times_num

        v_depth = ds.createVariable("DEPTH", "f4", ("DEPTH",))
        v_depth.units = "m"
        v_depth[:] = depths

        v_lat = ds.createVariable("LAT", "f4", ("LAT",))
        v_lat[:] = lats

        v_lon = ds.createVariable("LON", "f4", ("LON",))
        v_lon[:] = lons

        shape4 = (len(times_dt), len(depths), len(lats), len(lons))
        for name, base_val in [("TEMP", 28.0), ("SALN", 35.0),
                                ("UVEL", 0.1), ("VVEL", -0.05)]:
            v = ds.createVariable(name, "f4", ("TIME", "DEPTH", "LAT", "LON"),
                                  fill_value=9.96921e+36)
            v[:] = np.full(shape4, base_val, dtype=np.float32)
            # Put a single NaN in each to test fill handling
            v[0, 0, 0, 0] = float("nan")

    return tmp


@pytest.fixture(scope="session")
def tiny_adapter(tiny_nc_path):
    adapter = RSMCAdapter(tiny_nc_path)
    yield adapter
    adapter.close()
