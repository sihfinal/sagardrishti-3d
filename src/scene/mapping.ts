"use client"

import { useMemo } from "react"
import * as THREE from "three"
import type { Grid, Roi } from "@/types"

/** Shared geo <-> scene mapping. lon -> x, lat -> z, depth -> -y. */
export const HORIZ_SCALE = 1.5 // world units per degree
export const VERT_FACTOR = 0.00025 // world units per metre per exaggeration-x
export const SPHERE_RADIUS = 30.0

export function geoToSphere(lon: number, lat: number, depthM: number, exag: number): THREE.Vector3 {
  const r = SPHERE_RADIUS - depthM * exag * VERT_FACTOR
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  )
}

export function sphereToGeo(p: THREE.Vector3): { lon: number; lat: number } {
  const r = p.length() || SPHERE_RADIUS
  const phi = Math.acos(Math.max(-1, Math.min(1, p.y / r)))
  const lat = 90 - (phi * 180) / Math.PI
  const theta = Math.atan2(p.z, -p.x)
  let lon = (theta * 180) / Math.PI - 180
  while (lon < -180) lon += 360
  while (lon > 180) lon -= 360
  return { lon, lat }
}

export function makeMapping(roi: Roi) {
  const centerLon = (roi.lonMin + roi.lonMax) / 2
  const centerLat = (roi.latMin + roi.latMax) / 2
  return {
    centerLon,
    centerLat,
    width: (roi.lonMax - roi.lonMin) * HORIZ_SCALE,
    depth: (roi.latMax - roi.latMin) * HORIZ_SCALE,
    lonToX: (lon: number) => (lon - centerLon) * HORIZ_SCALE,
    latToZ: (lat: number) => -(lat - centerLat) * HORIZ_SCALE,
    xToLon: (x: number) => x / HORIZ_SCALE + centerLon,
    zToLat: (z: number) => -z / HORIZ_SCALE + centerLat,
    depthToY: (m: number, exag: number) => -m * exag * VERT_FACTOR,
  }
}

export type Mapping = ReturnType<typeof makeMapping>

export function useMapping(roi: Roi | undefined | null): Mapping | null {
  return useMemo(() => (roi ? makeMapping(roi) : null), [roi])
}

/**
 * Sample the quantized field at an arbitrary (lon, lat, depthIdx).
 * data layout is depth-major: [depth][lat][lon], row 0 = latMin.
 */
export function sampleField(
  data: Uint8Array,
  grid: Grid,
  depthsM: number[],
  lon: number,
  lat: number,
  depthM: number
): number | null {
  const { lats, lons } = grid
  const fi = Math.min(lats.length - 2, Math.max(0,
    Math.floor((lat - lats[0]) / (lats[lats.length - 1] - lats[0]) * (lats.length - 1))))
  const fj = Math.min(lons.length - 2, Math.max(0,
    Math.floor((lon - lons[0]) / (lons[lons.length - 1] - lons[0]) * (lons.length - 1))))

  // nearest depth index
  let di = 0
  let best = Infinity
  for (let k = 0; k < depthsM.length; k++) {
    const d = Math.abs(depthsM[k] - depthM)
    if (d < best) {
      best = d
      di = k
    }
  }

  const nLat = lats.length
  const nLon = lons.length

  // bilinear in lat/lon at fixed depth
  const lat1 = lats[fi]
  const lat2 = lats[fi + 1]
  const lon1 = lons[fj]
  const lon2 = lons[fj + 1]
  const ty = (lat - lat1) / (lat2 - lat1 || 1)
  const tx = (lon - lon1) / (lon2 - lon1 || 1)
  const base = di * nLat * nLon
  const at = (i: number, j: number) => data[base + i * nLon + j]

  const corners = [
    [at(fi, fj), (1 - ty) * (1 - tx)],
    [at(fi, fj + 1), (1 - ty) * tx],
    [at(fi + 1, fj), ty * (1 - tx)],
    [at(fi + 1, fj + 1), ty * tx],
  ] as const

  let q = 0
  for (const [v, w] of corners) q += v * w
  if (q >= 254.5) return null // fill
  return q
}
