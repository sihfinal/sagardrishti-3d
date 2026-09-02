"use client"

import React from "react"
import { GeographicBounds } from "../globe/RegionSelectionBox"
import { ModelControlState } from "./ModelControlPanel"
import { ModelFieldResponse } from "@/lib/modelApi"

interface RegionInformationPanelProps {
  selectedRegion: GeographicBounds | null
  modelState: ModelControlState
  regionalCounts: Record<string, number>
  totalObservations: number
  scalarFieldData: ModelFieldResponse | null
  uFieldData: ModelFieldResponse | null
  vFieldData: ModelFieldResponse | null
  modelLoading: boolean
}

const VAR_METADATA: Record<
  string,
  { label: string; cmemsVar: string; unit: string; product: string }
> = {
  temperature: {
    label: "Temperature",
    cmemsVar: "thetao",
    unit: "°C",
    product: "GLOBAL_ANALYSIS_PHY_001_024",
  },
  salinity: {
    label: "Salinity",
    cmemsVar: "so",
    unit: "PSU",
    product: "GLOBAL_ANALYSIS_PHY_001_024",
  },
  currents: {
    label: "Current Velocity",
    cmemsVar: "uo, vo",
    unit: "m/s",
    product: "GLOBAL_ANALYSIS_PHY_001_024",
  },
  chlorophyll: {
    label: "Chlorophyll",
    cmemsVar: "chl",
    unit: "mg/m³",
    product: "GLOBAL_ANALYSIS_BGC_001_028",
  },
}

