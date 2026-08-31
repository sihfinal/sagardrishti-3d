"""
backend/tests/test_api.py
-------------------------
Comprehensive real-data test suite verifying:
  - CMEMS Physical model lazy loading (thetao, so, uo, vo)
  - CMEMS BGC Chlorophyll model lazy loading (chl)
  - WOD Argo Floats, Gliders, and CTD observation queries
  - Spatial bounding box filtering
  - Single profile depth resolution & multi-channel parameters
"""
import pytest
from fastapi.testclient import TestClient
from backend.main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert "version" in data

def test_list_datasets(client):
    r = client.get("/api/v1/datasets")
    assert r.status_code == 200
    datasets = r.json()
    assert len(datasets) >= 3
    dataset_ids = [d["id"] for d in datasets]
    assert "cmems-physics-bgc" in dataset_ids
    assert "wod-argo" in dataset_ids
    assert "wod-ctd" in dataset_ids

def test_model_metadata(client):
    r = client.get("/api/v1/model/metadata")
    assert r.status_code == 200
    meta = r.json()
    assert meta["id"] == "cmems-global-ocean-physics-bgc"
    assert "temperature" in meta["variables"]
    assert "salinity" in meta["variables"]
    assert "chlorophyll" in meta["variables"]
    assert meta["latitude_range"][0] <= -30.0
    assert meta["longitude_range"][1] >= 90.0

def test_model_times(client):
    r = client.get("/api/v1/model/times")
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 90
    assert "2026-01-01" in data["times"]
    assert "2026-02-15" in data["times"]
    assert "2026-03-31" in data["times"]

def test_model_depths(client):
    r = client.get("/api/v1/model/depths?variable=temperature")
    assert r.status_code == 200
    data = r.json()
    assert data["count"] >= 30
    assert data["depths"][0] < 1.0 # surface ~0.49m
    assert any(d >= 1900.0 for d in data["depths"])

