"use client"

import React from "react"
import { DataLayerItem } from "./page3Config"
import { cssGradient, PaletteId } from "@/lib/colormaps"

interface ColorbarCardProps {
  activeLayer: DataLayerItem | null
  minVal?: number | null
  maxVal?: number | null
  unit?: string
}

export default function ColorbarCard({
  activeLayer,
  minVal,
  maxVal,
  unit,
}: ColorbarCardProps) {
  // If no model layer is selected -> Show Global Ocean View
  if (!activeLayer) {
    return (
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-lg shadow-black/40">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-1 flex items-center justify-between">
          <span>GLOBAL OCEAN VIEW</span>
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed mb-2 font-medium">
          No model data layer selected.
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
          The globe is showing the base Earth imagery and real in-situ observation locations.
        </p>
        <p className="text-[11px] text-sky-300/90 font-mono">
          Select Temperature, Salinity, Currents, or Chlorophyll to display a model layer.
        </p>
      </div>
    )
  }

  const isCurrents = activeLayer.id === "currents"
  const displayUnit = unit || activeLayer.unit

  // Scientific Min / Max
  const effMin = minVal !== undefined && minVal !== null ? minVal : activeLayer.defaultMin
  const effMax = maxVal !== undefined && maxVal !== null ? maxVal : activeLayer.defaultMax

  // Palette gradient
  const palette: PaletteId =
    activeLayer.id === "salinity" ? "viridis" : activeLayer.id === "chlorophyll" ? "plasma" : "turbo"
  const gradient = cssGradient(palette, 32)

  return (
    <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-lg shadow-black/40">
      <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-1 flex items-center justify-between">
        <span>COLOR SCALE & LEGEND</span>
      </h3>
      <p className="text-[11px] text-slate-400 mb-2.5">
        {isCurrents
          ? "Current speed magnitude \u221a(u\u00b2 + v\u00b2) & directional flow vectors."
          : `CMEMS real-time ${activeLayer.label.toLowerCase()} model distribution.`}
      </p>

      {/* Active Variable Title */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white tracking-wide">
          {activeLayer.label} ({displayUnit})
        </span>
        <span className="text-[10px] font-mono text-sky-400">
          {effMin.toFixed(1)} \u2192 {effMax.toFixed(1)} {displayUnit}
        </span>
      </div>

      {/* Gradient Bar */}
      <div className="relative flex flex-col gap-1.5">
        <div
          className="w-full h-3 rounded-md shadow-inner border border-white/20"
          style={{ background: gradient }}
        />

        {/* Dynamic 5-Tick Range */}
        <div className="flex justify-between text-[10px] font-mono text-slate-300 px-0.5">
          <span>{effMin.toFixed(1)}</span>
          <span>{(effMin + (effMax - effMin) * 0.25).toFixed(1)}</span>
          <span>{(effMin + (effMax - effMin) * 0.5).toFixed(1)}</span>
          <span>{(effMin + (effMax - effMin) * 0.75).toFixed(1)}</span>
          <span>{effMax.toFixed(1)} {displayUnit}</span>
        </div>
      </div>
    </div>
  )
}
