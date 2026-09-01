"use client"

/**
 * Isosurface (marching tetrahedra) with seasonal morphing (M1): for the
 * full-depth monthly field, the surface rebuilds at a throttled rate from
 * blended time frames so the 20 °C sheet breathes through the seasons.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"

import type { FieldMeta, Manifest } from "@/types"
import { getFieldData } from "@/lib/fieldCache"
import { useOcean } from "@/lib/store"
import { buildDivergingLut, buildLut } from "@/lib/colormaps"


import { marchingTetrahedra } from "./marching"
import { geoToSphere } from "./mapping"

const REBUILD_STEPS = 4 // isosurface re-mesh steps per month while playing

/** Module-level geometry swap keeps React Compiler mutation tracking happy. */
function swapGeometry(mesh: THREE.Mesh, geo: THREE.BufferGeometry | null): THREE.BufferGeometry | null {
  if (!geo) return null
  const old = mesh.geometry as THREE.BufferGeometry
  mesh.geometry = geo
  return old && old !== geo ? old : null
}

export default function Isosurface({ manifest }: { manifest: Manifest }) {
  const isoEnabled = useOcean((s) => s.isoEnabled)
  const variableId = useOcean((s) => s.variableId)
  const isoValue = useOcean((s) => s.isoValue)
  const vertExaggeration = useOcean((s) => s.vertExaggeration)
  const palette = useOcean((s) => s.palette)
  const rangeMin = useOcean((s) => s.rangeMin)
  const rangeMax = useOcean((s) => s.rangeMax)

  // any depth-resolved field qualifies (annual + monthly volume)
  const meta = useMemo<FieldMeta | null>(
    () =>
      manifest.variables.find(
        (v) => v.id === variableId && v.dims.nDepth > 1
      ) ?? null,
    [manifest, variableId]
  )

  const [data, setData] = useState<{
    id: string
    arr: Float32Array
    valid: Uint8Array
    bytes: Uint8Array
  } | null>(null)

  useEffect(() => {
    if (!isoEnabled || !meta) return
    let cancelled = false
    getFieldData(meta).then((bytes) => {
      if (cancelled) return
      setData({ id: meta.id, arr: new Float32Array(0), valid: new Uint8Array(0), bytes })
    })
    return () => {
      cancelled = true
    }
  }, [isoEnabled, meta])

  const meshRef = useRef<THREE.Mesh>(null)
  const geoRef = useRef<THREE.BufferGeometry | null>(null)
  const lastStepRef = useRef<string>("")
  const scratchRef = useRef<Uint8Array | null>(null)

  /** decode + march the current blended frame into a geometry */
  const buildGeometry = (
    m: FieldMeta,
    bytes: Uint8Array,
    frameOffset: number
  ): THREE.BufferGeometry | null => {
    const { nLat, nLon, nDepth } = m.dims
    const fill = m.encoding.fillByte
    const n = nLat * nLon * nDepth
    const arr = new Float32Array(n)
    const valid = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      const b = bytes[frameOffset + i]
      if (b === fill) continue
      arr[i] =
        m.encoding.offset + (b / 254) * (m.globalMax - m.globalMin)
      valid[i] = 1
    }
    const { lats, lons } = manifest.grid
    const latMin = lats[0]
    const lonMin = lons[0]
    const positions = marchingTetrahedra(
      arr,
      valid,
      nLon,
      nLat,
      nDepth,
      (ix, iy, iz) => {
        const lon = lonMin + ix
        const lat = latMin + iy
        const d = m.depthsM[Math.min(iz, m.depthsM.length - 1)] ?? 0
        const p = geoToSphere(lon, lat, d, vertExaggeration)
        return [p.x, p.y, p.z]
      },
      isoValue
    )
    if (!positions.length) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geo.computeVertexNormals()
    return geo
  }

  const timeIdx = useOcean((s) => s.timeIdx)

  const frameGeo = useMemo(() => {
    if (!meta || !data || data.id !== meta.id) return null
    const nTime = meta.times?.length ?? 1
    const fb = meta.dims.nDepth * meta.dims.nLat * meta.dims.nLon
    const frameOffset = nTime > 1 ? (timeIdx % nTime) * fb : 0
    return buildGeometry(meta, data.bytes, frameOffset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, data, vertExaggeration, isoValue, timeIdx])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    if (frameGeo) {
      const old = geoRef.current
      mesh.geometry = frameGeo
      geoRef.current = frameGeo
      if (old && old !== frameGeo) old.dispose()
    }
  }, [frameGeo])

  // color the surface with the palette value at the iso level
  const color = useMemo(() => {
    const min = rangeMin ?? meta?.globalMin ?? 0
    const max = rangeMax ?? meta?.globalMax ?? 1
    const t = Math.min(1, Math.max(0, ((isoValue - min) / (max - min)) | 0))
    const lut =
      palette === "diverging" ? buildDivergingLut() : buildLut(palette)
    const idx = Math.round(t * 255) * 3
    return new THREE.Color(lut[idx] / 255, lut[idx + 1] / 255, lut[idx + 2] / 255)
  }, [palette, isoValue, rangeMin, rangeMax, meta])

  useEffect(() => () => geoRef.current?.dispose(), [])

  if (!isoEnabled || !meta || !frameGeo) return null

  return (
    <mesh ref={meshRef}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.85}
        side={THREE.DoubleSide}
        roughness={0.6}
        metalness={0.1}
      />
    </mesh>
  )
}
