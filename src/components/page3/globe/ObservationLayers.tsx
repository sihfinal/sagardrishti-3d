"use client"

import React, { useMemo, useRef, useLayoutEffect, Component, ErrorInfo, ReactNode } from "react"
import * as THREE from "three"
import { ThreeEvent } from "@react-three/fiber"
import { ObservationItem } from "@/lib/observationsApi"

interface ObservationLayersProps {
  observations?: ObservationItem[]
  visibleTypes?: Record<string, boolean>
  selectedObservationId?: string | null
  onSelectObservation?: (obs: ObservationItem | null) => void
  selectionMode?: boolean
  radius?: number
}

// Spherical conversion matching the Earth exactly
function geoToSphere(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  const x = -r * Math.sin(phi) * Math.cos(theta)
  const y = r * Math.cos(phi)
  const z = r * Math.sin(phi) * Math.sin(theta)
  return new THREE.Vector3(x, y, z)
}

// Standard, crash-proof InstancedMesh component
interface InstancedMarkerGroupProps {
  items: ObservationItem[]
  geometry: THREE.BufferGeometry
  color: string
  radius: number
  selectionMode: boolean
  onSelectObservation?: (obs: ObservationItem | null) => void
}

function InstancedMarkerGroup({
  items,
  geometry,
  color,
  radius,
  selectionMode,
  onSelectObservation,
}: InstancedMarkerGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  // Filter valid items
  const validItems = useMemo(() => {
    return items.filter(
      (it) => it && typeof it.latitude === "number" && !isNaN(it.latitude) && typeof it.longitude === "number" && !isNaN(it.longitude)
    )
  }, [items])

  useLayoutEffect(() => {
    if (!meshRef.current || validItems.length === 0) return

    const tempObj = new THREE.Object3D()
    for (let i = 0; i < validItems.length; i++) {
      const it = validItems[i]
      const pos = geoToSphere(it.latitude, it.longitude, radius)
      tempObj.position.copy(pos)
      tempObj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize())
      tempObj.scale.setScalar(1.0)
      tempObj.updateMatrix()
      meshRef.current.setMatrixAt(i, tempObj.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [validItems, radius])

  if (validItems.length === 0) return null

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (selectionMode) return
    e.stopPropagation()
    const instanceId = e.instanceId
    if (instanceId !== undefined && validItems[instanceId]) {
      onSelectObservation?.(validItems[instanceId])
    }
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, validItems.length]}
      onClick={handleClick}
      onPointerOver={(e) => {
        if (!selectionMode) {
          e.stopPropagation()
          document.body.style.cursor = "pointer"
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default"
      }}
    >
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  )
}

// Class Error Boundary to prevent any child error from breaking Earth
class LayerErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("Observation layer caught error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export default function ObservationLayers({
  observations = [],
  visibleTypes = { argo: true, glider: true, ctd: true, bgc: true },
  selectedObservationId = null,
  onSelectObservation,
  selectionMode = false,
  radius = 2.014,
}: ObservationLayersProps) {
  // Partition observations by type
  const { argoItems, gliderItems, ctdItems, bgcItems } = useMemo(() => {
    const argo: ObservationItem[] = []
    const glider: ObservationItem[] = []
    const ctd: ObservationItem[] = []
    const bgc: ObservationItem[] = []

    if (!Array.isArray(observations)) {
      return { argoItems: argo, gliderItems: glider, ctdItems: ctd, bgcItems: bgc }
    }

    for (const obs of observations) {
      if (!obs) continue
      if (obs.type === "argo") argo.push(obs)
      else if (obs.type === "glider") glider.push(obs)
      else if (obs.type === "ctd") ctd.push(obs)
      else if (obs.type === "bgc") bgc.push(obs)
      else argo.push(obs)
    }

    return { argoItems: argo, gliderItems: glider, ctdItems: ctd, bgcItems: bgc }
  }, [observations])

  // Selected item position for highlight ring
  const selectedPos = useMemo(() => {
    if (!selectedObservationId || !Array.isArray(observations)) return null
    const found = observations.find((o) => o && o.id === selectedObservationId)
    if (!found || isNaN(found.latitude) || isNaN(found.longitude)) return null
    return geoToSphere(found.latitude, found.longitude, radius + 0.006)
  }, [selectedObservationId, observations, radius])

  // Shared Geometries
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(0.014, 8, 8), [])
  const boxGeo = useMemo(() => new THREE.BoxGeometry(0.018, 0.018, 0.018), [])
  const coneGeo = useMemo(() => new THREE.ConeGeometry(0.014, 0.024, 6), [])
  const octGeo = useMemo(() => new THREE.OctahedronGeometry(0.016, 0), [])

  return (
    <LayerErrorBoundary>
      <group>
        {/* Argo Floats (Green Spheres) */}
        {visibleTypes.argo !== false && (
          <InstancedMarkerGroup
            items={argoItems}
            geometry={sphereGeo}
            color="#10b981"
            radius={radius}
            selectionMode={selectionMode}
            onSelectObservation={onSelectObservation}
          />
        )}

        {/* Gliders (Cyan Cubes) */}
        {visibleTypes.glider !== false && (
          <InstancedMarkerGroup
            items={gliderItems}
            geometry={boxGeo}
            color="#06b6d4"
            radius={radius}
            selectionMode={selectionMode}
            onSelectObservation={onSelectObservation}
          />
        )}

        {/* CTD Casts (Orange Cones) */}
        {visibleTypes.ctd !== false && (
          <InstancedMarkerGroup
            items={ctdItems}
            geometry={coneGeo}
            color="#f97316"
            radius={radius}
            selectionMode={selectionMode}
            onSelectObservation={onSelectObservation}
          />
        )}

        {/* BGC Sensors (Purple Octahedra) */}
        {visibleTypes.bgc !== false && (
          <InstancedMarkerGroup
            items={bgcItems}
            geometry={octGeo}
            color="#a855f7"
            radius={radius}
            selectionMode={selectionMode}
            onSelectObservation={onSelectObservation}
          />
        )}

        {/* Selected Observation Highlight Ring */}
        {selectedPos && (
          <mesh position={selectedPos}>
            <ringGeometry args={[0.025, 0.045, 24]} />
            <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.95} />
          </mesh>
        )}
      </group>
    </LayerErrorBoundary>
  )
}
