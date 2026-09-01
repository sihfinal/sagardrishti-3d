"use client"

import React, { useMemo } from "react"
import * as THREE from "three"

export interface GeographicBounds {
  latMin: number
  latMax: number
  lonMin: number
  lonMax: number
}

interface RegionSelectionBoxProps {
  bounds: GeographicBounds | null
  radius?: number
}

function latLonToVec3(lon: number, lat: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ]
}

export default function RegionSelectionBox({
  bounds,
  radius = 2.012,
}: RegionSelectionBoxProps) {
  if (!bounds) return null
  const { latMin, latMax, lonMin, lonMax } = bounds

  // 1. Boundary line geometry following the curved sphere surface
  const lineGeometry = useMemo(() => {
    const segments = 32
    const positions: number[] = []

    const addEdge = (
      startLon: number,
      startLat: number,
      endLon: number,
      endLat: number
    ) => {
      for (let i = 0; i < segments; i++) {
        const t1 = i / segments
        const t2 = (i + 1) / segments
        const lon1 = startLon + (endLon - startLon) * t1
        const lat1 = startLat + (endLat - startLat) * t1
        const lon2 = startLon + (endLon - startLon) * t2
        const lat2 = startLat + (endLat - startLat) * t2

        const [x1, y1, z1] = latLonToVec3(lon1, lat1, radius)
        const [x2, y2, z2] = latLonToVec3(lon2, lat2, radius)
        positions.push(x1, y1, z1, x2, y2, z2)
      }
    }

    // Top horizontal edge (latMax)
    addEdge(lonMin, latMax, lonMax, latMax)
    // Right vertical edge (lonMax)
    addEdge(lonMax, latMax, lonMax, latMin)
    // Bottom horizontal edge (latMin)
    addEdge(lonMax, latMin, lonMin, latMin)
    // Left vertical edge (lonMin)
    addEdge(lonMin, latMin, lonMin, latMax)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [latMin, latMax, lonMin, lonMax, radius])

  // 2. Semi-transparent surface fill mesh
  const fillGeometry = useMemo(() => {
    const grid = 16
    const vertices: number[] = []
    const indices: number[] = []

    for (let j = 0; j <= grid; j++) {
      const lat = latMin + (latMax - latMin) * (j / grid)
      for (let i = 0; i <= grid; i++) {
        const lon = lonMin + (lonMax - lonMin) * (i / grid)
        const [x, y, z] = latLonToVec3(lon, lat, radius - 0.002)
        vertices.push(x, y, z)
      }
    }

    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        const a = j * (grid + 1) + i
        const b = j * (grid + 1) + (i + 1)
        const c = (j + 1) * (grid + 1) + i
        const d = (j + 1) * (grid + 1) + (i + 1)

        indices.push(a, b, c)
        indices.push(b, d, c)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [latMin, latMax, lonMin, lonMax, radius])

  return (
    <group>
      {/* Dashed / Clean White Boundary Outline */}
      <lineSegments geometry={lineGeometry}>
        <lineBasicMaterial color="#ffffff" linewidth={2} transparent opacity={0.95} />
      </lineSegments>

      {/* Semi-transparent Cyan Fill Mesh */}
      <mesh geometry={fillGeometry}>
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
