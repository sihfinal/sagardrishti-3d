from __future__ import annotations
from pathlib import Path
from typing import Any, Optional
from backend.adapters.cmems_model import CMEMSModelAdapter

class ModelService:
    def __init__(self, data_dir: Path):
        self.adapter = CMEMSModelAdapter(data_dir)

    def get_metadata(self) -> dict[str, Any]:
        return self.adapter.get_metadata()

    def get_times(self) -> list[str]:
        return self.adapter.get_available_times()

    def get_depths(self, variable: str = "temperature") -> list[float]:
        return self.adapter.get_available_depths(variable)

    def get_field(
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
        return self.adapter.get_field_slice(
            variable=variable,
            date_str=date_str,
            depth=depth,
            lat_min=lat_min,
            lat_max=lat_max,
            lon_min=lon_min,
            lon_max=lon_max,
            stride=stride,
        )
