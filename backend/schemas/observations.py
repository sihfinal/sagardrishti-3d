from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel

class ObservationItem(BaseModel):
    id: str
    type: str # "argo" | "glider" | "ctd" | "bgc"
    platform_id: Optional[str] = None
    profile_id: Optional[str] = None
    timestamp: Optional[str] = None
    latitude: float
    longitude: float
    max_depth: Optional[float] = None
    variables: list[str] = []
    qc: Optional[int] = None
    source: str = "NOAA/WOD"

class ObservationProfilePoint(BaseModel):
    depth: float
    pressure: Optional[float] = None
    temperature: Optional[float] = None
    salinity: Optional[float] = None
    chlorophyll: Optional[float] = None
    oxygen: Optional[float] = None
    nitrate: Optional[float] = None
    ph: Optional[float] = None

class ObservationProfileResponse(BaseModel):
    id: str
    type: str
    platform_id: Optional[str] = None
    timestamp: Optional[str] = None
    latitude: float
    longitude: float
    max_depth: float
    variables: list[str]
    source: str
    data: list[ObservationProfilePoint]

class ObservationListResponse(BaseModel):
    count: int
    total_in_dataset: int
    counts_by_type: dict[str, int] = {}
    lat_bounds: Optional[tuple[float, float]] = None
    lon_bounds: Optional[tuple[float, float]] = None
    items: list[ObservationItem]
