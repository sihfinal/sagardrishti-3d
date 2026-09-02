"use client"

export interface ModelFieldResponse {
  variable: string
  time: string
  depth: number
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
  width: number
  height: number
  latitudes: number[]
  longitudes: number[]
  values: (number | null)[][]
  min_value: number | null
  max_value: number | null
  unit: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1"

// In-memory LRU cache to prevent redundant requests
const fieldCache = new Map<string, ModelFieldResponse>()
const MAX_CACHE_SIZE = 40

export async function fetchModelField(params: {
  variable: string
  time?: string
  depth?: number
  lat_min?: number
  lat_max?: number
  lon_min?: number
  lon_max?: number
  stride?: number
}): Promise<ModelFieldResponse> {
  const variable = params.variable || "temperature"
  const time = params.time || "2026-02-15"
  const depth = params.depth !== undefined ? params.depth : 75.0
  const stride = params.stride || 4
  const lat_min = params.lat_min ?? -35.0
  const lat_max = params.lat_max ?? 30.0
  const lon_min = params.lon_min ?? 40.0
  const lon_max = params.lon_max ?? 100.0

  const cacheKey = `${variable}_${time}_${depth}_${stride}_${lat_min}_${lat_max}_${lon_min}_${lon_max}`
  if (fieldCache.has(cacheKey)) {
    return fieldCache.get(cacheKey)!
  }

  const query = new URLSearchParams({
    variable,
    time,
    depth: depth.toString(),
    stride: stride.toString(),
    lat_min: lat_min.toString(),
    lat_max: lat_max.toString(),
    lon_min: lon_min.toString(),
    lon_max: lon_max.toString(),
  })

  const res = await fetch(`${API_BASE}/model/field?${query.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch model field (${variable}): HTTP ${res.status}`)
  }

  const data: ModelFieldResponse = await res.json()

  // Evict oldest if full
  if (fieldCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = fieldCache.keys().next().value
    if (oldestKey) fieldCache.delete(oldestKey)
  }
  fieldCache.set(cacheKey, data)

  return data
}
