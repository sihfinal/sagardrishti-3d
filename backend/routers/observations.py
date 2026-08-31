from __future__ import annotations

import logging
from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query, Request

from backend.schemas.observations import (
    ObservationItem,
    ObservationListResponse,
    ObservationProfileResponse,
)
from backend.services.observation_service import ObservationService

log = logging.getLogger(__name__)
router = APIRouter()

def _get_obs_service(request: Request) -> ObservationService:
    return request.app.state.obs_service

@router.get("/observations", response_model=ObservationListResponse)
async def list_observations(
    request: Request,
    type: Optional[str] = Query("all", description="Filter: argo, glider, ctd, or all"),
    lat_min: Optional[float] = Query(None, description="Minimum latitude"),
    lat_max: Optional[float] = Query(None, description="Maximum latitude"),
    lon_min: Optional[float] = Query(None, description="Minimum longitude"),
    lon_max: Optional[float] = Query(None, description="Maximum longitude"),
    limit: int = Query(2000, ge=1, le=10000, description="Max observations to return"),
) -> Any:
    """Query in-situ observation platforms with spatial bounding box filtering."""
    obs_svc = _get_obs_service(request)
    items = obs_svc.get_observations(
        obs_type=type,
        lat_min=lat_min,
        lat_max=lat_max,
        lon_min=lon_min,
        lon_max=lon_max,
        limit=limit,
    )
    counts = obs_svc.get_counts()
    total = sum(counts.values())
    return {
        "count": len(items),
        "total_in_dataset": total,
        "counts_by_type": counts,
        "lat_bounds": (lat_min, lat_max) if lat_min is not None and lat_max is not None else None,
        "lon_bounds": (lon_min, lon_max) if lon_min is not None and lon_max is not None else None,
        "items": items,
    }

@router.get("/observations/{obs_id}", response_model=ObservationProfileResponse)
async def get_observation_profile(
    obs_id: str,
    request: Request,
) -> Any:
    """Retrieve full vertical depth profile and multi-channel parameters for an observation."""
    obs_svc = _get_obs_service(request)
    prof = obs_svc.get_profile(obs_id)
    if not prof:
        raise HTTPException(status_code=404, detail=f"Observation profile '{obs_id}' not found.")
    return prof

@router.get("/observations/{obs_id}/profile", response_model=ObservationProfileResponse)
async def get_observation_profile_alias(
    obs_id: str,
    request: Request,
) -> Any:
    """Alias for /observations/{id} returning vertical profile points."""
    obs_svc = _get_obs_service(request)
    prof = obs_svc.get_profile(obs_id)
    if not prof:
        raise HTTPException(status_code=404, detail=f"Observation profile '{obs_id}' not found.")
    return prof
