"use client"

/**
 * Transect / zonal cross-section (upgrade F): a vertical curtain at the
 * chosen latitude, resampled from the active field's (depth × lon) row.
 * Uses the exact same colormap shader family as the depth slices.
 */
import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import type { FieldMeta, Manifest } from "@/types"
import { getFieldData } from "@/lib/fieldCache"
import { useOcean } from "@/lib/store"
import { buildLut } from "@/lib/colormaps"
import { makeLutTexture, SLICE_VERTEX, SLICE_FRAGMENT } from "./ColormapShader"
import { makeMapping, geoToSphere } from "./mapping"

export default function Transect({ manifest }: { manifest: Manifest }) {
  const transectEnabled = useOcean((s) => s.transectEnabled)
  const transectLat = useOcean((s) => s.transectLat)
  const vertExaggeration = useOcean((s) => s.vertExaggeration)
  const variableId = useOcean((s) => s.variableId)
  const palette = useOcean((s) => s.palette)
  const rangeMin = useOcean((s) => s.rangeMin)
  const rangeMax = useOcean((s) => s.rangeMax)

  const meta = useMemo<FieldMeta | null>(
    () =>
      manifest.variables.find((v) => v.id === variableId && !v.times) ?? null,
    [manifest, variableId]
  )

  const [data, setData] = useState<{ id: string; bytes: Uint8Array } | null>(null)

  useEffect(() => {
    if (!transectEnabled || !meta) return
    let cancelled = false
    getFieldData(meta).then((bytes) => {
      if (!cancelled) setData({ id: meta.id, bytes })
    })
    return () => {
      cancelled = true
    }
  }, [transectEnabled, meta])

  // nearest grid row to the chosen latitude
  const latIdx = useMemo(() => {
    if (!meta) return -1
    const lats = manifest.grid.lats
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < lats.length; i++) {
      const d = Math.abs(lats[i] - transectLat)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }, [manifest, transectLat, meta])

  const { texture } = useMemo(() => {
    if (!meta || !data || data.id !== meta.id || latIdx < 0)
      return { texture: null as THREE.DataTexture | null }
    const { nLon, nLat } = meta.dims
    const arr = new Uint8Array(meta.dims.nDepth * nLon)
    for (let k = 0; k < meta.dims.nDepth; k++) {
      const rowBase = k * nLat * nLon + latIdx * nLon
      arr.set(data.bytes.subarray(rowBase, rowBase + nLon), k * nLon)
    }
    const tex = new THREE.DataTexture(arr, nLon, meta.dims.nDepth, THREE.RedFormat)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.flipY = true // row 0 (surface) lands at v=1 → top of the curtain
    tex.needsUpdate = true
    return { texture: tex }
  }, [meta, data, latIdx])

  const lutTex = useMemo(() => makeLutTexture(buildLut(palette === "diverging" ? "turbo" : palette)), [palette])

  const material = useMemo(() => {
    if (!texture || !meta) return null
    return new THREE.ShaderMaterial({
      vertexShader: SLICE_VERTEX,
      fragmentShader: SLICE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uData: { value: texture },
        uLut: { value: lutTex },
        uMin: { value: rangeMin ?? meta.globalMin },
        uMax: { value: rangeMax ?? meta.globalMax },
        uLog: { value: 0 },
        uOpacity: { value: 0.96 },
        uFill: { value: meta.encoding.fillByte / 255 },
      },
    })
  }, [texture, lutTex, meta, rangeMin, rangeMax])

  useEffect(
    () => () => {
      texture?.dispose()
      material?.dispose()
    },
    [texture, material]
  )

  const geometry = useMemo(() => {
    if (!meta) return null
    const { nLon, nDepth } = meta.dims
    const maxM = meta.depthsM[meta.depthsM.length - 1] || 1
    const roi = manifest.roi
    const geo = new THREE.PlaneGeometry(1, 1, nLon - 1, nDepth - 1)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let id = 0; id < nDepth; id++) {
      const idPct = nDepth > 1 ? id / (nDepth - 1) : 0
      const depth = idPct * maxM
      for (let ic = 0; ic < nLon; ic++) {
        const vi = id * nLon + ic
        const icPct = nLon > 1 ? ic / (nLon - 1) : 0
        const lon = roi.lonMin + icPct * (roi.lonMax - roi.lonMin)
        const p = geoToSphere(lon, transectLat, depth, vertExaggeration)
        pos.setXYZ(vi, p.x, p.y, p.z)
      }
    }
    geo.computeVertexNormals()
    return geo
  }, [manifest, meta, transectLat, vertExaggeration])

  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!transectEnabled || !meta || !material) return null

  return (
    <mesh geometry={geometry || undefined} position={[0, 0, 0]} rotation={[0, 0, 0]} material={material}>
    </mesh>
  )
}
