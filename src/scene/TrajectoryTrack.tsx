"use client"

import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import { Line } from "@react-three/drei"
import type { InstrumentPlatform } from "@/types"
import { fetchProfiles } from "@/lib/api"
import { useOcean } from "@/lib/store"
import { geoToSphere } from "./mapping"

export default function TrajectoryTrack() {
  const selectedId = useOcean((s) => s.selectedPlatformId)
  const showTrajectory = useOcean((s) => s.showTrajectory)
  const [platforms, setPlatforms] = useState<InstrumentPlatform[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchProfiles()
      .then((r) => !cancelled && setPlatforms(r.platforms))
      .catch(() => !cancelled && setPlatforms([]))
    return () => {
      cancelled = true
    }
  }, [])

  const selectedPlatform = useMemo(() => {
    if (!selectedId || !platforms) return null
    return platforms.find((p) => p.id === selectedId) ?? null
  }, [selectedId, platforms])

  // Points along the historical cycle track
  const points = useMemo(() => {
    if (!selectedPlatform || !selectedPlatform.cycles.length || !showTrajectory) return null
    return selectedPlatform.cycles.map((c) => {
      const v = geoToSphere(c.lon, c.lat, 0, 0).multiplyScalar(1.007)
      return [v.x, v.y, v.z] as [number, number, number]
    })
  }, [selectedPlatform, showTrajectory])

  if (!selectedPlatform || !points || points.length < 2) {
    return null
  }

  const color =
    selectedPlatform.type === "argo"
      ? "#38bdf8"
      : selectedPlatform.type === "glider"
      ? "#f472b6"
      : "#34d399"

  return (
    <group>
      {/* Connected trajectory line */}
      <Line points={points} color={color} lineWidth={2} transparent opacity={0.85} />

      {/* Waypoint dots */}
      {points.map((pt, i) => (
        <mesh key={i} position={pt}>
          <sphereGeometry args={[i === points.length - 1 ? 0.25 : 0.14, 8, 8]} />
          <meshBasicMaterial
            color={i === points.length - 1 ? "#facc15" : color}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}
    </group>
  )
}
