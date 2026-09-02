"use client"

import React, { useState, useEffect } from "react"

export interface ModelControlState {
  variable: string
  depth: number
  timeStepIndex: number
  showDepthSlices: boolean
  show3DVolume: boolean
  showIsosurfaces: boolean
  showCurrentVectors: boolean
  vectorDensity: number
  verticalExaggeration?: number
  isosurfaceValue?: number
  colorScale: string
}

interface ModelControlPanelProps {
  state: ModelControlState
  onChange: (updater: (prev: ModelControlState) => ModelControlState) => void
}

const VARIABLES = [
  { id: "temperature", label: "Temperature (°C)", unit: "°C", min: 10, max: 35 },
  { id: "salinity", label: "Salinity", unit: "PSU", min: 32, max: 37 },
  { id: "currents", label: "Currents", unit: "m/s", min: 0, max: 1.5 },
  { id: "chlorophyll", label: "Chlorophyll", unit: "mg/m³", min: 0.01, max: 5.0 },
]

export default function ModelControlPanel({ state, onChange }: ModelControlPanelProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  const activeVar = VARIABLES.find((v) => v.id === state.variable) || VARIABLES[0]

  // Time Playback Timer: Advances through real model daily steps (0..89)
  useEffect(() => {
    if (!isPlaying) return
    const intervalMs = Math.max(400, Math.round(1200 / speed))
    const timer = setInterval(() => {
      onChange((prev) => ({
        ...prev,
        timeStepIndex: (prev.timeStepIndex + 1) % 90,
      }))
    }, intervalMs)

    return () => clearInterval(timer)
  }, [isPlaying, speed, onChange])

  // Calculate formatted time date from timeStepIndex (0 - 89)
  const getDateStr = (index: number) => {
    const baseDate = new Date(Date.UTC(2026, 0, 1))
    baseDate.setUTCDate(baseDate.getUTCDate() + index)
    const day = baseDate.getUTCDate().toString().padStart(2, "0")
    const month = baseDate.toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    const year = baseDate.getUTCFullYear()
    return `${day} ${month} ${year}`
  }

  // Determine variable-specific isosurface thresholds
  const isoMin =
    state.variable === "temperature"
      ? 15
      : state.variable === "salinity"
      ? 33.0
      : state.variable === "chlorophyll"
      ? 0.02
      : 0.05

  const isoMax =
    state.variable === "temperature"
      ? 32
      : state.variable === "salinity"
      ? 36.5
      : state.variable === "chlorophyll"
      ? 2.0
      : 1.2

  const isoStep =
    state.variable === "temperature"
      ? 0.5
      : state.variable === "salinity"
      ? 0.1
      : state.variable === "chlorophyll"
      ? 0.02
      : 0.05

  const defaultIso =
    state.variable === "temperature"
      ? 26.0
      : state.variable === "salinity"
      ? 35.0
      : state.variable === "chlorophyll"
      ? 0.3
      : 0.35

  const currentIso = state.isosurfaceValue ?? defaultIso

  return (
    <aside className="w-full h-full flex flex-col gap-4 overflow-y-auto pr-0.5 text-slate-100 font-sans text-xs select-none">
      {/* ─── Header Badge ─── */}
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3 shadow-md">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase">
          MODEL CONTROLS
        </h3>
      </div>

      {/* ─── Variable Selector ─── */}
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3 shadow-md">
        <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block mb-1.5">
          VARIABLE
        </label>
        <select
          value={state.variable}
          onChange={(e) =>
            onChange((prev) => ({
              ...prev,
              variable: e.target.value,
              isosurfaceValue: undefined, // Reset to variable-specific default threshold
            }))
          }
          className="w-full bg-[#040e1b] border border-sky-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-sky-400 cursor-pointer"
        >
          {VARIABLES.map((v) => (
            <option key={v.id} value={v.id} className="bg-[#08172b] text-white">
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* ─── Depth Slider ─── */}
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3 shadow-md">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            DEPTH
          </label>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-sky-950/90 border border-sky-400/40 text-sky-300">
            {state.depth} m
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={2000}
          step={25}
          value={state.depth}
          onChange={(e) => onChange((prev) => ({ ...prev, depth: Number(e.target.value) }))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none"
        />
        <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1">
          <span>0 m</span>
          <span>2000 m</span>
        </div>
      </div>

      {/* ─── Time Slider & Media Controls ─── */}
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3 shadow-md">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            TIME
          </label>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-950/90 border border-sky-400/40 text-sky-300">
            {getDateStr(state.timeStepIndex)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={89}
          value={state.timeStepIndex}
          onChange={(e) => onChange((prev) => ({ ...prev, timeStepIndex: Number(e.target.value) }))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none"
        />
        <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1 mb-2">
          <span>01 Jan 2026</span>
          <span>31 Mar 2026</span>
        </div>

        <div className="flex items-center justify-center gap-2 pt-2 border-t border-sky-900/30">
          <button
            type="button"
            onClick={() => onChange((prev) => ({ ...prev, timeStepIndex: Math.max(0, prev.timeStepIndex - 1) }))}
            className="w-6 h-6 rounded bg-[#040e1b] border border-slate-700 hover:border-sky-400 text-[10px] flex items-center justify-center text-slate-300 hover:text-white"
            title="Previous Day"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold transition-colors ${
              isPlaying
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30"
                : "bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-md shadow-sky-500/20"
            }`}
            title={isPlaying ? "Pause Timeline" : "Play Timeline Animation"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            onClick={() => onChange((prev) => ({ ...prev, timeStepIndex: (prev.timeStepIndex + 1) % 90 }))}
            className="w-6 h-6 rounded bg-[#040e1b] border border-slate-700 hover:border-sky-400 text-[10px] flex items-center justify-center text-slate-300 hover:text-white"
            title="Next Day"
          >
            ⏭
          </button>
          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
            className="px-1.5 py-0.5 rounded bg-[#040e1b] border border-slate-700 text-[9px] font-mono text-sky-300 hover:border-sky-400"
            title="Toggle Playback Speed"
          >
            {speed}x
          </button>
        </div>
      </div>

      {/* ─── Visualization Options ─── */}
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3 shadow-md flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          VISUALIZATION OPTIONS
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={state.showDepthSlices}
              onChange={(e) => onChange((prev) => ({ ...prev, showDepthSlices: e.target.checked }))}
              className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
            />
            <span className="text-[11px] text-slate-200">Depth Slices</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={state.show3DVolume}
              onChange={(e) => onChange((prev) => ({ ...prev, show3DVolume: e.target.checked }))}
              className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
            />
            <span className="text-[11px] text-slate-200">3D Volume</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={state.showIsosurfaces}
              onChange={(e) => onChange((prev) => ({ ...prev, showIsosurfaces: e.target.checked }))}
              className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
            />
            <span className="text-[11px] text-slate-200">Isosurfaces</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={state.showCurrentVectors}
              onChange={(e) => onChange((prev) => ({ ...prev, showCurrentVectors: e.target.checked }))}
              className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
            />
            <span className="text-[11px] text-slate-200">Current Vectors</span>
          </label>
        </div>

        {/* Vector Density Slider */}
        <div className="pt-2 border-t border-sky-900/30">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span>Vector Density</span>
            <span className="font-mono text-sky-300">{state.vectorDensity}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            disabled={!state.showCurrentVectors}
            value={state.vectorDensity}
            onChange={(e) => onChange((prev) => ({ ...prev, vectorDensity: Number(e.target.value) }))}
            className={`w-full h-1 rounded-lg appearance-none cursor-pointer focus:outline-none ${
              state.showCurrentVectors ? "bg-slate-800 accent-sky-400" : "bg-slate-900 opacity-40 cursor-not-allowed"
            }`}
          />
        </div>

        {/* Vertical Exaggeration Slider (PS Explicit Requirement: 1x to 10x, default 7x) */}
        <div className="pt-2 border-t border-sky-900/30">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span>Vertical Exaggeration</span>
            <span className="font-mono text-sky-300 font-bold">{state.verticalExaggeration || 7}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={state.verticalExaggeration || 7}
            onChange={(e) => onChange((prev) => ({ ...prev, verticalExaggeration: Number(e.target.value) }))}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none"
          />
          <div className="flex justify-between text-[8px] font-mono text-slate-400 mt-0.5">
            <span>1×</span>
            <span>5×</span>
            <span>10×</span>
          </div>
        </div>

        {/* Isosurface Threshold Slider (When Isosurfaces toggle is ON) */}
        {state.showIsosurfaces && (
          <div className="pt-2 border-t border-sky-900/30 bg-sky-950/30 p-2 rounded-lg border border-sky-500/20">
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span className="text-emerald-300 font-semibold">Isosurface Threshold</span>
              <span className="font-mono text-emerald-400 font-bold">
                {currentIso.toFixed(state.variable === "chlorophyll" ? 2 : 1)} {activeVar.unit}
              </span>
            </div>
            <input
              type="range"
              min={isoMin}
              max={isoMax}
              step={isoStep}
              value={currentIso}
              onChange={(e) => onChange((prev) => ({ ...prev, isosurfaceValue: Number(e.target.value) }))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
            />
            <div className="flex justify-between text-[8px] font-mono text-slate-400 mt-0.5">
              <span>{isoMin} {activeVar.unit}</span>
              <span>{isoMax} {activeVar.unit}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
