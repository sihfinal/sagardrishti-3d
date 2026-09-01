import type { FieldMeta, InstrumentPlatform, Manifest } from "@/types"
import { getFieldData } from "./fieldCache"
import { sampleField } from "@/scene/mapping"

/**
 * Model-observation validation (Assimilation Lens).
 * For every observation point: nearest grid cell + depth, decode model
 * value, error = obs - model. Lazily computed per platform and cached.
 */
export interface MatchedPoint {
  time: string
  lon: number
  lat: number
  depthM: number
  obs: number
  model: number
  err: number
}

export interface PlatformValidation {
  id: string
  type: string
  channel: "tempC" | "salPsu"
  points: MatchedPoint[]
  bias: number
  rmse: number
  mae: number
  maxAbsErr: number
  n: number
}

const cache = new Map<string, Promise<PlatformValidation | null>>()

function metaFor(
  manifest: Manifest,
  channel: "tempC" | "salPsu"
): FieldMeta | undefined {
  return manifest.variables.find(
    (v) => v.id === (channel === "salPsu" ? "salt_annual" : "temp_annual")
  )
}

export function validatePlatform(
  p: InstrumentPlatform,
  manifest: Manifest,
  channel: "tempC" | "salPsu" = "tempC"
): Promise<PlatformValidation | null> {
  const key = `${p.id}|${channel}`
  let hit = cache.get(key)
  if (hit) return hit
  hit = (async () => {
    const meta = metaFor(manifest, channel)
    if (!meta) return null
    const bytes = await getFieldData(meta)
    const pts: MatchedPoint[] = []
    for (const cycle of p.cycles) {
      for (const pt of cycle.profile) {
        const obs = pt[channel]
        if (obs === null || obs === undefined) continue
        const q = sampleField(bytes, manifest.grid, meta.depthsM, cycle.lon, cycle.lat, pt.depthM)
        if (q === null) continue
        const model =
          meta.encoding.offset +
          (q / 254) * (meta.globalMax - meta.globalMin)
        pts.push({
          time: cycle.time,
          lon: cycle.lon,
          lat: cycle.lat,
          depthM: pt.depthM,
          obs,
          model,
          err: obs - model,
        })
      }
    }
    if (!pts.length) return null
    let sum = 0
    let sumAbs = 0
    let sumSq = 0
    let maxAbs = 0
    for (const pt of pts) {
      sum += pt.err
      sumAbs += Math.abs(pt.err)
      sumSq += pt.err * pt.err
      maxAbs = Math.max(maxAbs, Math.abs(pt.err))
    }
    return {
      id: p.id,
      type: p.type,
      channel,
      points: pts.sort((a, b) => a.time.localeCompare(b.time)),
      bias: sum / pts.length,
      rmse: Math.sqrt(sumSq / pts.length),
      mae: sumAbs / pts.length,
      maxAbsErr: maxAbs,
      n: pts.length,
    }
  })()
  cache.set(key, hit)
  return hit
}

/** Diverging error color: blue = model colder/low, white = agree, red = warm/high. */
export function errColor(err: number, scale = 1.5): [number, number, number] {
  const t = Math.max(-1, Math.min(1, err / scale))
  // blue(-1) → slate-white(0) → red(+1)
  const r = t < 0 ? 0.35 + (1 - Math.abs(t)) * 0.55 : 0.9
  const g = 0.9 - Math.abs(t) * 0.55
  const b = t < 0 ? 0.95 : 0.9 - t * 0.55
  return [r, g, b]
}
