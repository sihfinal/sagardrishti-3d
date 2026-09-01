"use client"

import { create } from "zustand"
import type { Manifest } from "@/types"

export type PaletteId = "turbo" | "viridis" | "plasma" | "diverging"

interface OceanState {
  manifest: Manifest | null
  variableId: string
  depthIdx: number
  timeIdx: number
  playing: boolean
  palette: PaletteId
  rangeMin: number | null
  rangeMax: number | null
  logScale: boolean
  opacity: number
  vertExaggeration: number
  selectedPlatformId: string | null
  hoverInfo: {
    id: string
    type: string
    lastSeen: string
    obsTemp: number | null
    modelTemp: number | null
    screen: { x: number; y: number }
  } | null
  isoEnabled: boolean
  isoValue: number
  scatterOpen: boolean
  cameraFocus: { x: number; y: number; z: number } | null
  cloudsEnabled: boolean
  cloudBandMin: number
  cloudBandMax: number
  transectEnabled: boolean
  transectLat: number
  wallsEnabled: boolean
  snowEnabled: boolean
  raysEnabled: boolean
  scanEnabled: boolean
  cinemaEnabled: boolean
  sunElevation: number
  vectorsEnabled: boolean
  showModel: boolean
  showArgo: boolean
  showGlider: boolean
  showBgc: boolean
  showTrajectory: boolean
  vectorDensity: number
  vectorScale: number
  probe: {
    lon: number
    lat: number
    depthM: number
    value: number | null
    variableName?: string
    unit?: string
  } | null
  viewMode: "globe" | "volume"
  quality: "low" | "medium" | "high"
  lensEnabled: boolean
  lensShowArgo: boolean
  lensShowGlider: boolean
  lensMinErr: number
  lensMode: "error" | "obs" | "model"
  lensChannel: "temp" | "salt"
  theme: "dark" | "light"

  cameraResetTrigger: number
  triggerCameraReset: () => void

  setShowModel: (v: boolean) => void
  setShowArgo: (v: boolean) => void
  setShowGlider: (v: boolean) => void
  setShowBgc: (v: boolean) => void
  setShowTrajectory: (v: boolean) => void
  setVectorDensity: (v: number) => void
  setVectorScale: (v: number) => void
  setManifest: (m: Manifest) => void
  setVariable: (id: string) => void
  setDepthIdx: (i: number) => void
  setTimeIdx: (i: number) => void
  setPlaying: (p: boolean) => void
  setPalette: (p: PaletteId) => void
  setRange: (min: number | null, max: number | null) => void
  setLogScale: (v: boolean) => void
  setOpacity: (v: number) => void
  setVertExaggeration: (v: number) => void
  selectPlatform: (id: string | null) => void
  setHoverInfo: (h: OceanState["hoverInfo"]) => void
  setIsoEnabled: (v: boolean) => void
  setIsoValue: (v: number) => void
  setScatterOpen: (v: boolean) => void
  setCameraFocus: (p: { x: number; y: number; z: number } | null) => void
  setCloudsEnabled: (v: boolean) => void
  setCloudBand: (min: number, max: number) => void
  setTransectEnabled: (v: boolean) => void
  setTransectLat: (v: number) => void
  setWallsEnabled: (v: boolean) => void
  setSnowEnabled: (v: boolean) => void
  setRaysEnabled: (v: boolean) => void
  setScanEnabled: (v: boolean) => void
  setCinemaEnabled: (v: boolean) => void
  setSunElevation: (v: number) => void
  setVectorsEnabled: (v: boolean) => void
  setProbe: (p: OceanState["probe"]) => void
  setViewMode: (v: "globe" | "volume") => void
  setQuality: (q: "low" | "medium" | "high") => void
  setLensEnabled: (v: boolean) => void
  setLensShowArgo: (v: boolean) => void
  setLensShowGlider: (v: boolean) => void
  setLensMinErr: (v: number) => void
  setLensMode: (v: "error" | "obs" | "model") => void
  setLensChannel: (v: "temp" | "salt") => void
  setTheme: (t: "dark" | "light") => void
}

