"use client"

import React, { useEffect, useState, useMemo } from "react"
import * as THREE from "three"

interface CountryBoundariesProps {
  radius?: number
}

// Convert geographic coordinates (lon, lat) to 3D Cartesian coordinates on sphere
function latLonToVec3(lon: number, lat: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ]
}

export default function CountryBoundaries({ radius = 2.008 }: CountryBoundariesProps) {
  const [lineRings, setLineRings] = useState<number[][][] | null>(null)

  useEffect(() => {
    let active = true
    fetch("/data/country_lines.json")
      .then((res) => res.json())
      .then((data: number[][][]) => {
        if (active) setLineRings(data)
      })
      .catch((err) => console.warn("Could not load country boundaries:", err))
    return () => {
      active = false
    }
  }, [])

  const geometry = useMemo(() => {
    if (!lineRings || lineRings.length === 0) return null

    const positions: number[] = []

    for (const ring of lineRings) {
      if (ring.length < 2) continue
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i]
        const [lon2, lat2] = ring[i + 1]

        // Ignore wrap-around segment glitches across dateline (> 180 deg jump)
        if (Math.abs(lon1 - lon2) > 180) continue

        const [x1, y1, z1] = latLonToVec3(lon1, lat1, radius)
        const [x2, y2, z2] = latLonToVec3(lon2, lat2, radius)

        positions.push(x1, y1, z1, x2, y2, z2)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [lineRings, radius])

  if (!geometry) return null

  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </lineSegments>
  )
}
