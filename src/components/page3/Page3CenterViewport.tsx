"use client"

import React, { useState } from "react"
import Page3Globe from "./globe/Page3Globe"
import { GeographicBounds } from "./globe/RegionSelectionBox"
import RegionConfirmationModal from "./RegionConfirmationModal"
import ObservationDetailModal from "./ObservationDetailModal"
import { ObservationItem } from "@/lib/observationsApi"
import { ModelFieldResponse } from "@/lib/modelApi"

interface Page3CenterViewportProps {
  onHoverCoordinates?: (coords: { lat: number; lon: number } | null) => void
  hoverCoordinates?: { lat: number; lon: number } | null
  currentOrientation?: number
  onOrientationReset?: () => void
  selectedRegion?: GeographicBounds | null
  onConfirmRegionExplore?: (bounds: GeographicBounds) => void
  onRegionChange?: (bounds: GeographicBounds | null) => void
  // Real In-Situ Observations
  observations?: ObservationItem[]
  visibleTypes?: Record<string, boolean>
  obsLoading?: boolean
  obsError?: string | null
  selectedObservation?: ObservationItem | null
  onSelectObservation?: (obs: ObservationItem | null) => void
  // Real Model Data Layers
  activeLayerId?: string
  layerVisibility?: Record<string, boolean>
  scalarFieldData?: ModelFieldResponse | null
  uFieldData?: ModelFieldResponse | null
  vFieldData?: ModelFieldResponse | null
  modelLoading?: boolean
  modelError?: string | null
  vectorDensity?: "low" | "medium" | "high"
}

