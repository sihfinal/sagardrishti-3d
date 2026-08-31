"""
backend/adapters/base.py
------------------------
Abstract interface that every data adapter must satisfy.

Phase 1 only implements GriddedAdapter (incois_rsmc.py).
ObservationAdapter is defined here for completeness but not yet implemented.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseAdapter(ABC):
    """Shared interface for all data adapters."""

    @property
    @abstractmethod
    def dataset_id(self) -> str:
        """Unique string identifier for this dataset (used in API routes)."""

    @abstractmethod
    def fetch_metadata(self) -> dict[str, Any]:
        """Return a dict of metadata about the dataset (coordinates, provenance, etc.)."""


class GriddedAdapter(BaseAdapter):
    """
    Interface for adapters that serve 2-D gridded (lat × lon) binary slices.

    Concrete implementations must handle:
      - lazy NetCDF / binary access (never load the full file)
      - nearest-neighbour time / depth selection
      - spatial bounding-box cropping
      - optional stride downsampling
      - uint8 / int8 quantization
      - NaN fill encoding
    """

    @abstractmethod
    def available_times(self) -> list[str]:
        """Return all available TIME coordinate values as ISO-8601 strings."""

    @abstractmethod
    def available_depths(self) -> list[float]:
        """Return all available DEPTH coordinate values in metres."""

    @abstractmethod
    def get_slice(
        self,
        variable: str,
        timestamp: str,
        depth: float,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float,
        stride: int = 1,
    ) -> "SliceResult":
        """
        Lazy-load and return a quantized 2-D binary slice.

        Returns a SliceResult dataclass that carries both the raw bytes and
        the metadata headers the API layer needs to set on the response.
        """


class ObservationAdapter(BaseAdapter):
    """
    Interface for adapters that serve in-situ profile observations.

    NOT implemented in Phase 1.
    """

    @abstractmethod
    def get_platforms(
        self,
        time_min: str,
        time_max: str,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float,
    ) -> list[dict[str, Any]]:
        """Return a list of observation platform dicts."""


# ── Result container ─────────────────────────────────────────────────────────

from dataclasses import dataclass


@dataclass
class SliceResult:
    """
    Everything the router needs after a successful field slice.

    Attributes
    ----------
    data : bytes
        Raw quantized binary payload.  Uint8 for scalar fields, uint8 for
        velocity components (centred at 127 → 0 m/s).
    dtype : str
        Either "uint8" or "int8" — tells the client how to interpret the bytes.
    scale : float
        Linear scale factor:  physical_value = offset + byte_value * scale
    offset : float
        Physical value corresponding to byte 0.
    fill_value : int
        Byte value used to represent NaN / land.
    global_min : float
        Minimum physical value represented in the slice.
    global_max : float
        Maximum physical value represented in the slice.
    actual_time : str
        ISO-8601 timestamp that was actually selected (nearest neighbour).
    actual_depth : float
        Depth in metres that was actually selected (nearest neighbour).
    width : int
        Number of longitude grid points in the slice.
    height : int
        Number of latitude grid points in the slice.
    """

    data: bytes
    dtype: str
    scale: float
    offset: float
    fill_value: int
    global_min: float
    global_max: float
    actual_time: str
    actual_depth: float
    width: int
    height: int
