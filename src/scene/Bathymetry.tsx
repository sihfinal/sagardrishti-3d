"use client"

/**
 * Data-driven 3D seafloor: for every grid column we take the deepest
 * non-land (non-fill) depth level in the temperature field — that is the
 * atlas' bottom of ocean for the 1° cell — and displace a mesh down to it.
 * Shaded sand→dark-blue by depth. Fully derived from our ingested data,
 * no external topo file.
 */
import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import type { Manifest } from "@/types"
import { getFieldData } from "@/lib/fieldCache"
import { useOcean } from "@/lib/store"
import { SPHERE_RADIUS, VERT_FACTOR } from "./mapping"

export default function Bathymetry({ manifest }: { manifest: Manifest }) {
  const vertExaggeration = useOcean((s) => s.vertExaggeration)
  const [floor, setFloor] = useState<{ id: string; depths: Float32Array } | null>(
    null
  )

  const meta = useMemo(
    () => manifest.variables.find((v) => v.id === "temp_annual") ?? null,
    [manifest]
  )

  useEffect(() => {
    if (!meta) return
    let cancelled = false
    getFieldData(meta).then((bytes) => {
      if (cancelled) return
      const { nLat, nLon, nDepth } = meta.dims
      const fill = meta.encoding.fillByte
      const depths = new Float32Array(nLat * nLon)
      for (let i = 0; i < nLat * nLon; i++) {
        let deepest = -1
        for (let k = nDepth - 1; k >= 0; k--) {
          if (bytes[k * nLat * nLon + i] !== fill) {
            deepest = k
            break
          }
        }
        depths[i] =
          deepest >= 0 ? (meta.depthsM[deepest] ?? meta.depthsM[0]) : NaN
      }
      setFloor({ id: meta.id, depths })
    })
    return () => {
      cancelled = true
    }
  }, [meta])

  const geometry = useMemo(() => {
    if (!meta || !floor || floor.id !== meta.id) return null
    const { lats, lons } = manifest.grid
    const nLat = lats.length
    const nLon = lons.length

    // clamp floor depth so exaggerated scene stays reasonable
    const maxFloorM = Math.min(1000, Math.max(...[...floor.depths].filter(Number.isFinite)))
    const depthOf = (m: number) => Math.min(m, maxFloorM)

    const geo = new THREE.SphereGeometry(
      SPHERE_RADIUS,
      nLon - 1,
      nLat - 1,
      (manifest.roi.lonMin + 180) * (Math.PI / 180),
      (manifest.roi.lonMax - manifest.roi.lonMin) * (Math.PI / 180),
      (90 - manifest.roi.latMax) * (Math.PI / 180),
      (manifest.roi.latMax - manifest.roi.latMin) * (Math.PI / 180)
    )
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)

    const shallow = new THREE.Color("#8a7a5a") // sandy shelf
    const deep = new THREE.Color("#101c2e") // abyssal dark blue

    for (let iy = 0; iy < nLat; iy++) {
      for (let ix = 0; ix < nLon; ix++) {
        const vi = iy * nLon + ix
        // SphereGeometry vertex order: row 0 is thetaStart (latMax)
        // our data rows start at latMin → flip
        const di = (nLat - 1 - iy) * nLon + ix
        const m = floor.depths[di]
        const isLand = !Number.isFinite(m)
        
        const x = pos.getX(vi)
        const y = pos.getY(vi)
        const z = pos.getZ(vi)
        const dir = new THREE.Vector3(x, y, z).normalize()
        const d = isLand ? maxFloorM : depthOf(m)
        const r = SPHERE_RADIUS - d * vertExaggeration * VERT_FACTOR
        pos.setXYZ(vi, dir.x * r, dir.y * r, dir.z * r)

        const t = isLand ? 1 : Math.min(1, m / maxFloorM)
        const c = shallow.clone().lerp(deep, t)
        colors[vi * 3] = c.r
        colors[vi * 3 + 1] = c.g
        colors[vi * 3 + 2] = c.b
      }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [meta, floor, manifest, vertExaggeration])

  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!geometry) return null

  return (
    <mesh geometry={geometry} rotation={[0, 0, 0]} position={[0, 0, 0]}>
      <meshStandardMaterial vertexColors roughness={0.88} metalness={0.06} side={THREE.DoubleSide} />
    </mesh>
  )
}