export default function Page3CenterViewport({
  onHoverCoordinates,
  hoverCoordinates: externalHoverCoords,
  currentOrientation = 0,
  onOrientationReset,
  selectedRegion = null,
  onConfirmRegionExplore,
  onRegionChange,
  observations = [],
  visibleTypes = { argo: true, glider: true, ctd: true, bgc: true },
  obsLoading = false,
  obsError = null,
  selectedObservation = null,
  onSelectObservation,
  activeLayerId = "temperature",
  layerVisibility = { temperature: true, salinity: true, currents: true, chlorophyll: true },
  scalarFieldData = null,
  uFieldData = null,
  vFieldData = null,
  modelLoading = false,
  modelError = null,
  vectorDensity = "medium",
}: Page3CenterViewportProps) {
  const [zoomTrigger, setZoomTrigger] = useState<number>(0)
  const [compassHeading, setCompassHeading] = useState<number>(currentOrientation)
  const [selectionMode, setSelectionMode] = useState<boolean>(false)
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false)
  const [internalHoverCoords, setInternalHoverCoords] = useState<{ lat: number; lon: number } | null>(null)

  const activeHover = externalHoverCoords !== undefined ? externalHoverCoords : internalHoverCoords

  const handleHover = (coords: { lat: number; lon: number } | null) => {
    setInternalHoverCoords(coords)
    onHoverCoordinates?.(coords)
  }

  const handleZoomIn = () => setZoomTrigger((prev) => prev + 1)
  const handleZoomOut = () => setZoomTrigger((prev) => prev - 1)

  const handleRegionSelect = (bounds: GeographicBounds | null) => {
    onRegionChange?.(bounds)
    if (bounds) {
      setShowConfirmModal(true)
    }
  }

  const handleConfirmExplore = () => {
    setShowConfirmModal(false)
    if (selectedRegion) {
      onConfirmRegionExplore?.(selectedRegion)
    }
  }

  return (
    <div className="relative w-full h-full min-h-[500px] flex flex-col justify-between overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-b from-[#030914] via-[#051124] to-[#02060e] shadow-2xl p-3 md:p-4 select-none">
      {/* ─── Confirmation Modal after Region Selection ─── */}
      <RegionConfirmationModal
        open={showConfirmModal}
        bounds={selectedRegion}
        onConfirm={handleConfirmExplore}
        onCancel={() => setShowConfirmModal(false)}
      />

      {/* ─── Observation Detail Modal / Inspector ─── */}
      <ObservationDetailModal
        observation={selectedObservation}
        onClose={() => onSelectObservation?.(null)}
      />

      {/* ─── Top Left: Selection Mode Switch & Loading Status ─── */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            setSelectionMode(!selectionMode)
            onSelectObservation?.(null)
          }}
          className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold font-mono tracking-wider flex items-center gap-2 transition-all shadow-lg ${
            selectionMode
              ? "bg-gradient-to-r from-sky-400 to-teal-300 text-slate-950 border border-white/50 shadow-sky-400/30 scale-[1.03]"
              : "bg-[#081a33]/90 text-slate-200 border border-sky-400/40 hover:border-sky-300 hover:text-white backdrop-blur-md"
          }`}
          title={selectionMode ? "Click to disable region selection mode" : "Click to enable click & drag region selection"}
        >
          <span className="text-xs">⛶</span>
          <span>SELECT REGION: {selectionMode ? "ON" : "OFF"}</span>
        </button>

        {/* Observation Status Badges */}
        {obsLoading && (
          <span className="px-2.5 py-1 rounded bg-[#040e1b]/90 border border-sky-500/30 text-[10px] text-sky-300 font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-sky-400 border-t-transparent animate-spin inline-block" />
            Loading observations…
          </span>
        )}

        {obsError && (
          <span className="px-2.5 py-1 rounded bg-rose-950/80 border border-rose-500/30 text-[10px] text-rose-300 font-mono">
            Observation data unavailable
          </span>
        )}

        {/* Model Data Layer Status Badges */}
        {modelLoading && (
          <span className="px-2.5 py-1 rounded bg-[#040e1b]/90 border border-emerald-500/30 text-[10px] text-emerald-300 font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-emerald-400 border-t-transparent animate-spin inline-block" />
            Loading {activeLayerId}…
          </span>
        )}

        {modelError && (
          <span className="px-2.5 py-1 rounded bg-amber-950/80 border border-amber-500/30 text-[10px] text-amber-300 font-mono">
            {modelError}
          </span>
        )}
      </div>

      {/* ─── Top Right Navigation & Zoom Controls ─── */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-center gap-2.5 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            onOrientationReset?.()
            setCompassHeading(0)
          }}
          className="w-10 h-10 rounded-xl bg-[#081a33]/90 border border-sky-400/40 text-sky-300 hover:text-white hover:border-sky-300 flex items-center justify-center shadow-lg transition-all active:scale-95"
          title="Reset to North"
        >
          <span
            className="text-base font-bold transition-transform duration-200 inline-block select-none"
            style={{ transform: `rotate(${-compassHeading}deg)` }}
          >
            🧭
          </span>
        </button>

        <div className="flex flex-col rounded-xl overflow-hidden border border-sky-500/30 bg-[#081a33]/90 shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-10 h-9 flex items-center justify-center text-slate-200 hover:text-white hover:bg-sky-500/20 text-lg font-bold transition-colors border-b border-sky-500/20 active:scale-95 select-none"
            title="Zoom In"
          >
            +
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-10 h-9 flex items-center justify-center text-slate-200 hover:text-white hover:bg-sky-500/20 text-lg font-bold transition-colors active:scale-95 select-none"
            title="Zoom Out"
          >
            −
          </button>
        </div>
      </div>

      {/* ─── Interactive 3D Earth Globe ─── */}
      <div className="relative flex-1 w-full h-full min-h-[360px]">
        <Page3Globe
          onHoverCoordinates={handleHover}
          zoomTrigger={zoomTrigger}
          onOrientationChange={setCompassHeading}
          selectionMode={selectionMode}
          selectedRegion={selectedRegion}
          onRegionSelect={handleRegionSelect}
          observations={observations}
          visibleTypes={visibleTypes}
          selectedObservationId={selectedObservation?.id}
          onSelectObservation={onSelectObservation}
          activeLayerId={activeLayerId}
          layerVisibility={layerVisibility}
          scalarFieldData={scalarFieldData}
          uFieldData={uFieldData}
          vFieldData={vFieldData}
          vectorDensity={vectorDensity}
        />
      </div>

      {/* ─── Bottom Status Bar: Coordinates Readout & Selected ROI ─── */}
      <div className="relative z-20 flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#040e1b]/85 border border-sky-500/20 backdrop-blur-md text-[11px] font-mono text-slate-400 mt-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-semibold uppercase">Global Stage 1</span>
          </span>
          {activeHover ? (
            <span className="text-sky-300 font-bold">
              Lat: {activeHover.lat >= 0 ? `${activeHover.lat.toFixed(2)}°N` : `${Math.abs(activeHover.lat).toFixed(2)}°S`}, Lon: {activeHover.lon >= 0 ? `${activeHover.lon.toFixed(2)}°E` : `${Math.abs(activeHover.lon).toFixed(2)}°W`} ({activeHover.lat.toFixed(2)}°, {activeHover.lon.toFixed(2)}°)
            </span>
          ) : (
            <span className="text-slate-500">Lat: — | Lon: —</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {selectedRegion ? (
            <span className="text-teal-300 text-[10px] font-mono">
              ROI: Lat {Math.min(selectedRegion.latMin, selectedRegion.latMax).toFixed(2)}° → {Math.max(selectedRegion.latMin, selectedRegion.latMax).toFixed(2)}°, Lon {Math.min(selectedRegion.lonMin, selectedRegion.lonMax).toFixed(2)}° → {Math.max(selectedRegion.lonMin, selectedRegion.lonMax).toFixed(2)}°
            </span>
          ) : (
            <span className="text-slate-500 text-[10px] font-mono">ROI: None</span>
          )}
          <span className="text-[10px] text-slate-500">
            {selectionMode ? "Drag to box region" : "Orbit & Zoom enabled"}
          </span>
        </div>
      </div>
    </div>
  )
}
