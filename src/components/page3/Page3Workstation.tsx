"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useOcean } from "@/lib/store"
import {
  DATA_LAYERS,
  DataLayerItem,
  TIME_CONFIG,
  DEPTH_CONFIG,
} from "./page3Config"
import DataLayerSelector from "./DataLayerSelector"
import ObservationCounts from "./ObservationCounts"
import ColorbarCard from "./ColorbarCard"
import DescriptionCard from "./DescriptionCard"
import HowToUseCard from "./HowToUseCard"
import InstrumentLegend from "./InstrumentLegend"
import DepthSlider from "./DepthSlider"
import TimeSlider from "./TimeSlider"
import Page3CenterViewport from "./Page3CenterViewport"
import { GeographicBounds } from "./globe/RegionSelectionBox"
import Stage2Workstation from "./stage2/Stage2Workstation"
import { fetchObservations, ObservationItem } from "@/lib/observationsApi"
import { fetchModelField, ModelFieldResponse } from "@/lib/modelApi"

interface Page3WorkstationProps {
  onReturnToStudyRegion?: () => void
  onOpenManual?: () => void
}

export default function Page3Workstation({
  onReturnToStudyRegion,
  onOpenManual,
}: Page3WorkstationProps = {}) {
  const theme = useOcean((s) => s.theme)
  const setTheme = useOcean((s) => s.setTheme)

  // Stage Switcher: Stage 1 (Global Overview) | Stage 2 (Region Selected 3D Model View)
  const [stage, setStage] = useState<1 | 2>(1)
  const [selectedRegion, setSelectedRegion] = useState<GeographicBounds | null>({
    latMin: -18.0,
    latMax: -5.0,
    lonMin: 65.0,
    lonMax: 85.0,
  })

  // Real In-Situ Observations State
  const [observations, setObservations] = useState<ObservationItem[]>([])
  const [obsCounts, setObsCounts] = useState<Record<string, number>>({
    argo: 22231,
    glider: 2591,
    ctd: 619,
    bgc: 2257,
  })
  const [obsVisibility, setObsVisibility] = useState<Record<string, boolean>>({
    argo: true,
    glider: true,
    ctd: true,
    bgc: true,
  })
  const [obsLoading, setObsLoading] = useState<boolean>(true)
  const [obsError, setObsError] = useState<string | null>(null)
  const [selectedObservation, setSelectedObservation] = useState<ObservationItem | null>(null)

  // Real Scientific Model Layers State (null = Base Ocean / No Model Layer)
  const [activeLayer, setActiveLayer] = useState<DataLayerItem | null>(null)
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({
    temperature: true,
    salinity: true,
    currents: true,
    chlorophyll: true,
  })
  const [depth, setDepth] = useState<number>(DEPTH_CONFIG.initial)
  const [selectedDate, setSelectedDate] = useState<string>("2026-02-15")
  const [selectedDateIndex, setSelectedDateIndex] = useState<number>(TIME_CONFIG.initialStepIndex)
  const [vectorDensity, setVectorDensity] = useState<"low" | "medium" | "high">("medium")

  // Fetched Model Data Slices
  const [scalarFieldData, setScalarFieldData] = useState<ModelFieldResponse | null>(null)
  const [uFieldData, setUFieldData] = useState<ModelFieldResponse | null>(null)
  const [vFieldData, setVFieldData] = useState<ModelFieldResponse | null>(null)
  const [modelLoading, setModelLoading] = useState<boolean>(false)
  const [modelError, setModelError] = useState<string | null>(null)

  // Fetch real observation index from backend once on mount
  useEffect(() => {
    let isMounted = true
    setObsLoading(true)
    fetchObservations({ limit: 2500 })
      .then((res) => {
        if (!isMounted) return
        setObservations(res.items || [])
        if (res.counts_by_type && Object.keys(res.counts_by_type).length > 0) {
          setObsCounts(res.counts_by_type)
        }
        setObsLoading(false)
        setObsError(null)
      })
      .catch((err) => {
        if (!isMounted) return
        console.warn("Backend observation fetch notice:", err)
        setObsLoading(false)
        setObsError("Backend connection pending")
      })

    return () => {
      isMounted = false
    }
  }, [])

  // Fetch real model field slice whenever activeLayer, depth, or selectedDate changes
  useEffect(() => {
    let isMounted = true

    if (!activeLayer) {
      setModelLoading(false)
      setModelError(null)
      setScalarFieldData(null)
      setUFieldData(null)
      setVFieldData(null)
      return
    }

    setModelLoading(true)
    setModelError(null)

    if (activeLayer.id === "currents") {
      // Fetch both u_velocity and v_velocity
      Promise.all([
        fetchModelField({ variable: "u_velocity", time: selectedDate, depth, stride: 4 }),
        fetchModelField({ variable: "v_velocity", time: selectedDate, depth, stride: 4 }),
      ])
        .then(([uRes, vRes]) => {
          if (!isMounted) return
          setUFieldData(uRes)
          setVFieldData(vRes)
          setScalarFieldData(null)
          setModelLoading(false)
          setModelError(null)
        })
        .catch((err) => {
          if (!isMounted) return
          console.warn("Currents model fetch error:", err)
          setModelLoading(false)
          setModelError("Currents model data unavailable")
        })
    } else {
      // Fetch scalar variable: temperature, salinity, or chlorophyll
      const varName = activeLayer.id === "temperature" ? "temperature" : activeLayer.id === "salinity" ? "salinity" : "chlorophyll"
      fetchModelField({ variable: varName, time: selectedDate, depth, stride: 4 })
        .then((res) => {
          if (!isMounted) return
          setScalarFieldData(res)
          setUFieldData(null)
          setVFieldData(null)
          setModelLoading(false)
          setModelError(null)
        })
        .catch((err) => {
          if (!isMounted) return
          console.warn(`${activeLayer.label} model fetch error:`, err)
          setModelLoading(false)
          setModelError(`${activeLayer.label} data unavailable`)
        })
    }

    return () => {
      isMounted = false
    }
  }, [activeLayer, depth, selectedDate])

  // Convert timeline index (0..89) to date string (2026-01-01 to 2026-03-31)
  const handleDateIndexChange = useCallback((idx: number) => {
    setSelectedDateIndex(idx)
    const start = new Date(2026, 0, 1)
    start.setDate(start.getDate() + idx)
    const yyyy = start.getFullYear()
    const mm = String(start.getMonth() + 1).padStart(2, "0")
    const dd = String(start.getDate()).padStart(2, "0")
    setSelectedDate(`${yyyy}-${mm}-${dd}`)
  }, [])

  // Calculate human date string from step index
  const getCurrentDateStr = () => {
    const baseDate = new Date(Date.UTC(2026, 0, 1))
    baseDate.setUTCDate(baseDate.getUTCDate() + selectedDateIndex)
    const day = baseDate.getUTCDate().toString().padStart(2, "0")
    const month = baseDate.toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    const year = baseDate.getUTCFullYear()
    return `${day} ${month} ${year}`
  }

  // Toggle observation marker type visibility
  const handleToggleObsType = (typeId: string) => {
    setObsVisibility((prev) => ({
      ...prev,
      [typeId]: prev[typeId] === false ? true : false,
    }))
  }

  // Toggle model layer visibility
  const handleToggleLayerVisibility = (layerId: string) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerId]: prev[layerId] === false ? true : false,
    }))
  }

  // Handle region confirmation from modal
  const handleConfirmRegionExplore = (bounds: GeographicBounds) => {
    setSelectedRegion(bounds)
    setStage(2)
  }

  // If Stage 2 is active, render Stage2Workstation
  if (stage === 2 && selectedRegion) {
    return (
      <Stage2Workstation
        selectedRegion={selectedRegion}
        onBackToGlobal={() => setStage(1)}
        onOpenManual={onOpenManual}
      />
    )
  }

  return (
    <div className="relative w-screen h-screen flex flex-col justify-between overflow-hidden select-none bg-[#030914] text-slate-100 font-sans">
      {/* ─── APPROVED WORKSTATION HEADER ─── */}
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

        {/* Right: Manual & Theme Buttons */}
        <div className="flex items-center gap-2.5">
          {onReturnToStudyRegion && (
            <button
              type="button"
              onClick={onReturnToStudyRegion}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-300 hover:text-white bg-[#0a1f3d]/60 hover:bg-[#0f2d59] border border-sky-500/30 transition-all flex items-center gap-1 shadow-sm"
              title="Return to Page 2 Study Region"
            >
              <span>←</span>
              <span className="hidden sm:inline">Study Region</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenManual}
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

      {/* ─── APPROVED 3-COLUMN WORKSPACE: 25% LEFT | 50% CENTER | 25% RIGHT ─── */}
      <main className="relative flex-1 w-full flex flex-col lg:flex-row gap-3 p-3 md:p-4 overflow-y-auto lg:overflow-hidden">
        {/* ─── LEFT 25% PANEL: Observation Counts & Controls ─── */}
        <aside className="w-full lg:w-1/4 h-full flex flex-col gap-3 overflow-y-auto pr-0 lg:pr-1">
          <ObservationCounts
            counts={obsCounts}
            visibleTypes={obsVisibility}
            onToggleType={handleToggleObsType}
          />
          <DataLayerSelector
            activeLayerId={activeLayer ? activeLayer.id : null}
            onSelectLayer={setActiveLayer}
            layerVisibility={layerVisibility}
            onToggleVisibility={handleToggleLayerVisibility}
          />
          <DepthSlider depth={depth} onChangeDepth={setDepth} />
          <TimeSlider
            currentDateStr={getCurrentDateStr()}
            stepIndex={selectedDateIndex}
            onStepChange={handleDateIndexChange}
          />
        </aside>

        {/* ─── CENTER 50% VIEWPORT: 3D Earth Globe ─── */}
        <section className="w-full lg:w-1/2 h-full flex flex-col">
          <Page3CenterViewport
            selectedRegion={selectedRegion}
            onConfirmRegionExplore={handleConfirmRegionExplore}
            onRegionChange={setSelectedRegion}
            observations={observations}
            visibleTypes={obsVisibility}
            obsLoading={obsLoading}
            obsError={obsError}
            selectedObservation={selectedObservation}
            onSelectObservation={setSelectedObservation}
            activeLayerId={activeLayer ? activeLayer.id : undefined}
            layerVisibility={layerVisibility}
            scalarFieldData={scalarFieldData}
            uFieldData={uFieldData}
            vFieldData={vFieldData}
            modelLoading={modelLoading}
            modelError={modelError}
            vectorDensity={vectorDensity}
          />
        </section>

        {/* ─── RIGHT 25% PANEL: Context, Colorbar, Description & Legend ─── */}
        <aside className="w-full lg:w-1/4 h-full flex flex-col gap-3 overflow-y-auto pl-0 lg:pl-1">
          <ColorbarCard
            activeLayer={activeLayer}
            minVal={scalarFieldData?.min_value ?? (activeLayer?.id === "currents" ? 0 : null)}
            maxVal={scalarFieldData?.max_value ?? (activeLayer?.id === "currents" ? 1.5 : null)}
            unit={scalarFieldData?.unit || (activeLayer?.id === "currents" ? "m/s" : activeLayer?.unit)}
          />
          <DescriptionCard activeLayer={activeLayer} />
          <HowToUseCard />
          <InstrumentLegend />
        </aside>
      </main>

      {/* ─── APPROVED WORKSTATION FOOTER ─── */}
      <footer className="relative z-30 h-9 px-4 md:px-6 flex items-center justify-between border-t border-sky-500/20 bg-[#051124]/90 backdrop-blur-md text-[10px] md:text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span>Data Source:</span>
          <span className="text-slate-200 font-medium">
            Copernicus Marine Service • IFREMER • NOAA / NCEI WOD
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_8px_#22c55e]" />
          <span>Official Data Sources Configured</span>
        </div>
      </footer>
    </div>
  )
}
