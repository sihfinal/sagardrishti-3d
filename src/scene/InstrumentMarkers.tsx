"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame, type ThreeEvent } from "@react-three/fiber"
import type { InstrumentPlatform, Manifest } from "@/types"
import { fetchProfiles } from "@/lib/api"
import { getFieldData } from "@/lib/fieldCache"
import { useOcean } from "@/lib/store"
import { makeMapping, sampleField, geoToSphere } from "./mapping"

export default function InstrumentMarkers({ manifest }: { manifest: Manifest }) {
  const [platforms, setPlatforms] = useState<InstrumentPlatform[] | null>(null)
  const selectPlatform = useOcean((s) => s.selectPlatform)
  const setHoverInfo = useOcean((s) => s.setHoverInfo)
  const showArgo = useOcean((s) => s.showArgo)
  const showGlider = useOcean((s) => s.showGlider)
  const showBgc = useOcean((s) => s.showBgc)

  useEffect(() => {
    let cancelled = false
    fetchProfiles()
      .then((r) => !cancelled && setPlatforms(r.platforms))
      .catch(() => !cancelled && setPlatforms([]))
    return () => {
      cancelled = true
    }
  }, [])

  const visiblePlatforms = useMemo(() => {
    if (!platforms) return []
    return platforms.filter((p) => {
      if (p.type === "argo" && !showArgo) return false
      if (p.type === "glider" && !showGlider) return false
      if (p.type === "bgc" && !showBgc) return false
      return true
    })
  }, [platforms, showArgo, showGlider, showBgc])

  if (!platforms) return null

  return (
    <group>
      {visiblePlatforms.map((p) => (
        <Marker
          key={`${p.type}-${p.id}`}
          platform={p}
          manifest={manifest}
          onHover={(info, screen) =>
            setHoverInfo(info ? { ...info, screen } : null)
          }
          onClick={() => selectPlatform(p.id)}
        />
      ))}
    </group>
  )
}

interface MarkerProps {
  platform: InstrumentPlatform
  manifest: Manifest
  onHover: (
    info: {
      id: string
      type: string
      lastSeen: string
      obsTemp: number | null
      modelTemp: number | null
    } | null,
    screen: { x: number; y: number }
  ) => void
  onClick: () => void
}

function Marker({ platform, manifest, onHover, onClick }: MarkerProps) {
  const selectedId = useOcean((s) => s.selectedPlatformId)
  const setCameraFocus = useOcean((s) => s.setCameraFocus)
  const selected = selectedId === platform.id
  const [hovered, setHovered] = useState(false)
  const meshRef = useRef<THREE.Mesh>(null)
  // deterministic per-platform pulse phase (id hash → [0, 2π))
  const phase = useMemo(() => {
    let h = 0
    for (let i = 0; i < platform.id.length; i++)
      h = (h * 31 + platform.id.charCodeAt(i)) % 628
    return h / 100
  }, [platform.id])

  // gentle pulse (upgrade D) — stronger when selected
  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const base = hovered || selected ? 1.35 : 0.9
    const pulse = selected
      ? Math.sin(clock.elapsedTime * 4 + phase) * 0.25
      : Math.sin(clock.elapsedTime * 2 + phase) * 0.07
    meshRef.current.scale.setScalar(base + pulse)
  })

  // nearest cycle position to the platform's reported (lon, lat)
  const pos = useMemo(() => {
    return geoToSphere(platform.lon, platform.lat, 0, 0).multiplyScalar(1.008)
  }, [platform])

  const color =
    platform.type === "argo"
      ? selected
        ? "#facc15"
        : "#38bdf8"
      : platform.type === "glider"
        ? selected
          ? "#facc15"
          : "#f472b6"
        : selected
          ? "#facc15"
          : "#34d399" // BGC-Argo chlorophyll floats

  async function handleHover(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    setHovered(true)
    const lastCycle = platform.cycles[platform.cycles.length - 1]
    const obs =
      lastCycle?.profile.find((pt) => pt.tempC !== null && pt.depthM < 20)
        ?.tempC ?? null

    let model: number | null = null
    const tempMeta = manifest.variables.find((v) => v.id === "temp_annual")
    if (tempMeta) {
      try {
        const data = await getFieldData(tempMeta)
        const q = sampleField(
          data, manifest.grid, tempMeta.depthsM,
          platform.lon, platform.lat, 0
        )
        if (q !== null) {
          model =
            tempMeta.encoding.offset + (q / 254) *
            (tempMeta.globalMax - tempMeta.globalMin)
        }
      } catch {
        model = null
      }
    }

    onHover(
      {
        id: platform.id,
        type: platform.type,
        lastSeen: platform.lastSeen,
        obsTemp: obs,
        modelTemp: model,
      },
      { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
    )
  }

  function handleOut() {
    setHovered(false)
    onHover(null, { x: 0, y: 0 })
  }

  const groupRef = useRef<THREE.Group>(null)
  useEffect(() => {
    groupRef.current?.lookAt(0, 0, 0)
  }, [pos])

  return (
    <group ref={groupRef} position={pos}>
      <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.3]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>
      <mesh
        ref={meshRef}
        onPointerOver={handleHover}
        onPointerOut={handleOut}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          setCameraFocus({ x: pos.x, y: pos.y, z: pos.z })
          onClick()
        }}
      >
        {platform.type === "argo" ? (
          <sphereGeometry args={[0.4, 12, 12]} />
        ) : platform.type === "glider" ? (
          <coneGeometry args={[0.45, 0.9, 12]} />
        ) : (
          <octahedronGeometry args={[0.5, 0]} />
        )}
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}
