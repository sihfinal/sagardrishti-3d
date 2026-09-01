"use client"

/**
 * The volume renderer — deliberately simple and bulletproof:
 * one plane per real depth level (25), DataTexture per level, one shared
 * simple colormap shader. Time animation = stepped monthly frames (CPU
 * copies into the level textures). No continuous morphing, no dual-texture
 * blending, no post-processing — nothing that can silently fail.
 */
import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import type { Manifest, Roi } from "@/types"
import { getFieldData } from "@/lib/fieldCache"
import { useOcean } from "@/lib/store"
import { buildDivergingLut, buildLut } from "@/lib/colormaps"
import { makeLutTexture, SLICE_VERTEX, SLICE_MASKED_FRAGMENT } from "./ColormapShader"
import { makeMapping, SPHERE_RADIUS, VERT_FACTOR } from "./mapping"

import { getLandMaskTex } from "@/lib/maskCache"

export default function DepthSlices({ manifest }: { manifest: Manifest }) {
  const variableId = useOcean((s) => s.variableId)
  const palette = useOcean((s) => s.palette)
  const opacity = useOcean((s) => s.opacity)
  const vertExaggeration = useOcean((s) => s.vertExaggeration)
  const logScale = useOcean((s) => s.logScale)
  const rangeMin = useOcean((s) => s.rangeMin)
  const rangeMax = useOcean((s) => s.rangeMax)
  const timeIdx = useOcean((s) => s.timeIdx)
  const depthIdx = useOcean((s) => s.depthIdx)
  const showModel = useOcean((s) => s.showModel)

  const meta = useMemo(
    () => manifest.variables.find((v) => v.id === variableId) ?? null,
    [manifest, variableId]
  )

  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [landMaskTex, setLandMaskTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    let cancelled = false
    getLandMaskTex(manifest.roi).then((tex) => {
      if (!cancelled) setLandMaskTex(tex)
    })
    return () => {
      cancelled = true
    }
  }, [manifest.roi])

  useEffect(() => {
    if (!meta) return
    let cancelled = false
    getFieldData(meta).then((d) => {
      if (!cancelled) setBytes(d)
    })
    return () => {
      cancelled = true
    }
  }, [meta])

  const lutTex = useMemo(() => {
    const forceDiverging = meta?.id.endsWith("anomaly")
    const lut =
      palette === "diverging" || forceDiverging
        ? buildDivergingLut()
        : buildLut(palette)
    return makeLutTexture(lut)
  }, [palette, meta])

  // per-level textures for the CURRENT time frame
  const levelTextures = useMemo(() => {
    if (!meta || !bytes) return null
    const { nLat, nLon, nDepth } = meta.dims
    const nTime = meta.times?.length ?? 1
    const frame =
      nTime > 1 ? (timeIdx % nTime) * nDepth * nLat * nLon : 0
    return meta.depthsM.map((_, k) => {
      const data = new Uint8Array(nLat * nLon)
      data.set(
        bytes.subarray(
          frame + k * nLat * nLon,
          frame + (k + 1) * nLat * nLon
        )
      )
      const tex = new THREE.DataTexture(data, nLon, nLat, THREE.RedFormat)
      // Use NearestFilter so our custom bilinear shader can see raw values
      tex.minFilter = THREE.NearestFilter
      tex.magFilter = THREE.NearestFilter
      tex.flipY = true
      tex.needsUpdate = true
      return tex
    })
    // rebuild when the frame changes (cheap: 25 × 3.9 KB copies)
  }, [meta, bytes, timeIdx])

  useEffect(
    () => () => levelTextures?.forEach((t) => t.dispose()),
    [levelTextures]
  )

  if (!showModel || !manifest || !meta || !levelTextures || !landMaskTex) return null

  const maxDepth = meta.depthsM[meta.depthsM.length - 1] || 1
  const gMin = rangeMin ?? meta.globalMin
  const gMax = rangeMax ?? meta.globalMax
  const resolution = new THREE.Vector2(meta.dims.nLon, meta.dims.nLat)

  return (
    <group>
      {meta.depthsM.map((d, i) => {
        const norm = d / maxDepth
        const selected = i === depthIdx
        let op =
          i === 0
            ? Math.min(1, opacity)
            : Math.max(0.15, (1 - norm * 0.7) * opacity)
        if (selected) op = Math.min(1, opacity)
        else if (depthIdx > 0) op *= 0.45

        const radius = SPHERE_RADIUS - d * vertExaggeration * VERT_FACTOR

        return (
          <SliceMesh
            key={i}
            tex={levelTextures[i]}
            radius={radius}
            opacity={op}
            selected={selected}
            lutTex={lutTex}
            maskTex={landMaskTex}
            resolution={resolution}
            min={gMin}
            max={gMax}
            log={logScale && gMin > 0 ? 1 : 0}
            fill={meta.encoding.fillByte / 255}
            roi={manifest.roi}
          />
        )
      })}
    </group>
  )
}

interface MeshProps {
  tex: THREE.DataTexture
  radius: number
  opacity: number
  selected: boolean
  lutTex: THREE.DataTexture
  maskTex: THREE.Texture
  resolution: THREE.Vector2
  min: number
  max: number
  log: number
  fill: number
  roi: Roi
}

function SliceMesh({
  tex, radius, opacity, selected,
  lutTex, maskTex, resolution, min, max, log, fill, roi,
}: MeshProps) {
  const roiBounds = useMemo(() => new THREE.Vector4(roi.lonMin, roi.lonMax, roi.latMin, roi.latMax), [roi])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SLICE_VERTEX,
        fragmentShader: SLICE_MASKED_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uData: { value: tex },
          uLut: { value: lutTex },
          uMask: { value: maskTex },
          uResolution: { value: resolution },
          uRoiBounds: { value: roiBounds },
          uMin: { value: min },
          uMax: { value: max },
          uLog: { value: log },
          uOpacity: { value: opacity },
          uFill: { value: fill },
        },
      }),
    [tex, lutTex, maskTex, resolution, roiBounds, min, max, log, opacity, fill]
  )

  useEffect(
    () => () => material.dispose(),
    [material]
  )

  return (
    <mesh position={[0, 0, 0]} rotation={[0, 0, 0]} material={material}>
      <sphereGeometry
        args={[
          radius,
          64,
          64,
          (roi.lonMin + 180) * (Math.PI / 180),
          (roi.lonMax - roi.lonMin) * (Math.PI / 180),
          (90 - roi.latMax) * (Math.PI / 180),
          (roi.latMax - roi.latMin) * (Math.PI / 180),
        ]}
      />

    </mesh>
  )
}
