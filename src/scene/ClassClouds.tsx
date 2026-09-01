"use client"

/**
 * Value-band "class clouds" (upgrade E): every grid cell whose decoded value
 * falls inside the user's band renders as a glowing point — the warm pool
 * literally becomes a 3D cloud you can orbit through.
 */
import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import type { FieldMeta, Manifest } from "@/types"
import { getFieldData } from "@/lib/fieldCache"
import { useOcean } from "@/lib/store"
import { makeMapping, geoToSphere } from "./mapping"

export default function ClassClouds({ manifest }: { manifest: Manifest }) {
  const cloudsEnabled = useOcean((s) => s.cloudsEnabled)
  const bandMin = useOcean((s) => s.cloudBandMin)
  const bandMax = useOcean((s) => s.cloudBandMax)
  const vertExaggeration = useOcean((s) => s.vertExaggeration)
  const variableId = useOcean((s) => s.variableId)

  const meta = useMemo<FieldMeta | null>(
    () =>
      manifest.variables.find((v) => v.id === variableId && !v.times) ?? null,
    [manifest, variableId]
  )

  const [data, setData] = useState<{ id: string; bytes: Uint8Array } | null>(null)

  useEffect(() => {
    if (!cloudsEnabled || !meta) return
    let cancelled = false
    getFieldData(meta).then((bytes) => {
      if (!cancelled) setData({ id: meta.id, bytes })
    })
    return () => {
      cancelled = true
    }
  }, [cloudsEnabled, meta])

  const pointsGeo = useMemo(() => {
    if (!cloudsEnabled || !meta || !data || data.id !== meta.id) return null
    const { nLat, nLon } = meta.dims
    const fill = meta.encoding.fillByte
    const loQ = ((bandMin - meta.globalMin) * 254) / (meta.globalMax - meta.globalMin)
    const hiQ = ((bandMax - meta.globalMin) * 254) / (meta.globalMax - meta.globalMin)
    if (hiQ < loQ) return null

    const positions: number[] = []
    for (let k = 0; k < meta.dims.nDepth; k++) {
      const depth = meta.depthsM[k]
      const base = k * nLat * nLon
      for (let i = 0; i < nLat; i++) {
        const lat = manifest.grid.lats[i]
        for (let j = 0; j < nLon; j++) {
          const q = data.bytes[base + i * nLon + j]
          if (q === fill || q < loQ || q > hiQ) continue
          const lon = manifest.grid.lons[j]
          const p = geoToSphere(lon, lat, depth, vertExaggeration)
          positions.push(p.x, p.y, p.z)
        }
      }
    }
    if (!positions.length) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [cloudsEnabled, meta, data, manifest, bandMin, bandMax, vertExaggeration])

  useEffect(() => () => pointsGeo?.dispose(), [pointsGeo])

  if (!pointsGeo) return null

  return (
    <points geometry={pointsGeo}>
      <pointsMaterial
        color="#7dd3fc"
        size={0.35}
        sizeAttenuation
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </points>
  )
}
