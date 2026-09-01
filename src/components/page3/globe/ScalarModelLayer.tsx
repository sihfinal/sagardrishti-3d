"use client"

import React, { useMemo } from "react"
import * as THREE from "three"
import { ModelFieldResponse } from "@/lib/modelApi"
import { buildLut, PaletteId, valueToLutIndex } from "@/lib/colormaps"

interface ScalarModelLayerProps {
  fieldData: ModelFieldResponse
  palette?: PaletteId
  radius?: number
  opacity?: number
}

// Convert geographic coordinates to 3D sphere position
function geoToVec3(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ]
}

export default function ScalarModelLayer({
  fieldData,
  palette = "turbo",
  radius = 2.004,
  opacity = 0.85,
}: ScalarModelLayerProps) {
  const { width, height, latitudes, longitudes, values, min_value, max_value, variable } = fieldData

  // Determine appropriate color palette
  const effectivePalette: PaletteId = useMemo(() => {
    if (variable === "salinity") return "viridis"
    if (variable === "chlorophyll") return "plasma"
    return palette || "turbo"
  }, [variable, palette])

  // Build high-performance RGBA DataTexture
  const dataTexture = useMemo(() => {
    if (!values || values.length === 0 || width === 0 || height === 0) return null

    const lut = buildLut(effectivePalette, 256)
    const minVal = min_value ?? 0
    const maxVal = max_value ?? 1
    const range = maxVal - minVal > 0 ? maxVal - minVal : 1
    const isLog = variable === "chlorophyll"

    const rgba = new Uint8Array(width * height * 4)

    // Note: values is height (lats) x width (lons)
    for (let row = 0; row < height; row++) {
      // In Three.js textures, row 0 is bottom (min latitude)
      const latRow = row
      const rowValues = values[latRow]
      if (!rowValues) continue

      for (let col = 0; col < width; col++) {
        const val = rowValues[col]
        const pixelIdx = (row * width + col) * 4

        if (val === null || val === undefined || isNaN(val)) {
          // Land / Masked Cell -> Fully Transparent
          rgba[pixelIdx] = 0
          rgba[pixelIdx + 1] = 0
          rgba[pixelIdx + 2] = 0
          rgba[pixelIdx + 3] = 0
        } else {
          // Ocean Data Cell -> Map value through LUT
          const lutIdx = valueToLutIndex(val, minVal, maxVal, isLog, 256)
          const cIdx = lutIdx * 3
          rgba[pixelIdx] = lut[cIdx]
          rgba[pixelIdx + 1] = lut[cIdx + 1]
          rgba[pixelIdx + 2] = lut[cIdx + 2]
          rgba[pixelIdx + 3] = 235 // ~92% opacity
        }
      }
    }

    const tex = new THREE.DataTexture(
      rgba,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    )
    tex.generateMipmaps = true
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }, [values, width, height, min_value, max_value, effectivePalette, variable])

  // Construct curved spherical mesh patch matching exact latitude / longitude domain
  const patchGeometry = useMemo(() => {
    if (!latitudes || latitudes.length === 0 || !longitudes || longitudes.length === 0) return null

    const latMin = Math.min(...latitudes)
    const latMax = Math.max(...latitudes)
    const lonMin = Math.min(...longitudes)
    const lonMax = Math.max(...longitudes)

    const latSegments = 64
    const lonSegments = 64

    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    for (let i = 0; i <= latSegments; i++) {
      const v = i / latSegments
      const lat = latMin + (latMax - latMin) * v

      for (let j = 0; j <= lonSegments; j++) {
        const u = j / lonSegments
        const lon = lonMin + (lonMax - lonMin) * u

        const [x, y, z] = geoToVec3(lat, lon, radius)
        positions.push(x, y, z)
        uvs.push(u, v)
      }
    }

    for (let i = 0; i < latSegments; i++) {
      for (let j = 0; j < lonSegments; j++) {
        const a = i * (lonSegments + 1) + j
        const b = (i + 1) * (lonSegments + 1) + j
        const c = (i + 1) * (lonSegments + 1) + (j + 1)
        const d = i * (lonSegments + 1) + (j + 1)

        indices.push(a, b, d)
        indices.push(b, c, d)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [latitudes, longitudes, radius])

  if (!dataTexture || !patchGeometry) return null

  return (
    <mesh geometry={patchGeometry} renderOrder={2} raycast={() => null}>
      <meshBasicMaterial
        map={dataTexture}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
