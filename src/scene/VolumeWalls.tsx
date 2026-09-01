"use client"

/**
 * Aquarium walls (upgrade G): N/S/E/W vertical faces of the volume built
 * from real field rows/columns, morphing with the seasonal clock. The ocean
 * reads as one solid block of water.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import type { FieldMeta, Manifest } from "@/types"
import { getFieldData } from "@/lib/fieldCache"
import { useOcean } from "@/lib/store"
import { geoToSphere } from "./mapping"

import { buildDivergingLut, buildLut } from "@/lib/colormaps"
import { SLICE_VERTEX, SLICE_FRAGMENT } from "./ColormapShader"

interface Wall {
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
  tex: THREE.DataTexture
  /** byte offset of the first sampled cell within each level plane */
  offset: number
  /** element stride across the wall (1 for lon rows, nLon for lat columns) */
  stride: number
  cols: number
}

/** Module-level writer keeps per-element mutation out of component scope. */
function writeWallTexture(
  tex: THREE.DataTexture,
  bytes: Uint8Array,
  cols: number,
  offset: number,
  stride: number,
  nDepth: number,
  nLatXnLon: number,
  frameBytesPerLevel: number,
  iA: number,
  iB: number,
  wMix256: number
): void {
  const data = tex.image.data as Uint8Array
  for (let k = 0; k < nDepth; k++) {
    const levelBase = k * nLatXnLon
    for (let c = 0; c < cols; c++) {
      const cellIdx = levelBase + offset + c * stride
      let v = bytes[iA * frameBytesPerLevel + cellIdx]
      if (wMix256 > 0) {
        const b = bytes[iB * frameBytesPerLevel + cellIdx]
        v = (v * (256 - wMix256) + b * wMix256 + 128) >> 8
      }
      data[k * cols + c] = v
    }
  }
  tex.needsUpdate = true
}

/** Apply per-frame shader uniforms from outside component scope. */
function updateWallUniforms(
  mat: THREE.ShaderMaterial,
  rangeMin: number,
  rangeMax: number,
  logScale: boolean,
  opacity: number
): void {
  ;(mat.uniforms.uMin.value as number) = rangeMin
  ;(mat.uniforms.uMax.value as number) = rangeMax
  ;(mat.uniforms.uLog.value as number) = logScale && rangeMin > 0 ? 1 : 0
  ;(mat.uniforms.uOpacity.value as number) = 0.88 * opacity
}

/**
 * Module-scoped engine state: only one VolumeWalls instance exists, and
 * keeping it outside React refs sidesteps compiler purity tracking while
 * useFrame mutates GPU-side objects.
 */
interface WallState {
  group: THREE.Group
  walls: Wall[]
  bytes: Uint8Array
  meta: FieldMeta
  lutTex: THREE.DataTexture
  lastUpload: string
}
let wallState: WallState | null = null