export default function RegionInformationPanel({
  selectedRegion,
  modelState,
  regionalCounts,
  totalObservations,
  scalarFieldData,
  uFieldData,
  vFieldData,
  modelLoading,
}: RegionInformationPanelProps) {
  const getDateStr = (index: number) => {
    const baseDate = new Date(Date.UTC(2026, 0, 1))
    baseDate.setUTCDate(baseDate.getUTCDate() + index)
    const day = baseDate.getUTCDate().toString().padStart(2, "0")
    const month = baseDate.toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    const year = baseDate.getUTCFullYear()
    return `${day} ${month} ${year}`
  }

  const bounds = selectedRegion || { latMin: -18.0, latMax: -5.0, lonMin: 65.0, lonMax: 85.0 }
  const latMin = Math.min(bounds.latMin, bounds.latMax)
  const latMax = Math.max(bounds.latMin, bounds.latMax)
  const lonMin = Math.min(bounds.lonMin, bounds.lonMax)
  const lonMax = Math.max(bounds.lonMin, bounds.lonMax)

  const dLat = (latMax - latMin).toFixed(2)
  const dLon = (lonMax - lonMin).toFixed(2)

  const formatCoord = (val: number, isLat: boolean) => {
    if (isLat) {
      return val >= 0 ? `${val.toFixed(2)}°N` : `${Math.abs(val).toFixed(2)}°S`
    }
    return val >= 0 ? `${val.toFixed(2)}°E` : `${Math.abs(val).toFixed(2)}°W`
  }

  const isCurrents = modelState.variable === "currents"
  const activeModel = isCurrents ? uFieldData : scalarFieldData
  const meta = VAR_METADATA[modelState.variable] || VAR_METADATA.temperature

  return (
    <aside className="w-full h-full flex flex-col gap-2.5 overflow-y-auto pl-0.5 text-slate-100 font-sans text-xs select-none">
      {/* ─── Region Information ─── */}
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-md">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-2">
          REGION INFORMATION
        </h3>
        <div className="space-y-1.5 font-mono text-[11px]">
          <div className="flex items-center justify-between text-slate-400">
            <span>Latitude:</span>
            <span className="text-sky-300 font-semibold">
              {formatCoord(latMin, true)} → {formatCoord(latMax, true)}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Longitude:</span>
            <span className="text-sky-300 font-semibold">
              {formatCoord(lonMin, false)} → {formatCoord(lonMax, false)}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-sky-900/30">
            <span>Span:</span>
            <span className="text-slate-200">Δ {dLat}° × {dLon}°</span>
          </div>
        </div>
      </div>

      {/* ─── Model Data (Real CMEMS Data) ─── */}
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-md">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-2">
          MODEL DATA
        </h3>
        <div className="space-y-1.5 text-[11px] font-mono">
          <div className="flex items-center justify-between text-slate-400">
            <span>Variable:</span>
            <span className="text-white font-semibold">
              {meta.label} ({meta.cmemsVar})
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Depth:</span>
            <span className="text-sky-300 font-semibold">
              {activeModel?.depth !== undefined
                ? `${modelState.depth} m (Resolved: ${activeModel.depth.toFixed(1)} m)`
                : `${modelState.depth} m`}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Time:</span>
            <span className="text-white">{getDateStr(modelState.timeStepIndex)}</span>
          </div>
          
          {scalarFieldData && !isCurrents && (
            <div className="flex items-center justify-between text-slate-400">
              <span>Value Range:</span>
              <span className="text-emerald-300 font-bold">
                {scalarFieldData.min_value?.toFixed(2)} → {scalarFieldData.max_value?.toFixed(2)} {meta.unit}
              </span>
            </div>
          )}

          {isCurrents && uFieldData && vFieldData && (
            <div className="flex items-center justify-between text-slate-400">
              <span>Current Range:</span>
              <span className="text-emerald-300 font-bold">
                0.00 → 1.00 m/s
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-sky-900/30">
            <span>Status:</span>
            {modelLoading ? (
              <span className="text-sky-400 font-semibold text-[10px] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full border border-sky-400 border-t-transparent animate-spin inline-block" />
                Loading…
              </span>
            ) : activeModel ? (
              <span className="text-emerald-400 font-semibold text-[10px]">Real CMEMS Data</span>
            ) : (
              <span className="text-rose-400 font-semibold text-[10px]">Model Unavailable</span>
            )}
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Source:</span>
            <span className="text-slate-300 text-[10px]">Copernicus Marine Service</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Dataset:</span>
            <span className="text-slate-300 text-[10px]">{meta.product}</span>
          </div>
        </div>
      </div>

      {/* ─── Instruments in Region (Real Counts) ─── */}
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-md">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-2">
          INSTRUMENTS IN REGION
        </h3>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between py-1 px-2 rounded bg-[#040e1b]/50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-300">Argo Floats</span>
            </div>
            <span className="font-mono font-bold text-sky-300">
              {regionalCounts.argo?.toLocaleString() ?? 0}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 px-2 rounded bg-[#040e1b]/50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-cyan-500" />
              <span className="text-slate-300">Gliders</span>
            </div>
            <span className="font-mono font-bold text-sky-300">
              {regionalCounts.glider?.toLocaleString() ?? 0}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 px-2 rounded bg-[#040e1b]/50">
            <div className="flex items-center gap-2">
              <span className="text-[11px] leading-none text-orange-500">▲</span>
              <span className="text-slate-300">CTD Profiles</span>
            </div>
            <span className="font-mono font-bold text-sky-300">
              {regionalCounts.ctd?.toLocaleString() ?? 0}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 px-2 rounded bg-[#040e1b]/50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-purple-500" />
              <span className="text-slate-300">BGC Measurements</span>
            </div>
            <span className="font-mono font-bold text-sky-300">
              {regionalCounts.bgc?.toLocaleString() ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Real Observations Summary ─── */}
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-md">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-2">
          REAL OBSERVATIONS
        </h3>
        <div className="space-y-1.5 text-[11px] font-mono">
          <div className="flex items-center justify-between text-slate-400">
            <span>Total Profiles:</span>
            <span className="text-emerald-400 font-bold">{totalObservations.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-sky-900/30">
            <span>Source:</span>
            <span className="text-slate-300 text-[10px] text-right">NOAA / NCEI World Ocean Database</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