def test_model_temperature_field_slice(client):
    r = client.get(
        "/api/v1/model/field",
        params={
            "variable": "temperature",
            "time": "2026-02-15",
            "depth": 250.0,
            "lat_min": -15.0,
            "lat_max": -5.0,
            "lon_min": 65.0,
            "lon_max": 80.0,
            "stride": 2,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["variable"] == "temperature"
    assert data["time"] == "2026-02-15"
    assert data["width"] > 0
    assert data["height"] > 0
    assert len(data["values"]) == data["height"]
    assert len(data["values"][0]) == data["width"]
    assert data["unit"] == "°C"
    assert data["min_value"] is not None
    assert data["max_value"] is not None

def test_model_salinity_field_slice(client):
    r = client.get(
        "/api/v1/model/field",
        params={
            "variable": "salinity",
            "time": "2026-01-10",
            "depth": 50.0,
            "lat_min": 0.0,
            "lat_max": 10.0,
            "lon_min": 70.0,
            "lon_max": 85.0,
            "stride": 3,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["variable"] == "salinity"
    assert data["unit"] == "PSU"

def test_model_chlorophyll_field_slice(client):
    r = client.get(
        "/api/v1/model/field",
        params={
            "variable": "chlorophyll",
            "time": "2026-03-01",
            "depth": 10.0,
            "lat_min": -10.0,
            "lat_max": 10.0,
            "lon_min": 60.0,
            "lon_max": 80.0,
            "stride": 2,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["variable"] == "chlorophyll"
    assert data["unit"] == "mg/m³"

def test_model_current_velocity_slice(client):
    r_u = client.get(
        "/api/v1/model/field",
        params={
            "variable": "u_velocity",
            "time": "2026-02-15",
            "depth": 0.0,
            "lat_min": 5.0,
            "lat_max": 15.0,
            "lon_min": 70.0,
            "lon_max": 80.0,
            "stride": 2,
        },
    )
    assert r_u.status_code == 200
    assert r_u.json()["unit"] == "m/s"

    r_v = client.get(
        "/api/v1/model/field",
        params={
            "variable": "v_velocity",
            "time": "2026-02-15",
            "depth": 0.0,
            "lat_min": 5.0,
            "lat_max": 15.0,
            "lon_min": 70.0,
            "lon_max": 80.0,
            "stride": 2,
        },
    )
    assert r_v.status_code == 200
    assert r_v.json()["unit"] == "m/s"

def test_observations_query(client):
    r = client.get("/api/v1/observations", params={"type": "all", "limit": 100})
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 100
    assert len(data["items"]) == 100
    types = set(item["type"] for item in data["items"])
    assert "argo" in types
    assert "glider" in types
    assert "ctd" in types
    assert "bgc" in types

def test_observations_balanced_sampling(client):
    r = client.get("/api/v1/observations", params={"limit": 2500})
    assert r.status_code == 200
    data = r.json()
    items = data["items"]
    assert len(items) <= 2500
    counts = {}
    for it in items:
        counts[it["type"]] = counts.get(it["type"], 0) + 1
    
    # Assert all 4 observation types are represented
    assert counts["argo"] > 0
    assert counts["glider"] > 0
    assert counts["ctd"] > 0
    assert counts["bgc"] > 0
    # Assert CTD does not exceed actual availability (619)
    assert counts["ctd"] <= 619
    # Assert full dataset totals are preserved
    assert data["counts_by_type"]["argo"] == 22231
    assert data["counts_by_type"]["glider"] == 2591
    assert data["counts_by_type"]["ctd"] == 619
    assert data["counts_by_type"]["bgc"] == 2257

def test_observations_type_filtering(client):
    for t in ["argo", "glider", "ctd", "bgc"]:
        r = client.get("/api/v1/observations", params={"type": t, "limit": 50})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 50
        assert all(it["type"] == t for it in items)

def test_observations_spatial_filter(client):
    # Query only inside Indian Ocean region box
    r = client.get(
        "/api/v1/observations",
        params={
            "type": "argo",
            "lat_min": -18.0,
            "lat_max": -5.0,
            "lon_min": 65.0,
            "lon_max": 85.0,
            "limit": 50,
        },
    )
    assert r.status_code == 200
    data = r.json()
    for item in data["items"]:
        assert -18.0 <= item["latitude"] <= -5.0
        assert 65.0 <= item["longitude"] <= 85.0

def test_observation_profile_retrieval(client):
    # First get a CTD cast ID
    r_list = client.get("/api/v1/observations", params={"type": "ctd", "limit": 1})
    assert r_list.status_code == 200
    items = r_list.json()["items"]
    assert len(items) > 0
    obs_id = items[0]["id"]

    # Fetch full depth profile
    r_prof = client.get(f"/api/v1/observations/{obs_id}/profile")
    assert r_prof.status_code == 200
    prof = r_prof.json()
    assert prof["id"] == obs_id
    assert prof["type"] == "ctd"
    assert len(prof["data"]) > 0
    # Verify depth profile structure
    first_pt = prof["data"][0]
    assert "depth" in first_pt
    assert "temperature" in first_pt

def test_observation_profile_argo_20059500_single_variable(client):
    """
    Regression test for argo_20059500:
    Cast has 989 valid temperature measurements but Salinity_row_size is masked.
    Must succeed with HTTP 200, return 989 temperature levels, and report salinity as None.
    """
    # 1. Test with prefixed ID
    r = client.get("/api/v1/observations/argo_20059500/profile")
    assert r.status_code == 200
    prof = r.json()
    assert prof["id"] == "argo_20059500"
    assert prof["type"] == "argo"
    assert prof["platform_id"] == "20059500"
    assert len(prof["data"]) == 989
    assert prof["variables"] == ["temperature"]
    # Check first and last points
    assert prof["data"][0]["temperature"] is not None
    assert prof["data"][0]["salinity"] is None
    assert prof["data"][-1]["temperature"] is not None
    assert prof["data"][-1]["salinity"] is None

    # 2. Test with raw numeric ID alias
    r_raw = client.get("/api/v1/observations/20059500/profile")
    assert r_raw.status_code == 200
    assert len(r_raw.json()["data"]) == 989

def test_observation_profile_multi_variable(client):
    """
    Verify multi-variable observation profile (Temperature + Salinity).
    """
    r = client.get("/api/v1/observations/argo_19770705/profile")
    assert r.status_code == 200
    prof = r.json()
    assert prof["id"] == "argo_19770705"
    assert len(prof["data"]) == 101
    assert "temperature" in prof["variables"]
    assert "salinity" in prof["variables"]
    # First point has both temperature and salinity
    assert prof["data"][0]["temperature"] is not None
    assert prof["data"][0]["salinity"] is not None

def test_observation_profile_glider_multi_channel(client):
    """
    Verify autonomous underwater glider profile with BGC sensors (Oxygen, Chlorophyll).
    """
    r = client.get("/api/v1/observations/glider_22043437/profile")
    assert r.status_code == 200
    prof = r.json()
    assert prof["type"] == "glider"
    assert len(prof["data"]) == 10
    assert "temperature" in prof["variables"]
    assert "salinity" in prof["variables"]
    assert "oxygen" in prof["variables"]
