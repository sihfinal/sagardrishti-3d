"use client"

/**
 * Observation Error Layer — the Assimilation Lens (from the recommendation
 * spec). Renders each Argo/Glider profile as a vertical evidence strip
 * colored point-by-point by model-observation error (diverging blue-white-
 * red), plus surface corridors connecting glider/float cycle positions.
 *
 * Progressive reveal: segments are ordered by observation time, so the
 * shared simulation clock can reveal them with a single drawRange update.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import type { InstrumentPlatform, Manifest } from "@/types"
import { fetchProfiles } from "@/lib/api"
import { useOcean } from "@/lib/store"
import { simClock } from "@/lib/simClock"
import { validatePlatform, errColor } from "@/lib/validation"
import { buildDivergingLut, buildLut } from "@/lib/colormaps"
import { makeMapping, SPHERE_RADIUS, geoToSphere } from "./mapping"

export default function ObservationErrorLayer({
  manifest,
}: {
  manifest: Manifest
}) {
  const lensEnabled = useOcean((s) => s.lensEnabled)
  const showArgo = useOcean((s) => s.lensShowArgo)
  const showGlider = useOcean((s) => s.lensShowGlider)
  const minErr = useOcean((s) => s.lensMinErr)
  const vertExaggeration = useOcean((s) => s.vertExaggeration)
  const groupRef = useRef<THREE.Group>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const corridorRef = useRef<THREE.LineSegments>(null)
  const haloRef = useRef<THREE.Points>(null)
  const gliderRef = useRef<THREE.Mesh>(null)
  // glider track: sorted surface positions with epoch times
  const trackRef = useRef<{ t: number; pos: [number, number, number] }[]>([])
  const rangeRef = useRef<{ min: number; max: number }>({ min: 0, max: 1 })
  const [platforms, setPlatforms] = useState<InstrumentPlatform[] | null>(null)


  useEffect(() => {
    if (!lensEnabled || platforms) return
    let cancelled = false
    fetchProfiles()
      .then((r) => !cancelled && setPlatforms(r.platforms.filter((p) => p.type !== "bgc")))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [lensEnabled, platforms])

  const map = useMemo(() => makeMapping(manifest.roi), [manifest])

  // build merged evidence geometry once per exaggeration change
  useEffect(() => {
    const group = groupRef.current
    if (!group || !lensEnabled || !platforms) return

    const segPos: number[] = []
    const segObs: number[] = []
    const segModel: number[] = []
    const segTime: number[] = []
    const corrPos: number[] = []
    const haloPos: number[] = []
    const haloCol: number[] = []
    const haloSize: number[] = []
    const haloTime: number[] = []

    let built = 0
    const wanted = platforms.filter(
      (p) => (p.type === "argo" ? showArgo : p.type === "glider" ? showGlider : true)
    )
    for (const p of wanted.slice(0, 120)) {
      // surface corridor linking consecutive cycle positions (per-type filter)
      if ((p.type === "argo" ? showArgo : showGlider)) {
        const cyc = p.cycles
        for (let i = 0; i < cyc.length - 1; i++) {
          const pA = geoToSphere(cyc[i].lon, cyc[i].lat, 0, 0).multiplyScalar(1.002)
          const pB = geoToSphere(cyc[i + 1].lon, cyc[i + 1].lat, 0, 0).multiplyScalar(1.002)
          corrPos.push(
            pA.x, pA.y, pA.z,
            pB.x, pB.y, pB.z
          )
        }
      }
      if (p.type === "glider") {
        trackRef.current = p.cycles
          .map((c) => {
            const pVec = geoToSphere(c.lon, c.lat, 0, 0).multiplyScalar(1.002)
            return {
              t: Date.parse(c.time) || 0,
              pos: [pVec.x, pVec.y, pVec.z] as [number, number, number],
            }
          })
          .sort((a, b) => a.t - b.t)
      }
      void validatePlatform(p, manifest, "tempC")
        ?.then((v) => {
          if (!v) return
          const lon = v.points[0].lon
          const lat = v.points[0].lat
          // vertical evidence polyline through this cycle's points
          const pts = [...v.points].filter((pt) => Math.abs(pt.err) >= minErr).sort((a, b) => a.depthM - b.depthM)
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i]
            const b = pts[i + 1]
            const pA = geoToSphere(lon, lat, a.depthM, vertExaggeration)
            const pB = geoToSphere(lon, lat, b.depthM, vertExaggeration)
            const t = Date.parse(a.time) || 0
            segTime.push(t, t)
            segObs.push(a.obs, b.obs)
            segModel.push(a.model, b.model)
            segPos.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z)
          }
          // error halo at the profile's worst-error depth
          if (pts.length) {
            const worst = pts.reduce((m, pt) => (Math.abs(pt.err) > Math.abs(m.err) ? pt : m), pts[0])
            const pHalo = geoToSphere(lon, lat, worst.depthM, vertExaggeration)
            haloPos.push(pHalo.x, pHalo.y, pHalo.z)
            const hc = errColor(worst.err)
            haloCol.push(...hc)
            haloSize.push(4 + Math.abs(worst.err) * 5)
            haloTime.push(Date.parse(worst.time) || 0)
          }
          built++
        })
        .catch(() => {})
    }

    // NOTE: async validation fills arrays over several ticks; build the
    // buffers once all promises settle via polling on `built`
    const check = setInterval(() => {
      if (!linesRef.current || built < Math.min(platforms.length, 120)) return
      clearInterval(check)

      const g = new THREE.BufferGeometry()
      g.setAttribute("position", new THREE.Float32BufferAttribute(segPos, 3))
      g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(segPos.length), 3))
      // order segments by time so drawRange can reveal progressively
      const order = segTime.map((t, i) => ({ t, i }))
        .sort((a, b) => a.t - b.t)
      const P = g.attributes.position.array as Float32Array
      const C = g.attributes.color.array as Float32Array
      const p2 = new Float32Array(P.length)
      const c2 = new Float32Array(C.length)
      order.forEach((o, out) => {
        const s = o.i * 3
        p2[out * 3] = P[s]
        p2[out * 3 + 1] = P[s + 1]
        p2[out * 3 + 2] = P[s + 2]
        c2[out * 3] = C[s]
        c2[out * 3 + 1] = C[s + 1]
        c2[out * 3 + 2] = C[s + 2]
      })
      g.setAttribute("position", new THREE.BufferAttribute(p2, 3))
      g.setAttribute("color", new THREE.BufferAttribute(c2, 3))
      const times = order.map((o) => o.t).filter((t) => t > 0)
      rangeRef.current = {
        min: times.length ? times[0] : 0,
        max: times.length ? times[times.length - 1] : 1,
      }
      // color by the current display mode (error / obs / model)
      const s = useOcean.getState()
      const meta =
        manifest.variables.find(
          (v) =>
            v.id === (s.lensChannel === "salt" ? "salt_annual" : "temp_annual")
        ) ?? null
      const lut =
        s.palette === "diverging" ? buildDivergingLut() : buildLut(s.palette)
      for (let i = 0; i < order.length; i++) {
        const src = order[i].i
        let col: number[]
        if (s.lensMode === "error") {
          col = errColor(segModel[src] ? segObs[src] - segModel[src] : 0)
        } else {
          const val = s.lensMode === "obs" ? segObs[src] : segModel[src]
          if (meta) {
            const idx = Math.round(
              Math.min(
                1,
                Math.max(0, (val - meta.globalMin) / (meta.globalMax - meta.globalMin))
              ) * 255
            )
            col = [lut[idx * 3] / 255, lut[idx * 3 + 1] / 255, lut[idx * 3 + 2] / 255]
          } else col = [0.7, 0.7, 0.7]
        }
        c2[i * 3] = col[0]
        c2[i * 3 + 1] = col[1]
        c2[i * 3 + 2] = col[2]
      }
      g.setDrawRange(0, p2.length / 3)
      ;(linesRef.current.geometry as THREE.BufferGeometry).dispose()
      linesRef.current.geometry = g

      // error halos (sorted by time → drawRange reveal too)
      if (haloRef.current) {
        const hg = new THREE.BufferGeometry()
        const hOrder = haloTime.map((t, i) => ({ t, i })).sort((a, b) => a.t - b.t)
        const hp = new Float32Array(haloPos.length)
        const hc = new Float32Array(haloCol.length)
        const hs = new Float32Array(haloSize.length)
        hOrder.forEach((o, out) => {
          hp[out * 3] = haloPos[o.i * 3]
          hp[out * 3 + 1] = haloPos[o.i * 3 + 1]
          hp[out * 3 + 2] = haloPos[o.i * 3 + 2]
          hc[out * 3] = haloCol[o.i * 3]
          hc[out * 3 + 1] = haloCol[o.i * 3 + 1]
          hc[out * 3 + 2] = haloCol[o.i * 3 + 2]
          hs[out] = haloSize[o.i]
        })
        hg.setAttribute("position", new THREE.BufferAttribute(hp, 3))
        hg.setAttribute("color", new THREE.BufferAttribute(hc, 3))
        hg.setAttribute("size", new THREE.BufferAttribute(hs, 1))
        hg.setDrawRange(0, hp.length / 3)
        ;(haloRef.current.geometry as THREE.BufferGeometry).dispose()
        haloRef.current.geometry = hg
      }

      // corridors
      if (corridorRef.current) {
        const cg = new THREE.BufferGeometry()
        cg.setAttribute("position", new THREE.Float32BufferAttribute(corrPos, 3))
        ;(corridorRef.current.geometry as THREE.BufferGeometry).dispose()
        corridorRef.current.geometry = cg
      }
    }, 100)

    return () => {
      clearInterval(check)
      group.remove(linesRef.current!)
      group.remove(corridorRef.current!)
      group.remove(haloRef.current!)
    }
  }, [platforms, showArgo, showGlider, minErr, vertExaggeration])

  // progressive reveal driven by the shared simulation clock
  useFrameReveal(linesRef, rangeRef)
  useFrameRevealPoints(haloRef)

  // moving glider marker along its real timestamped track
  useFrame(() => {
    const mesh = gliderRef.current
    const track = trackRef.current
    if (!mesh || !track.length || !lensEnabled) return
    const target = simClock.t * (rangeRef.current.max - rangeRef.current.min) + rangeRef.current.min
    let i = 0
    while (i < track.length - 1 && track[i + 1].t < target) i++
    const a = track[i]
    const b = track[Math.min(i + 1, track.length - 1)]
    const f = b.t > a.t ? (target - a.t) / (b.t - a.t) : 0
    const posA = new THREE.Vector3().fromArray(a.pos)
    const posB = new THREE.Vector3().fromArray(b.pos)
    const posCurrent = new THREE.Vector3().lerpVectors(posA, posB, f).normalize().multiplyScalar(SPHERE_RADIUS + 0.1)
    mesh.position.copy(posCurrent)
    mesh.visible = true
  })

  if (!lensEnabled) return null

  return (
    <group ref={groupRef}>
      <lineSegments ref={linesRef}>
        <lineBasicMaterial vertexColors transparent opacity={0.95} />
      </lineSegments>
      <lineSegments ref={corridorRef}>
        <lineBasicMaterial color="#7d8ea8" transparent opacity={0.5} />
      </lineSegments>
      <points ref={haloRef}>
        <pointsMaterial vertexColors size={0.6} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
      </points>
      {/* moving glider vehicle marker */}
      <mesh ref={gliderRef} visible={false}>
        <coneGeometry args={[0.35, 0.8, 10]} />
        <meshBasicMaterial color="#f472b6" />
      </mesh>
    </group>
  )
}

import { useFrame } from "@react-three/fiber"

function useFrameReveal(
  linesRef: React.RefObject<THREE.LineSegments | null>,
  rangeRef: React.RefObject<{ min: number; max: number }>
) {
  useFrame(() => {
    const lines = linesRef.current
    if (!lines || !rangeRef.current.max) return
    const geo = lines.geometry as THREE.BufferGeometry
    const total = geo.attributes.position?.count ?? 0
    if (!total) return
    const t = simClock.normalized(rangeRef.current.min, rangeRef.current.max)
    const visiblePairs = Math.floor(t * (total / 2))
    const want = visiblePairs * 2
    if (geo.drawRange.count !== want) geo.setDrawRange(0, want)
  })
}

function useFrameRevealPoints(pointsRef: React.RefObject<THREE.Points | null>) {
  useFrame(() => {
    const pts = pointsRef.current
    if (!pts) return
    const total = pts.geometry.attributes.position?.count ?? 0
    if (!total) return
    const want = Math.ceil(simClock.t * total)
    if (pts.geometry.drawRange.count !== want) pts.geometry.setDrawRange(0, want)
  })
}


