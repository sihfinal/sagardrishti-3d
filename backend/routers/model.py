from __future__ import annotations

import logging
from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query, Request

from backend.schemas.model import (
    ModelMetadataResponse,
    ModelTimesResponse,
    ModelDepthsResponse,
    ModelFieldResponse,
)
from backend.services.model_service import ModelService

log = logging.getLogger(__name__)
router = APIRouter()

def _get_model_service(request: Request) -> ModelService:
    return request.app.state.model_service

@router.get("/health")
async def health() -> dict[str, str]:
    from datetime import datetime, timezone
    return {
        "status": "healthy",
        "version": "2.0.0-phase1",
        "service": "SagarDrishti-3D Real Data Backend",
        "utcTime": datetime.now(timezone.utc).isoformat(timespec="seconds") + "Z",
    }

@router.get("/datasets")
async def list_datasets(request: Request) -> list[dict[str, Any]]:
    """List all available datasets in the platform."""
    ms = _get_model_service(request)
    meta = ms.get_metadata()
    return [
        {
            "id": "cmems-physics-bgc",
            "name": "Copernicus Marine Ocean Physics & Biogeochemistry",
            "type": "model",
            "source": "Copernicus Marine Service (CMEMS)",
            "format": "NetCDF-4",
            "variables": meta.get("variables", []),
            "time_coverage": meta.get("time_range", ()),
            "geographic_coverage": {
                "latitude": meta.get("latitude_range", ()),
                "longitude": meta.get("longitude_range", ()),
            },
        },
        {
            "id": "wod-argo",
            "name": "WOD / Argo Profiling Floats",
            "type": "observation",
            "source": "NOAA / WOD / GDAC",
            "format": "NetCDF-4 (DSG Ragged Array)",
            "variables": ["temperature", "salinity", "chlorophyll", "nitrate", "oxygen"],
        },
        {
            "id": "wod-glider",
            "name": "WOD Autonomous Underwater Gliders",
            "type": "observation",
            "source": "NOAA / WOD",
            "format": "NetCDF-4 (DSG Ragged Array)",
            "variables": ["temperature", "salinity", "chlorophyll", "oxygen"],
        },
        {
            "id": "wod-ctd",
            "name": "WOD Shipboard CTD Casts",
            "type": "observation",
            "source": "NOAA / WOD",
            "format": "NetCDF-4 / CSV",
            "variables": ["temperature", "salinity", "chlorophyll", "nitrate"],
        },
    ]

@router.get("/model/metadata", response_model=ModelMetadataResponse)
async def model_metadata(request: Request) -> Any:
    """Return model provenance, coordinates, and variables."""
    ms = _get_model_service(request)
    meta = ms.get_metadata()
    if not meta:
        raise HTTPException(status_code=404, detail="Model metadata not found")
    return meta

@router.get("/model/times", response_model=ModelTimesResponse)
async def model_times(request: Request) -> Any:
    """Return list of available model timestamps (YYYY-MM-DD)."""
    ms = _get_model_service(request)
    times = ms.get_times()
    return {
        "dataset_id": "cmems-daily",
        "count": len(times),
        "times": times,
    }

@router.get("/model/depths", response_model=ModelDepthsResponse)
async def model_depths(
    request: Request,
    variable: str = Query("temperature", description="Target model variable"),
) -> Any:
    """Return available discrete model depth levels in metres."""
    ms = _get_model_service(request)
    depths = ms.get_depths(variable)
    return {
        "dataset_id": "cmems-daily",
        "count": len(depths),
        "depths": depths,
        "unit": "m",
    }

@router.get("/model/field", response_model=ModelFieldResponse)
async def model_field(
    request: Request,
    variable: str = Query("temperature", description="Variable: temperature, salinity, u_velocity, v_velocity, chlorophyll"),
    time: str = Query("2026-02-15", description="Model date (YYYY-MM-DD)"),
    depth: float = Query(250.0, description="Depth level in metres"),
    lat_min: float = Query(-35.0, description="Minimum latitude"),
    lat_max: float = Query(30.0, description="Maximum latitude"),
    lon_min: float = Query(40.0, description="Minimum longitude"),
    lon_max: float = Query(100.0, description="Maximum longitude"),
    stride: int = Query(1, ge=1, le=10, description="Spatial subsampling stride"),
) -> Any:
    """Extract a lazy 2D spatial slice from real daily NetCDF datasets."""
    ms = _get_model_service(request)
    try:
        res = ms.get_field(
            variable=variable,
            date_str=time,
            depth=depth,
            lat_min=lat_min,
            lat_max=lat_max,
            lon_min=lon_min,
            lon_max=lon_max,
            stride=stride,
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Error fetching model field: {e}")
        raise HTTPException(status_code=500, detail="Error extracting model field slice")