export const useOcean = create<OceanState>((set) => ({
  manifest: null,
  variableId: "temp_annual",
  depthIdx: 0,
  timeIdx: 0,
  playing: false,
  palette: "turbo",
  rangeMin: null,
  rangeMax: null,
  logScale: false,
  opacity: 1.0,
  vertExaggeration: 50,
  selectedPlatformId: null,
  hoverInfo: null,
  isoEnabled: false,
  isoValue: 20,
  scatterOpen: false,
  cameraFocus: null,
  cloudsEnabled: false,
  cloudBandMin: 28,
  cloudBandMax: 30,
  transectEnabled: false,
  transectLat: 10,
  wallsEnabled: true,
  snowEnabled: false,
  raysEnabled: false,
  scanEnabled: false,
  cinemaEnabled: false,
  sunElevation: 45,
  vectorsEnabled: false,
  showModel: true,
  showArgo: true,
  showGlider: true,
  showBgc: true,
  showTrajectory: true,
  vectorDensity: 1.0,
  vectorScale: 1.0,
  probe: null,
  viewMode: "volume",
  quality: "high",
  lensEnabled: false,
  lensShowArgo: true,
  lensShowGlider: true,
  lensMinErr: 0,
  lensMode: "error",
  lensChannel: "temp",
  theme: "dark",

  cameraResetTrigger: 0,

  setShowModel: (v) => set({ showModel: v }),
  setShowArgo: (v) => set({ showArgo: v }),
  setShowGlider: (v) => set({ showGlider: v }),
  setShowBgc: (v) => set({ showBgc: v }),
  setShowTrajectory: (v) => set({ showTrajectory: v }),
  setVectorDensity: (v) => set({ vectorDensity: v }),
  setVectorScale: (v) => set({ vectorScale: v }),

  setManifest: (m) =>
    set((s) => ({
      manifest: m,
      variableId: m.variables.some((v) => v.id === s.variableId)
        ? s.variableId
        : m.variables[0]?.id ?? "",
    })),
  setVariable: (id) =>
    set({ variableId: id, depthIdx: 0, timeIdx: 0, rangeMin: null, rangeMax: null }),
  setDepthIdx: (i) => set({ depthIdx: i }),
  setTimeIdx: (i) => set({ timeIdx: i }),
  setPlaying: (p) => set({ playing: p }),
  setPalette: (p) => set({ palette: p }),
  setRange: (min, max) => set({ rangeMin: min, rangeMax: max }),
  setLogScale: (v) => set({ logScale: v }),
  setOpacity: (v) => set({ opacity: v }),
  setVertExaggeration: (v) => set({ vertExaggeration: v }),
  selectPlatform: (id) => set((s) => ({
    selectedPlatformId: id,
    cameraFocus: id === null ? null : s.cameraFocus
  })),
  setHoverInfo: (h) => set({ hoverInfo: h }),
  setIsoEnabled: (v) => set({ isoEnabled: v }),
  setIsoValue: (v) => set({ isoValue: v }),
  setScatterOpen: (v) => set({ scatterOpen: v }),
  setCameraFocus: (p) => set({ cameraFocus: p }),
  setCloudsEnabled: (v) => set({ cloudsEnabled: v }),
  setCloudBand: (min, max) => set({ cloudBandMin: min, cloudBandMax: max }),
  setTransectEnabled: (v) => set({ transectEnabled: v }),
  setTransectLat: (v) => set({ transectLat: v }),
  setWallsEnabled: (v) => set({ wallsEnabled: v }),
  setSnowEnabled: (v) => set({ snowEnabled: v }),
  setRaysEnabled: (v) => set({ raysEnabled: v }),
  setScanEnabled: (v) => set({ scanEnabled: v }),
  setCinemaEnabled: (v) => set({ cinemaEnabled: v }),
  setSunElevation: (v) => set({ sunElevation: v }),
  setVectorsEnabled: (v) => set({ vectorsEnabled: v }),
  setProbe: (p) => set({ probe: p }),
  setViewMode: (v) => set({ viewMode: v }),
  setQuality: (q) => set({ quality: q }),
  setLensEnabled: (v) => set({ lensEnabled: v }),
  setLensShowArgo: (v) => set({ lensShowArgo: v }),
  setLensShowGlider: (v) => set({ lensShowGlider: v }),
  setLensMinErr: (v) => set({ lensMinErr: v }),
  setLensMode: (v) => set({ lensMode: v }),
  setLensChannel: (v) => set({ lensChannel: v }),
  setTheme: (t) => {
    set({ theme: t })
    if (typeof window !== "undefined") {
      document.documentElement.setAttribute("data-theme", t)
      localStorage.setItem("theme", t)
    }
  },

  triggerCameraReset: () => set((s) => ({ cameraResetTrigger: s.cameraResetTrigger + 1 })),
}))

/** Effective display range for the active variable. */
export function effectiveRange(
  meta: { globalMin: number; globalMax: number } | null | undefined,
  rangeMin: number | null,
  rangeMax: number | null
): [number, number] {
  if (!meta) return [0, 1]
  return [rangeMin ?? meta.globalMin, rangeMax ?? meta.globalMax]
}
