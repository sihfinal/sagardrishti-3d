"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useOcean } from "@/lib/store"
import { GeographicBounds } from "../globe/RegionSelectionBox"
import ModelControlPanel, { ModelControlState } from "./ModelControlPanel"
import Region3DViewport from "./Region3DViewport"
import RegionInformationPanel from "./RegionInformationPanel"
import ObservationDetailModal from "../ObservationDetailModal"
import Manual from "@/ui/Manual"
import { fetchObservations, ObservationItem } from "@/lib/observationsApi"
import { fetchModelField, ModelFieldResponse } from "@/lib/modelApi"

interface Stage2WorkstationProps {
  selectedRegion: GeographicBounds | null
  onBackToGlobal: () => void
  onOpenManual?: () => void
}

// 7 Representative valid model depth levels spanning the water column
const TARGET_DEPTH_LEVELS = [0, 25, 50, 100, 250, 500, 1000]

export default function Stage2Workstation({
  selectedRegion,
  onBackToGlobal,
  onOpenManual,
}: Stage2WorkstationProps) {
  const theme = useOcean((s) => s.theme)
  const setTheme = useOcean((s) => s.setTheme)

  const [modelState, setModelState] = useState<ModelControlState>({
    variable: "temperature",
    depth: 250,
    timeStepIndex: 45, // ~15 Feb 2026
    showDepthSlices: true,
    show3DVolume: false,
    showIsosurfaces: false,
    showCurrentVectors: true,
    vectorDensity: 60,
    verticalExaggeration: 7,
    colorScale: "turbo",
  })

  // Real Regional Observations State
  const [observations, setObservations] = useState<ObservationItem[]>([])
  const [regionalCounts, setRegionalCounts] = useState<Record<string, number>>({
    argo: 0,
    glider: 0,
    ctd: 0,
    bgc: 0,
  })
  const [obsLoading, setObsLoading] = useState<boolean>(true)
  const [obsError, setObsError] = useState<string | null>(null)
  const [selectedObs, setSelectedObs] = useState<ObservationItem | null>(null)

  // Real 3D Depth-Resolved Model Fields State
  const [depthStack, setDepthStack] = useState<ModelFieldResponse[]>([])
  const [uDepthStack, setUDepthStack] = useState<ModelFieldResponse[]>([])
  const [vDepthStack, setVDepthStack] = useState<ModelFieldResponse[]>([])
  const [modelLoading, setModelLoading] = useState<boolean>(false)
  const [modelError, setModelError] = useState<string | null>(null)

  // Data Status Popup State
  const [showDataStatus, setShowDataStatus] = useState<boolean>(false)
  const [is3DMaximized, setIs3DMaximized] = useState<boolean>(false)
  const [manualOpen, setManualOpen] = useState<boolean>(false)
  const dataStatusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showDataStatus) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dataStatusRef.current && !dataStatusRef.current.contains(e.target as Node)) {
        setShowDataStatus(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showDataStatus])

  // Convert timeline index (0..89) to date string (2026-01-01 to 2026-03-31)
  const getDateStr = useCallback((idx: number) => {
    const start = new Date(2026, 0, 1)
    start.setDate(start.getDate() + idx)
    const yyyy = start.getFullYear()
    const mm = String(start.getMonth() + 1).padStart(2, "0")
    const dd = String(start.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  }, [])

  // 1. Fetch real in-situ observations filtered strictly by the selected ROI
  useEffect(() => {
    let isMounted = true
    if (!selectedRegion) {
      setObsLoading(false)
      return
    }

    const latMin = Math.min(selectedRegion.latMin, selectedRegion.latMax)
    const latMax = Math.max(selectedRegion.latMin, selectedRegion.latMax)
    const lonMin = Math.min(selectedRegion.lonMin, selectedRegion.lonMax)
    const lonMax = Math.max(selectedRegion.lonMin, selectedRegion.lonMax)

    setObsLoading(true)
    setObsError(null)

    fetchObservations({
      lat_min: latMin,
      lat_max: latMax,
      lon_min: lonMin,
      lon_max: lonMax,
      limit: 2500,
    })
      .then((res) => {
        if (!isMounted) return
        const items = res.items || []
        setObservations(items)

        // Compute actual counts for the regional subset
        const counts: Record<string, number> = { argo: 0, glider: 0, ctd: 0, bgc: 0 }
        for (const item of items) {
          if (counts[item.type] !== undefined) {
            counts[item.type]++
          }
        }
        setRegionalCounts(counts)
        setObsLoading(false)
        setObsError(null)
      })
      .catch((err) => {
        if (!isMounted) return
        console.warn("Regional observation fetch error:", err)
        setObsLoading(false)
        setObsError("Could not retrieve regional observations")
      })

    return () => {
      isMounted = false
    }
  }, [selectedRegion])

  // 2. Fetch real 3D CMEMS multi-depth stack whenever variable, region, or time changes
  useEffect(() => {
    let isMounted = true
    if (!selectedRegion) return

    const latMin = Math.min(selectedRegion.latMin, selectedRegion.latMax)
    const latMax = Math.max(selectedRegion.latMin, selectedRegion.latMax)
    const lonMin = Math.min(selectedRegion.lonMin, selectedRegion.lonMax)
    const lonMax = Math.max(selectedRegion.lonMin, selectedRegion.lonMax)
    const currentDate = getDateStr(modelState.timeStepIndex)

    setModelLoading(true)
    setModelError(null)

    const span = Math.max(latMax - latMin, lonMax - lonMin)
    const stride = span > 20 ? 3 : span > 10 ? 2 : 1

    if (modelState.variable === "currents") {
      // Parallel fetch for 3D u and v depth slices
      Promise.all(
        TARGET_DEPTH_LEVELS.map((d) =>
          Promise.all([
            fetchModelField({
              variable: "u_velocity",
              time: currentDate,
              depth: d,
              lat_min: latMin,
              lat_max: latMax,
              lon_min: lonMin,
              lon_max: lonMax,
              stride,
            }),
            fetchModelField({
              variable: "v_velocity",
              time: currentDate,
              depth: d,
              lat_min: latMin,
              lat_max: latMax,
              lon_min: lonMin,
              lon_max: lonMax,
              stride,
            }),
          ])
        )
      )
        .then((results) => {
          if (!isMounted) return
          const uSlices = results.map((r) => r[0])
          const vSlices = results.map((r) => r[1])
          setUDepthStack(uSlices)
          setVDepthStack(vSlices)
          setDepthStack([])
          setModelLoading(false)
          setModelError(null)
        })
        .catch((err) => {
          if (!isMounted) return
          console.warn("3D currents model fetch error:", err)
          setModelLoading(false)
          setModelError("3D Currents model data unavailable")
        })
    } else {
      // Scalar variables: temperature, salinity, chlorophyll
      const varName =
        modelState.variable === "salinity"
          ? "salinity"
          : modelState.variable === "chlorophyll"
          ? "chlorophyll"
          : "temperature"

      Promise.all(
        TARGET_DEPTH_LEVELS.map((d) =>
          fetchModelField({
            variable: varName,
            time: currentDate,
            depth: d,
            lat_min: latMin,
            lat_max: latMax,
            lon_min: lonMin,
            lon_max: lonMax,
            stride,
          })
        )
      )
        .then((slices) => {
          if (!isMounted) return
          setDepthStack(slices)
          setUDepthStack([])
          setVDepthStack([])
          setModelLoading(false)
          setModelError(null)
        })
        .catch((err) => {
          if (!isMounted) return
          console.warn(`3D ${varName} model fetch error:`, err)
          setModelLoading(false)
          setModelError(`3D ${varName.toUpperCase()} model data unavailable`)
        })
    }

    return () => {
      isMounted = false
    }
  }, [selectedRegion, modelState.variable, modelState.timeStepIndex, getDateStr])

  // Get single primary slice matching the selected depth for the right panel metadata
  const activePrimarySlice = depthStack.find((s) => s.depth && Math.abs(s.depth - modelState.depth) < 100) || depthStack[0] || null
  const activeUSlice = uDepthStack.find((s) => s.depth && Math.abs(s.depth - modelState.depth) < 100) || uDepthStack[0] || null
  const activeVSlice = vDepthStack.find((s) => s.depth && Math.abs(s.depth - modelState.depth) < 100) || vDepthStack[0] || null

  return (
    <div className="relative w-screen h-screen flex flex-col justify-between overflow-hidden select-none bg-[#030914] text-slate-100 font-sans">
      {/* ─── Observation Detail Modal / Inspector ─── */}
      <ObservationDetailModal
        observation={selectedObs}
        onClose={() => setSelectedObs(null)}
      />

      {/* ─── User Manual Modal Dialog ─── */}
      <Manual open={manualOpen} onClose={() => setManualOpen(false)} />

      {/* ─── WORKSTATION HEADER ─── */}
      <header className="relative z-30 h-14 px-4 md:px-6 flex items-center justify-between border-b border-sky-500/20 bg-[#051124]/90 backdrop-blur-md">
        {/* Left: Branding & Subtitle */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-sky-400 to-teal-300 shadow shadow-sky-500/40" />
            <div className="flex flex-col">
              <span className="font-black text-sm md:text-base tracking-tight text-white group-hover:text-sky-300 transition-colors">
                SAGARDRISHTI-3D
              </span>
              <span className="text-[10px] text-sky-400/80 font-semibold tracking-wider -mt-1">
                Ocean Observation & Model Explorer
              </span>
            </div>
          </Link>
        </div>

        {/* Right: Data Status, Back to Global, Manual & Theme Buttons */}
        <div className="flex items-center gap-2.5">
          {/* Data Status Button & Popover */}
          <div ref={dataStatusRef} className="relative">
            <button
              type="button"
              onClick={() => setShowDataStatus((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 shadow-sm ${
                showDataStatus
                  ? "bg-[#0f2d59] border-sky-400 text-white shadow-sky-500/20"
                  : "text-slate-300 hover:text-white bg-[#0a1f3d]/60 hover:bg-[#0f2d59] border-slate-700/60 hover:border-sky-500/40"
              }`}
              title="View Ocean Data Sources & Status"
            >
              <span className="text-sky-400 font-mono text-[11px]">↻</span>
              <span>Data Status</span>
            </button>

            {/* Popover */}
            {showDataStatus && (
              <div className="absolute top-full right-0 md:left-0 mt-2 z-50 w-56 rounded-xl border border-sky-500/30 bg-[#061426]/95 p-3 text-xs font-sans text-slate-200 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between pb-2 border-b border-sky-500/20">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-sky-300 uppercase">
                    DATA STATUS
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDataStatus(false)}
                    className="text-slate-400 hover:text-white text-xs leading-none"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-col gap-2.5 pt-2.5">
                  <div>
                    <div className="text-[10px] font-medium text-slate-400">Model Source</div>
                    <div className="text-[11px] font-semibold text-white">Copernicus Marine Service</div>
                  </div>

                  <div>
                    <div className="text-[10px] font-medium text-slate-400">In-situ Source</div>
                    <div className="text-[11px] font-semibold text-white">IFREMER / NOAA / NCEI WOD</div>
                  </div>

                  <div className="pt-1 border-t border-sky-900/30 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-slate-400">Current Status</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Available
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onBackToGlobal}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-300 hover:text-white bg-[#0a1f3d]/60 hover:bg-[#0f2d59] border border-sky-500/30 transition-all flex items-center gap-1 shadow-sm"
            title="Return to Stage 1: Global Overview"
          >
            <span>←</span>
            <span>Global Overview</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onOpenManual) onOpenManual()
              setManualOpen(true)
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:text-white bg-[#0a1f3d]/60 hover:bg-[#0f2d59] border border-slate-700/60 hover:border-sky-400/50 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <span>📖</span>
            <span>Manual</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-sky-300 hover:text-white bg-[#0a1f3d]/60 hover:bg-[#0f2d59] border border-slate-700/60 hover:border-sky-400/50 transition-all shadow-sm"
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* ─── MAIN 3-COLUMN WORKSPACE: 20% LEFT | 50% CENTER | 30% RIGHT ─── */}
      <main className="relative flex-1 w-full flex flex-col lg:flex-row gap-3 p-3 md:p-4 overflow-y-auto lg:overflow-hidden">
        {/* ─── LEFT 20% PANEL: Model Controls (Hidden when 3D Model is Maximized) ─── */}
        {!is3DMaximized && (
          <section className="w-full lg:w-[20%] h-full flex flex-col">
            <ModelControlPanel state={modelState} onChange={setModelState} />
          </section>
        )}

        {/* ─── CENTER 50% VIEWPORT: 3D Depth-Resolved Model & Observation View (Expands to 100% when Maximized) ─── */}
        <section className={`w-full ${is3DMaximized ? "lg:w-full" : "lg:w-[50%]"} h-full flex flex-col`}>
          <Region3DViewport
            selectedRegion={selectedRegion}
            modelState={modelState}
            depthStack={depthStack}
            uDepthStack={uDepthStack}
            vDepthStack={vDepthStack}
            modelLoading={modelLoading}
            modelError={modelError}
            observations={observations}
            obsLoading={obsLoading}
            obsError={obsError}
            onSelectObservation={setSelectedObs}
            isMaximized={is3DMaximized}
            onToggleMaximize={() => setIs3DMaximized((prev) => !prev)}
          />
        </section>

        {/* ─── RIGHT 30% PANEL: Region Information & Real Model Metadata (Hidden when 3D Model is Maximized) ─── */}
        {!is3DMaximized && (
          <section className="w-full lg:w-[30%] h-full flex flex-col">
            <RegionInformationPanel
              selectedRegion={selectedRegion}
              modelState={modelState}
              regionalCounts={regionalCounts}
              totalObservations={observations.length}
              scalarFieldData={activePrimarySlice}
              uFieldData={activeUSlice}
              vFieldData={activeVSlice}
              modelLoading={modelLoading}
            />
          </section>
        )}
      </main>

      {/* ─── WORKSTATION FOOTER ─── */}
      <footer className="relative z-30 h-9 px-4 md:px-6 flex items-center justify-between border-t border-sky-500/20 bg-[#051124]/90 backdrop-blur-md text-[10px] md:text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span>Data Source:</span>
          <span className="text-slate-200 font-medium">
            Copernicus Marine Service • IFREMER • NOAA / NCEI WOD
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-sky-400 font-semibold font-mono">
          <span className="w-2 h-2 rounded-full bg-sky-400 inline-block shadow-[0_0_8px_#38bdf8]" />
          <span>Stage 2.2: 3D Depth-Resolved Ocean Model Active</span>
        </div>
      </footer>
    </div>
  )
}
