"""
backend/main.py
---------------
FastAPI application entry point for the SagarDrishti-3D Real Data Backend.
Provides lazy-loaded CMEMS model APIs and WOD in-situ observation APIs.
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.services.model_service import ModelService
from backend.services.observation_service import ObservationService
from backend.routers.model import router as model_router
from backend.routers.observations import router as obs_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("sagardrishti.backend")

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    log.info("=== SagarDrishti-3D Backend — Real Data Engine Starting ===")
    data_dir = Path(__file__).resolve().parent.parent / "data"
    log.info("Authoritative datasets directory: %s", data_dir)

    # Initialize Model and Observation Services lazily
    app.state.model_service = ModelService(data_dir)
    app.state.obs_service = ObservationService(data_dir)
    log.info("Model and Observation services successfully initialized.")

    yield

    log.info("SagarDrishti-3D Backend shutting down.")

app = FastAPI(
    title="SagarDrishti-3D Real Data API",
    description=(
        "Production backend serving real CMEMS numerical model archives and "
        "WOD in-situ observations (Argo, Gliders, CTD, BGC) via lazy xarray/NetCDF-4 access."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(model_router, prefix="/api/v1")
app.include_router(obs_router, prefix="/api/v1")

@app.get("/")
async def root():
    return {
        "service": "SagarDrishti-3D Backend",
        "docs": "/docs",
        "health": "/api/v1/health",
        "datasets": "/api/v1/datasets",
    }
