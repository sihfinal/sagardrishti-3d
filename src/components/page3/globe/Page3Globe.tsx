"use client"

import React, { useRef, useEffect } from "react"
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import EarthSphere from "./EarthSphere"
import { GeographicBounds } from "./RegionSelectionBox"
import { ObservationItem } from "@/lib/observationsApi"
import { ModelFieldResponse } from "@/lib/modelApi"

interface Page3GlobeProps {
  onHoverCoordinates?: (coords: { lat: number; lon: number } | null) => void
  zoomTrigger?: number
  onOrientationChange?: (heading: number) => void
  selectionMode?: boolean
  selectedRegion?: GeographicBounds | null
  onRegionSelect?: (bounds: GeographicBounds | null) => void
  observations?: ObservationItem[]
  visibleTypes?: Record<string, boolean>
  selectedObservationId?: string | null
  onSelectObservation?: (obs: ObservationItem | null) => void
  // Model Data Layers
  activeLayerId?: string
  layerVisibility?: Record<string, boolean>
  scalarFieldData?: ModelFieldResponse | null
  uFieldData?: ModelFieldResponse | null
  vFieldData?: ModelFieldResponse | null
  vectorDensity?: "low" | "medium" | "high"
}

function ControlsHandler({
  zoomTrigger,
  onOrientationChange,
  selectionMode,
}: {
  zoomTrigger?: number
  onOrientationChange?: (heading: number) => void
  selectionMode?: boolean
}) {
  const { camera } = useThree()
  const controlsRef = useRef<any>(null)
  const prevZoomTrigger = useRef(zoomTrigger)

  useEffect(() => {
    if (zoomTrigger === undefined || zoomTrigger === prevZoomTrigger.current) return
    const direction = zoomTrigger > (prevZoomTrigger.current || 0) ? -0.4 : 0.4
    prevZoomTrigger.current = zoomTrigger

    const cam = camera as THREE.PerspectiveCamera
    const newPos = cam.position.clone().add(cam.position.clone().normalize().multiplyScalar(direction))
    if (newPos.length() >= 2.6 && newPos.length() <= 8.5) {
      cam.position.copy(newPos)
    }
  }, [zoomTrigger, camera])

  useFrame(() => {
    if (!onOrientationChange) return
    const camPos = camera.position
    const azimuth = Math.atan2(camPos.x, camPos.z)
    let heading = (azimuth * (180 / Math.PI)) % 360
    if (heading < 0) heading += 360
    onOrientationChange(heading)
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enableRotate={!selectionMode}
      enableZoom={!selectionMode}
      enablePan={false}
      minDistance={2.6}
      maxDistance={8.5}
      rotateSpeed={0.8}
      zoomSpeed={0.9}
      dampingFactor={0.08}
      enableDamping={true}
    />
  )
}

export default function Page3Globe({
  onHoverCoordinates,
  zoomTrigger,
  onOrientationChange,
  selectionMode = false,
  selectedRegion = null,
  onRegionSelect,
  observations = [],
  visibleTypes = { argo: true, glider: true, ctd: true, bgc: true },
  selectedObservationId = null,
  onSelectObservation,
  activeLayerId = "temperature",
  layerVisibility = { temperature: true, salinity: true, currents: true, chlorophyll: true, sla: false },
  scalarFieldData = null,
  uFieldData = null,
  vFieldData = null,
  vectorDensity = "medium",
}: Page3GlobeProps) {
  return (
    <div className="relative w-full h-full min-h-[420px]">
      <Canvas
        camera={{ position: [0, 0.4, 4.8], fov: 42 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
        }}
        className="w-full h-full"
      >
        {/* ─── Satellite Lighting ─── */}
        <ambientLight intensity={0.95} />
        <directionalLight position={[6, 4, 5]} intensity={2.2} color="#ffffff" />
        <directionalLight position={[-5, -2, -4]} intensity={1.1} color="#60a5fa" />
        <directionalLight position={[0, 6, -2]} intensity={0.8} color="#e0f2fe" />

        {/* ─── Earth with Country Boundaries, Real Observations, Model Layer & Selection ─── */}
        <React.Suspense fallback={null}>
          <EarthSphere
            onHoverCoordinates={onHoverCoordinates}
            selectionMode={selectionMode}
            selectedRegion={selectedRegion}
            onRegionSelect={onRegionSelect}
            radius={2}
            observations={observations}
            visibleTypes={visibleTypes}
            selectedObservationId={selectedObservationId}
            onSelectObservation={onSelectObservation}
            activeLayerId={activeLayerId}
            layerVisibility={layerVisibility}
            scalarFieldData={scalarFieldData}
            uFieldData={uFieldData}
            vFieldData={vFieldData}
            vectorDensity={vectorDensity}
          />
        </React.Suspense>

        {/* ─── Camera Controls & Zoom Handlers ─── */}
        <ControlsHandler
          zoomTrigger={zoomTrigger}
          onOrientationChange={onOrientationChange}
          selectionMode={selectionMode}
        />
      </Canvas>
    </div>
  )
}
