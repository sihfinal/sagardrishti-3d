from __future__ import annotations
from pathlib import Path
from typing import Any, Optional
from backend.adapters.wod_observations import WODObservationAdapter

class ObservationService:
    def __init__(self, data_dir: Path):
        self.adapter = WODObservationAdapter(data_dir)

    def get_counts(self) -> dict[str, int]:
        return self.adapter.get_counts()

    def get_observations(
        self,
        obs_type: Optional[str] = "all",
        lat_min: Optional[float] = None,
        lat_max: Optional[float] = None,
        lon_min: Optional[float] = None,
        lon_max: Optional[float] = None,
        limit: int = 2000,
    ) -> list[dict[str, Any]]:
        return self.adapter.get_observations(
            obs_type=obs_type,
            lat_min=lat_min,
            lat_max=lat_max,
            lon_min=lon_min,
            lon_max=lon_max,
            limit=limit,
        )

    def get_profile(self, obs_id: str) -> Optional[dict[str, Any]]:
        return self.adapter.get_profile(obs_id)