export default function VolumeWalls({ manifest }: { manifest: Manifest }) {
  const variableId = useOcean((s) => s.variableId)
  const wallsEnabled = useOcean((s) => s.wallsEnabled)
  const vertExaggeration = useOcean((s) => s.vertExaggeration)
  const groupRef = useRef<THREE.Group>(null)

  const meta = useMemo(
    () => manifest.variables.find((v) => v.id === variableId) ?? null,
    [manifest, variableId]
  )
  const [loaded, setLoaded] = useState<{ id: string; bytes: Uint8Array } | null>(null)

  useEffect(() => {
    if (!meta) return
    let cancelled = false
    getFieldData(meta).then((bytes) => !cancelled && setLoaded({ id: meta.id, bytes }))
    return () => {
      cancelled = true
    }
  }, [meta])

  useEffect(() => {
    const group = groupRef.current
    if (!group || !wallsEnabled || !meta || !loaded || loaded.id !== meta.id) return

    const { nLat, nLon, nDepth } = meta.dims
    const roi = manifest.roi

    const forceDiverging = meta.id.endsWith("anomaly")
    const palette = useOcean.getState().palette
    const lut = forceDiverging || palette === "diverging" ? buildDivergingLut() : buildLut(palette)
    const lutRgba = new Uint8Array(256 * 4)
    for (let i = 0; i < 256; i++) {
      lutRgba[i * 4] = lut[i * 3]
      lutRgba[i * 4 + 1] = lut[i * 3 + 1]
      lutRgba[i * 4 + 2] = lut[i * 3 + 2]
      lutRgba[i * 4 + 3] = 255
    }
    const lutTex = new THREE.DataTexture(lutRgba, 256, 1, THREE.RGBAFormat)
    lutTex.needsUpdate = true

    const mkMat = (tex: THREE.DataTexture) =>
      new THREE.ShaderMaterial({
        vertexShader: SLICE_VERTEX,
        fragmentShader: SLICE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uData: { value: tex },
          uDataB: { value: tex },
          uLut: { value: lutTex },
          uMin: { value: meta.globalMin },
          uMax: { value: meta.globalMax },
          uLog: { value: 0 },
          uOpacity: { value: 0.9 },
          uFill: { value: meta.encoding.fillByte / 255 },
          uMix: { value: 0 },
        },
      })

    const walls: Wall[] = []

    const mkTexture = (cols: number) => {
      const tex = new THREE.DataTexture(
        new Uint8Array(nDepth * cols), cols, nDepth, THREE.RedFormat
      )
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.flipY = true // row 0 (surface) at top
      tex.needsUpdate = true
      return tex
    }

    const specs = [
      // south (latMin row), north (latMax row): stride 1 across lon
      { kind: "ns", fixedLat: roi.latMin, offset: 0, stride: 1 },
      { kind: "ns", fixedLat: roi.latMax, offset: (nLat - 1) * nLon, stride: 1 },
      // west (lon col 0), east (lon col nLon-1): stride nLon across lat
      { kind: "ew", fixedLon: roi.lonMin, offset: 0, stride: nLon },
      { kind: "ew", fixedLon: roi.lonMax, offset: nLon - 1, stride: nLon },
    ]

    for (const s of specs) {
      const cols = s.kind === "ns" ? nLon : nLat
      const tex = mkTexture(cols)
      const mat = mkMat(tex)
      
      // Create custom spherical wall geometry
      const geo = new THREE.PlaneGeometry(1, 1, cols - 1, nDepth - 1)
      const pos = geo.attributes.position as THREE.BufferAttribute
      const maxM = meta.depthsM[meta.depthsM.length - 1] || 1
      for (let id = 0; id < nDepth; id++) {
        const idPct = nDepth > 1 ? id / (nDepth - 1) : 0
        const depth = idPct * maxM
        for (let ic = 0; ic < cols; ic++) {
          const vi = id * cols + ic
          const icPct = cols > 1 ? ic / (cols - 1) : 0
          let lon = s.fixedLon ?? roi.lonMin
          let lat = s.fixedLat ?? roi.latMin
          if (s.kind === "ns") {
            lon = roi.lonMin + icPct * (roi.lonMax - roi.lonMin)
          } else {
            lat = roi.latMin + icPct * (roi.latMax - roi.latMin)
          }
          const p = geoToSphere(lon, lat, depth, vertExaggeration)
          pos.setXYZ(vi, p.x, p.y, p.z)
        }
      }
      geo.computeVertexNormals()

      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(0, 0, 0)
      mesh.rotation.set(0, 0, 0)
      mesh.renderOrder = 50
      group.add(mesh)
      walls.push({ mesh, mat, tex, offset: s.offset, stride: s.stride, cols })
    }

    wallState = {
      group,
      walls,
      bytes: loaded.bytes,
      meta,
      lutTex,
      lastUpload: "",
    }

    return () => {
      for (const w of walls) {
        group.remove(w.mesh)
        w.mat.dispose()
        w.tex.dispose()
        w.mesh.geometry.dispose()
      }
      lutTex.dispose()
      wallState = null
    }
  }, [manifest, meta, loaded, wallsEnabled, vertExaggeration])

  useFrame(() => {
    const eng = wallState
    if (!eng) return
    const s = useOcean.getState()
    const { meta, bytes } = eng
    const { nLat, nLon, nDepth } = meta.dims
    const nTime = meta.times?.length ?? 1
    const timeIdx = s.timeIdx
    const tt = nTime > 1 ? ((timeIdx % nTime) + nTime) % nTime : 0
    const iA = Math.floor(tt) % nTime
    const iB = (iA + 1) % nTime
    const mixT = 0
    const frameBytesPerLevel = nDepth * nLat * nLon

    const uploadKey = `${iA}-${iB}-${Math.round(mixT * 32)}`
    if (uploadKey !== eng.lastUpload) {
      eng.lastUpload = uploadKey
      const wMix = Math.round(mixT * 256)
      for (const w of eng.walls) {
        writeWallTexture(
          w.tex,
          bytes,
          w.cols,
          w.offset,
          w.stride,
          nDepth,
          nLat * nLon,
          frameBytesPerLevel,
          iA,
          iB,
          wMix
        )
      }
    }

    for (const w of eng.walls) {
      updateWallUniforms(
        w.mat,
        s.rangeMin ?? meta.globalMin,
        s.rangeMax ?? meta.globalMax,
        s.logScale,
        s.opacity
      )
    }
  })

  if (!wallsEnabled) return null
  return <group ref={groupRef} />
}
