/**
 * src/components/page3/page3Config.ts
 * -----------------------------------
 * Configuration, data layer metadata, and observation types for Page 3.
 */

export interface ObservationCountItem {
  id: string
  label: string
  count: number
  color: string
  shape: "circle" | "square" | "triangle"
}

export interface DataLayerItem {
  id: "temperature" | "salinity" | "currents" | "chlorophyll"
  label: string
  icon: string
  unit: string
  defaultMin: number
  defaultMax: number
  description: string
  source: string
  product: string
}

export interface LegendItem {
  id: string
  label: string
  color: string
  shape: "circle" | "square" | "triangle"
}

export const OBSERVATION_COUNTS: ObservationCountItem[] = [
  { id: "argo", label: "Argo Floats", count: 22231, color: "#22c55e", shape: "circle" },
  { id: "glider", label: "Gliders", count: 2591, color: "#06b6d4", shape: "square" },
  { id: "ctd", label: "CTD Profiles", count: 619, color: "#f97316", shape: "triangle" },
  { id: "bgc", label: "BGC Measurements", count: 2257, color: "#a855f7", shape: "square" },
]

export const DATA_LAYERS: DataLayerItem[] = [
  {
    id: "temperature",
    label: "Temperature",
    icon: "🌡",
    unit: "°C",
    defaultMin: 10,
    defaultMax: 35,
    description: "Potential Temperature at selected depth.",
    source: "Copernicus Marine",
    product: "GLOBAL_ANALYSIS_PHY_001_024",
  },
  {
    id: "salinity",
    label: "Salinity",
    icon: "💧",
    unit: "PSU",
    defaultMin: 32,
    defaultMax: 37,
    description: "Practical Salinity across vertical depth strata.",
    source: "Copernicus Marine",
    product: "GLOBAL_ANALYSIS_PHY_001_024",
  },
  {
    id: "currents",
    label: "Currents",
    icon: "🧭",
    unit: "m/s",
    defaultMin: 0,
    defaultMax: 1.5,
    description: "Eastward & northward velocity magnitude (uo, vo).",
    source: "Copernicus Marine",
    product: "GLOBAL_ANALYSIS_PHY_001_024",
  },
  {
    id: "chlorophyll",
    label: "Chlorophyll",
    icon: "🌿",
    unit: "mg/m³",
    defaultMin: 0.01,
    defaultMax: 5.0,
    description: "Mass concentration of chlorophyll-a in sea water.",
    source: "Copernicus Marine",
    product: "GLOBAL_ANALYSIS_BGC_001_028",
  },
]

export const HOW_TO_USE_STEPS: string[] = [
  "1. Select a data layer",
  "2. Click & drag on globe to select region",
  "3. Explore 3D model and observations",
  "4. Click any instrument for details",
]

export const INSTRUMENT_LEGEND: LegendItem[] = [
  { id: "argo", label: "Argo Float", color: "#22c55e", shape: "circle" },
  { id: "glider", label: "Glider", color: "#06b6d4", shape: "square" },
  { id: "ctd", label: "CTD Profile", color: "#f97316", shape: "triangle" },
  { id: "bgc", label: "BGC Measurement", color: "#a855f7", shape: "square" },
]

export const TIME_CONFIG = {
  startDateStr: "01 Jan 2026",
  endDateStr: "31 Mar 2026",
  initialDateStr: "15 Feb 2026",
  totalSteps: 90,
  initialStepIndex: 45,
}

export const DEPTH_CONFIG = {
  min: 0,
  max: 2000,
  initial: 75,
  unit: "m",
}
