export interface Roi {  latMin: number
  latMax: number
  lonMin: number
  lonMax: number
}

export interface Grid {
  nLat: number
  nLon: number
  lats: number[]
  lons: number[]
}

export interface FieldEncoding {
  dtype: "uint8"
  scale: number
  offset: number
  fillByte: number
}

export interface FieldMeta {
  id: string
  name: string
  unit: string
  source: string
  depthsM: number[]
  globalMin: number
  globalMax: number
  encoding: FieldEncoding
  file: string
  provenance: { url: string; citation: string }
  dims: { nDepth: number; nLat: number; nLon: number; nTime?: number }
  times?: string[]
}

export interface CurrentsMetaLike {
  file: string
  depthsM: number[]
  nLat: number
  nLon: number
  [k: string]: unknown
}

export interface Manifest {
  roi: Roi
  grid: Grid
  variables: FieldMeta[]
  profiles: {
    file: string
    count: number
    platformsByType: Record<string, number>
  }
  currents?: CurrentsMetaLike
  generatedUtc: string
}

export interface ProfilePoint {
  depthM: number
  tempC: number | null
  salPsu: number | null
  chla?: number | null
}

export interface InstrumentCycle {
  time: string
  lon: number
  lat: number
  profile: ProfilePoint[]
}

export type PlatformType = "argo" | "glider" | "bgc"

export interface InstrumentPlatform {
  id: string
  type: PlatformType
  lon: number
  lat: number
  lastSeen: string
  cycles: InstrumentCycle[]
}
