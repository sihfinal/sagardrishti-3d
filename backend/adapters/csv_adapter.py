from __future__ import annotations

import csv
import logging
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger(__name__)

class CSVObservationAdapter:
    """
    Standardized CSV adapter supporting in-situ tabular oceanographic profile casts.
    Maps arbitrary column aliases (lat, latitude, lon, longitude, depth, temp, sal) into normalized records.
    """

    def __init__(self, file_path: Path):
        self.file_path = file_path

    def read_records(self) -> list[dict[str, Any]]:
        if not self.file_path.exists():
            return []

        records = []
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for idx, row in enumerate(reader):
                    lat = float(row.get("lat") or row.get("latitude") or 0.0)
                    lon = float(row.get("lon") or row.get("longitude") or 0.0)
                    depth = float(row.get("depth") or row.get("z") or 0.0)
                    
                    records.append({
                        "id": f"csv_{idx}",
                        "type": "ctd_csv",
                        "latitude": lat,
                        "longitude": lon,
                        "depth": depth,
                        "temperature": float(row["temperature"]) if "temperature" in row else None,
                        "salinity": float(row["salinity"]) if "salinity" in row else None,
                        "source": "Local CSV Ingest",
                    })
        except Exception as e:
            log.error(f"Error reading CSV {self.file_path}: {e}")

        return records
