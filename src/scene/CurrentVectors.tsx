"use client"

/**
 * Ocean current vectors (upgrade L) — REAL HYCOM u/v fields.
 * Instanced cones laid on the selected depth slice; orientation from
 * (u,v), size from speed. Data ingested at build time; runtime offline.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import type { Manifest } from "@/types"
import { useOcean } from "@/lib/store"
import { makeMapping, geoToSphere } from "./mapping"

interface CurrentsMeta {
  file: string
  depthsM: number[]
  nLat: number
  nLon: number
  lats: number[]
  lons: number[]
  scaleCms: number
  nanByte: number
}

function asCurrentsMeta(c: unknown): CurrentsMeta | undefined {
  if (!c || typeof c !== "object") return undefined
  const m = c as Record<string, unknown>
  if (typeof m.nLat !== "number" || typeof m.scaleCms !== "number")
    return undefined
  return m as unknown as CurrentsMeta
}

export default function CurrentVectors({ manifest }: { manifest: Manifest }) {
  const vectorsEnabled = useOcean((s) => s.vectorsEnabled)
  const depthIdxSel = useOcean((s) => s.depthIdx)
  const vertExaggeration = useOcean((s) => s.vertExaggeration)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const [data, setData] = useState<{ meta: CurrentsMeta; buf: Int8Array } | null>(null)

  const cmeta = asCurrentsMeta(manifest.currents)

  useEffect(() => {
    if (!vectorsEnabled || !cmeta || data) return
    let cancelled = false
    fetch(`/data/currents.bin`)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (!cancelled) setData({ meta: cmeta, buf: new Int8Array(buf) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [vectorsEnabled, cmeta, data])

  // nearest available depth level to the user-selected slice
  const levelIdx = useMemo(() => {
    if (!cmeta) return 0
    const selDepth =
      manifest.variables.find((v) => v.id === "temp_annual")?.depthsM[
        Math.min(depthIdxSel, 24)
      ] ?? 0
    let best = 0
    let bestD = Infinity
    cmeta.depthsM.forEach((d, i) => {
      const dd = Math.abs(d - selDepth)
      if (dd < bestD) {
        bestD = dd
        best = i
      }
    })
    return best
  }, [cmeta, depthIdxSel, manifest])

  const count = cmeta ? cmeta.nLat * cmeta.nLon : 0

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !data || !cmeta || !count) return
    const dummy = new THREE.Object3D()
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion()
    const dir = new THREE.Vector3()

    const { buf, meta } = data
    const { nLat, nLon, lats, lons, scaleCms, nanByte, depthsM } = meta

    let n = 0
    for (let i = 0; i < nLat; i++) {
      for (let j = 0; j < nLon; j++) {
        const idx = (levelIdx * 2 * nLat + i) * nLon + j
        const qu = buf[idx]
        const qv = buf[(levelIdx * 2 + 1) * nLat * nLon + i * nLon + j]
        if (qu === nanByte || qv === nanByte) continue
        const u = (qu / 127) * scaleCms
        const v = (qv / 127) * scaleCms
        const speed = Math.hypot(u, v)
        if (speed < 1) continue
        const lon = lons[Math.min(j, lons.length - 1)]
        const lat = lats[Math.min(i, lats.length - 1)]
        
        const pos = geoToSphere(lon, lat, depthsM[levelIdx] ?? 0, vertExaggeration)
        dummy.position.copy(pos)
        
        const phi = (90 - lat) * (Math.PI / 180)
        const theta = (lon + 180) * (Math.PI / 180)
        
        const tEast = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta))
        const tNorth = new THREE.Vector3(Math.cos(phi) * Math.cos(theta), Math.sin(phi), -Math.cos(phi) * Math.sin(theta))
        
        dir.copy(tEast).multiplyScalar(u).addScaledVector(tNorth, v).normalize()
        q.setFromUnitVectors(up, dir)
        dummy.quaternion.copy(q)
        
        const s = Math.min(2.2, 0.25 + speed / scaleCms * 2.6)
        dummy.scale.set(s * 0.45, s, s * 0.45)
        dummy.updateMatrix()
        mesh.setMatrixAt(n++, dummy.matrix)
      }
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
  }, [data, cmeta, count, levelIdx, vertExaggeration, manifest])

  if (!vectorsEnabled || !cmeta) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(1, count)]}>
      <coneGeometry args={[0.16, 0.9, 6]} />
      <meshBasicMaterial color="#a7f3d0" />
    </instancedMesh>
  )
}
