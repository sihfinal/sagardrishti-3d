"""
backend/adapters/observations.py
--------------------------------
Extensible in-situ observation adapters for INCOIS autonomous and vessel data:
  - ArgoAdapter: Core Argo profiling floats (T/S profiles).
  - GliderAdapter: Autonomous underwater vehicles (saw-tooth mission trajectories).
  - BGCAdapter: Biogeochemical Argo floats (chlorophyll-a, dissolved oxygen, nitrate).
  - CTDAdapter: Research vessel Conductivity-Temperature-Depth rosette casts.

Follows the plugin/adapter architecture defined in base.py.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from backend.adapters.base import ObservationAdapter


class BaseJsonObservationAdapter(ObservationAdapter):
    """Generic adapter reading standardized profile observation JSON streams."""

    def __init__(self, dataset_id: str, name: str, source_file: Path | str, platform_type: str):
        self._dataset_id = dataset_id
        self._name = name
        self._source_file = Path(source_file)
        self._platform_type = platform_type
        self._platforms: List[Dict[str, Any]] = []
        self._load_data()

    def _load_data(self) -> None:
        if self._source_file.exists():
            try:
                with open(self._source_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    raw_platforms = data.get("platforms", [])
                    self._platforms = [
                        p for p in raw_platforms if p.get("type") == self._platform_type
                    ]
            except Exception as e:
                self._platforms = []
        else:
            self._platforms = []

    @property
    def dataset_id(self) -> str:
        return self._dataset_id

    def fetch_metadata(self) -> dict[str, Any]:
        return {
            "id": self._dataset_id,
            "name": self._name,
            "type": "observation",
            "platform_type": self._platform_type,
            "platform_count": len(self._platforms),
            "source_file": str(self._source_file),
        }

    def get_platforms(
        self,
        time_min: Optional[str] = None,
        time_max: Optional[str] = None,
        lat_min: Optional[float] = None,
        lat_max: Optional[float] = None,
        lon_min: Optional[float] = None,
        lon_max: Optional[float] = None,
    ) -> list[dict[str, Any]]:
        results = []
        for p in self._platforms:
            lat = p.get("lat", 0.0)
            lon = p.get("lon", 0.0)
            if lat_min is not None and lat < lat_min:
                continue
            if lat_max is not None and lat > lat_max:
                continue
            if lon_min is not None and lon < lon_min:
                continue
            if lon_max is not None and lon > lon_max:
                continue
            results.append(p)
        return results


class ArgoAdapter(BaseJsonObservationAdapter):
    def __init__(self, source_file: Path | str):
        super().__init__(
            dataset_id="incois-argo-indian-ocean",
            name="INCOIS / GDAC Argo Profiling Floats",
            source_file=source_file,
            platform_type="argo",
        )


class GliderAdapter(BaseJsonObservationAdapter):
    def __init__(self, source_file: Path | str):
        super().__init__(
            dataset_id="incois-gliders-bay-of-bengal",
            name="INCOIS Underwater Gliders",
            source_file=source_file,
            platform_type="glider",
        )


class BGCAdapter(BaseJsonObservationAdapter):
    def __init__(self, source_file: Path | str):
        super().__init__(
            dataset_id="incois-bgc-argo-chlorophyll",
            name="BGC-Argo Bio-optical Chlorophyll Floats",
            source_file=source_file,
            platform_type="bgc",
        )


class CTDAdapter(BaseJsonObservationAdapter):
    """Research vessel CTD casts adapter."""
    def __init__(self, source_file: Path | str):
        super().__init__(
            dataset_id="incois-ctd-cruises",
            name="INCOIS Research Vessel CTD Profiles",
            source_file=source_file,
            platform_type="ctd",
        )


class ObservationRegistry:
    """Registry maintaining active observation adapters."""

    def __init__(self, profiles_json_path: Path | str):
        self.adapters: Dict[str, ObservationAdapter] = {
            "argo": ArgoAdapter(profiles_json_path),
            "glider": GliderAdapter(profiles_json_path),
            "bgc": BGCAdapter(profiles_json_path),
            "ctd": CTDAdapter(profiles_json_path),
        }

    def get_adapter(self, platform_type: str) -> Optional[ObservationAdapter]:
        return self.adapters.get(platform_type.lower())

    def get_all_platforms(
        self,
        platform_type: Optional[str] = None,
        lat_min: Optional[float] = None,
        lat_max: Optional[float] = None,
        lon_min: Optional[float] = None,
        lon_max: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        if platform_type and platform_type.lower() in self.adapters:
            return self.adapters[platform_type.lower()].get_platforms(
                lat_min=lat_min, lat_max=lat_max, lon_min=lon_min, lon_max=lon_max
            )
        all_pts: List[Dict[str, Any]] = []
        for adapter in self.adapters.values():
            all_pts.extend(
                adapter.get_platforms(
                    lat_min=lat_min, lat_max=lat_max, lon_min=lon_min, lon_max=lon_max
                )
            )
        return all_pts
