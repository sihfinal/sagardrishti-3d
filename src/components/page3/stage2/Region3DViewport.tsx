"use client"

import React, { useState, useRef, useMemo, useEffect, useCallback } from "react"
import * as THREE from "three"
import { GeographicBounds } from "../globe/RegionSelectionBox"
import { ObservationItem } from "@/lib/observationsApi"
import { ModelFieldResponse } from "@/lib/modelApi"
import { ModelControlState } from "./ModelControlPanel"
import { buildLut, cssGradient, PaletteId } from "@/lib/colormaps"
import { extractIsosurface } from "@/lib/marchingCubes"
import { createVolumeMesh } from "@/lib/volumeRenderer"

interface Region3DViewportProps {
  selectedRegion: GeographicBounds | null
  modelState: ModelControlState
  depthStack: ModelFieldResponse[]
  uDepthStack: ModelFieldResponse[]
  vDepthStack: ModelFieldResponse[]
  modelLoading: boolean
  modelError: string | null
  observations: ObservationItem[]
  obsLoading: boolean
  obsError: string | null
  onSelectObservation?: (obs: ObservationItem) => void
  isMaximized?: boolean
  onToggleMaximize?: () => void
}

export default function Region3DViewport({
  selectedRegion,
  modelState,
  depthStack,
  uDepthStack,
  vDepthStack,
  modelLoading,
  modelError,
  observations,
  obsLoading,
  obsError,
  onSelectObservation,
  isMaximized: isMaximizedProp,
  onToggleMaximize,
}: Region3DViewportProps) {
  const [isNavActive, setIsNavActive] = useState<boolean>(true)
  const [hoveredObs, setHoveredObs] = useState<ObservationItem | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [viewMode, setViewMode] = useState<"3d" | "top" | "side">("3d")
  const [internalMaximized, setInternalMaximized] = useState<boolean>(false)

  const isMaximized = isMaximizedProp !== undefined ? isMaximizedProp : internalMaximized
  const toggleMaximize = onToggleMaximize || (() => setInternalMaximized((prev) => !prev))

  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const markerMeshesRef = useRef<{ mesh: THREE.Mesh; obs: ObservationItem }[]>([])
  const volumeHandleRef = useRef<{ updateCameraPos: (camPos: THREE.Vector3) => void; dispose: () => void } | null>(null)
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const mouseVecRef = useRef<THREE.Vector2>(new THREE.Vector2())

  const pointerDownRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 })

  const verticalExaggeration = modelState.verticalExaggeration || 7

  const controlsRef = useRef<{
    isDragging: boolean
    isRightDragging: boolean
    prevX: number
    prevY: number
    rotX: number
    rotY: number
    distance: number
    panX: number
    panY: number
  }>({
    isDragging: false,
    isRightDragging: false,
    prevX: 0,
    prevY: 0,
    rotX: 0.55,
    rotY: -0.65,
    distance: 24,
    panX: 0,
    panY: 0,
  })

  const bounds = useMemo(() => {
    if (!selectedRegion) {
      return { latMin: -18.0, latMax: -5.0, lonMin: 65.0, lonMax: 85.0 }
    }
    return {
      latMin: Math.min(selectedRegion.latMin, selectedRegion.latMax),
      latMax: Math.max(selectedRegion.latMin, selectedRegion.latMax),
      lonMin: Math.min(selectedRegion.lonMin, selectedRegion.lonMax),
      lonMax: Math.max(selectedRegion.lonMin, selectedRegion.lonMax),
    }
  }, [selectedRegion])

  const latSpan = bounds.latMax - bounds.latMin || 1
  const lonSpan = bounds.lonMax - bounds.lonMin || 1

  const validObservations = useMemo(() => {
    return observations.filter(
      (obs) =>
        obs.latitude >= bounds.latMin &&
        obs.latitude <= bounds.latMax &&
        obs.longitude >= bounds.lonMin &&
        obs.longitude <= bounds.lonMax
    )
  }, [observations, bounds])

  const formatCoord = (val: number, isLat: boolean) => {
    if (isLat) {
      return val >= 0 ? `${val.toFixed(2)}°N` : `${Math.abs(val).toFixed(2)}°S`
    }
    return val >= 0 ? `${val.toFixed(2)}°E` : `${Math.abs(val).toFixed(2)}°W`
  }

  const getDateStr = (index: number) => {
    const baseDate = new Date(Date.UTC(2026, 0, 1))
    baseDate.setUTCDate(baseDate.getUTCDate() + index)
    const day = baseDate.getUTCDate().toString().padStart(2, "0")
    const month = baseDate.toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    const year = baseDate.getUTCFullYear()
    return `${day} ${month} ${year}`
  }

  const isCurrents = modelState.variable === "currents"
  const palette: PaletteId =
    modelState.variable === "salinity"
      ? "viridis"
      : modelState.variable === "chlorophyll"
      ? "plasma"
      : "turbo"

  const gradient = cssGradient(palette, 32)

  // Find nearest actual resolved depth from loaded depth stack
  const resolvedSlice = useMemo(() => {
    if (depthStack.length === 0) return null
    return depthStack.reduce((prev, curr) =>
      Math.abs((curr.depth ?? 0) - modelState.depth) < Math.abs((prev.depth ?? 0) - modelState.depth)
        ? curr
        : prev
    )
  }, [depthStack, modelState.depth])

  const resolvedDepth = resolvedSlice?.depth ?? modelState.depth
  const primarySlice = resolvedSlice || depthStack[0]

  // Default isovalue according to variable
  const activeIsovalue = useMemo(() => {
    if (modelState.isosurfaceValue !== undefined) return modelState.isosurfaceValue
    if (modelState.variable === "temperature") return 26.0
    if (modelState.variable === "salinity") return 35.0
    if (modelState.variable === "chlorophyll") return 0.3
    return 0.35 // currents speed (m/s)
  }, [modelState.isosurfaceValue, modelState.variable])

  // Initialize Three.js WebGL Scene (Single idempotent lifecycle)
  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x020712)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Ambient & Directional Lights
    const ambLight = new THREE.AmbientLight(0xffffff, 1.4)
    scene.add(ambLight)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(12, 24, 16)
    scene.add(dirLight)

    let reqId: number
    const updateCamera = () => {
      const { rotX, rotY, distance, panX, panY } = controlsRef.current
      const x = distance * Math.cos(rotX) * Math.sin(rotY) + panX
      const y = distance * Math.sin(rotX) + panY
      const z = distance * Math.cos(rotX) * Math.cos(rotY)
      camera.position.set(x, y, z)
      camera.lookAt(panX, panY - 2.5, 0)

      // Update volume ray-marcher camera origin
      if (volumeHandleRef.current) {
        volumeHandleRef.current.updateCameraPos(camera.position)
      }
    }

    const animate = () => {
      reqId = requestAnimationFrame(animate)
      updateCamera()
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!container || !renderer || !camera) return
      const w = container.clientWidth
      const h = container.clientHeight
      if (w === 0 || h === 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener("resize", handleResize)

    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(container)

    return () => {
      window.removeEventListener("resize", handleResize)
      resizeObserver.disconnect()
      cancelAnimationFrame(reqId)
      if (volumeHandleRef.current) {
        volumeHandleRef.current.dispose()
        volumeHandleRef.current = null
      }
      const canvas = renderer.domElement
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas)
      }
      renderer.dispose()
    }
  }, [])

  // Build 3D Model Depth Planes, Currents Vectors, Real Isosurfaces, 3D Volume, and Depth Cage
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    // Clean previous volume instance
    if (volumeHandleRef.current) {
      volumeHandleRef.current.dispose()
      volumeHandleRef.current = null
    }

    // Clear previous dynamic 3D objects
    const toRemove: THREE.Object3D[] = []
    scene.traverse((child) => {
      if (child.name === "model3d_layer") {
        toRemove.push(child)
      }
    })
    toRemove.forEach((obj) => {
      scene.remove(obj)
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose()
    })

    const rootGroup = new THREE.Group()
    rootGroup.name = "model3d_layer"

    // 3D Scene Scaling: X = Lon [-6, +6], Z = Lat [-4, +4], Y = -Depth [0, -maxZDepth]
    const planeW = 12
    const planeH = 8
    const maxZDepth = verticalExaggeration // Dynamic vertical exaggeration scale (1 to 10)
    const lut = buildLut(palette, 256)

    // 1. Create Bounding Volume Grid & Depth Axis Reference Cage
    const cageGeo = new THREE.BoxGeometry(planeW, maxZDepth, planeH)
    const cageEdges = new THREE.EdgesGeometry(cageGeo)
    const cageMat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.35 })
    const cageMesh = new THREE.LineSegments(cageEdges, cageMat)
    cageMesh.position.set(0, -maxZDepth / 2, 0)
    rootGroup.add(cageMesh)

    // 2. Render Real Depth Slices (Scalar: Temp / Sal / Chl)
    if (!isCurrents && depthStack.length > 0) {
      const slicesToRender = modelState.showDepthSlices
        ? depthStack
        : resolvedSlice
        ? [resolvedSlice]
        : [depthStack[0]]

      slicesToRender.forEach((slice) => {
        if (!slice.values || slice.values.length === 0) return

        const depthMeters = slice.depth ?? 0
        const yPos = -Math.min(1.0, depthMeters / 1000) * maxZDepth

        const width = slice.width
        const height = slice.height

        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const imgData = ctx.createImageData(width, height)
        const data = imgData.data

        const minV = slice.min_value ?? 0
        const maxV = slice.max_value ?? 1
        const span = maxV - minV || 1

        for (let r = 0; r < height; r++) {
          const latIdx = height - 1 - r
          const row = slice.values[latIdx]
          if (!row) continue

          for (let c = 0; c < width; c++) {
            const val = row[c]
            const pxIdx = (r * width + c) * 4

            if (val === null || val === undefined || isNaN(val)) {
              data[pxIdx + 3] = 0 // Transparent land/missing
            } else {
              const t = Math.max(0, Math.min(1, (val - minV) / span))
              const lutIdx = Math.min(255, Math.floor(t * 255))
              data[pxIdx] = lut[lutIdx * 3]
              data[pxIdx + 1] = lut[lutIdx * 3 + 1]
              data[pxIdx + 2] = lut[lutIdx * 3 + 2]
              data[pxIdx + 3] = modelState.show3DVolume
                ? 80
                : modelState.showIsosurfaces
                ? 160
                : 230
            }
          }
        }
        ctx.putImageData(imgData, 0, 0)

        const texture = new THREE.CanvasTexture(canvas)
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter

        const isSelected = Math.abs(depthMeters - resolvedDepth) < 1.0
        const planeMat = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: isSelected ? (modelState.show3DVolume ? 0.75 : 0.98) : (modelState.show3DVolume ? 0.35 : 0.65),
          side: THREE.DoubleSide,
          depthWrite: false,
        })

        const planeGeo = new THREE.PlaneGeometry(planeW, planeH)
        const planeMesh = new THREE.Mesh(planeGeo, planeMat)
        planeMesh.rotation.x = -Math.PI / 2
        planeMesh.position.set(0, yPos, 0)
        rootGroup.add(planeMesh)

        // Depth Contour Border with high-quality outline
        const borderGeo = new THREE.EdgesGeometry(planeGeo)
        const borderMat = new THREE.LineBasicMaterial({
          color: isSelected ? 0x38bdf8 : 0x0369a1,
          transparent: true,
          opacity: isSelected ? 0.95 : 0.35,
          linewidth: isSelected ? 2 : 1,
        })
        const borderMesh = new THREE.LineSegments(borderGeo, borderMat)
        borderMesh.rotation.x = -Math.PI / 2
        borderMesh.position.set(0, yPos, 0)
        rootGroup.add(borderMesh)
      })
    }

    // 3. Render Stack of Real 3D Current Velocity Vectors (uo + vo)
    if (isCurrents && modelState.showCurrentVectors && uDepthStack.length > 0 && vDepthStack.length > 0) {
      const turboLut = buildLut("turbo", 256)
      const density = modelState.vectorDensity || 60
      const step = Math.max(1, Math.round(7 - (density / 100) * 5))

      const indicesToRender = modelState.showDepthSlices
        ? uDepthStack.map((_, i) => i)
        : [
            uDepthStack.findIndex((u) => Math.abs((u.depth ?? 0) - resolvedDepth) < 1.0) !== -1
              ? uDepthStack.findIndex((u) => Math.abs((u.depth ?? 0) - resolvedDepth) < 1.0)
              : 0,
          ]

      indicesToRender.forEach((idx) => {
        const uSlice = uDepthStack[idx]
        const vSlice = vDepthStack[idx]
        if (!uSlice || !vSlice || !uSlice.values || !vSlice.values) return

        const depthMeters = uSlice.depth ?? 0
        const yPos = -Math.min(1.0, depthMeters / 1000) * maxZDepth

        const uVals = uSlice.values
        const vVals = vSlice.values
        const gridH = uVals.length
        const gridW = uVals[0]?.length || 0
        if (gridH === 0 || gridW === 0) return

        const linePositions: number[] = []
        const lineColors: number[] = []

        for (let r = 0; r < gridH; r += step) {
          const latIdx = gridH - 1 - r
          const uRow = uVals[latIdx]
          const vRow = vVals[latIdx]
          if (!uRow || !vRow) continue

          const zCoord = (r / gridH - 0.5) * planeH

          for (let c = 0; c < gridW; c += step) {
            const u = uRow[c]
            const v = vRow[c]
            if (u === null || v === null || isNaN(u) || isNaN(v)) continue

            const xCoord = (c / gridW - 0.5) * planeW
            const speed = Math.sqrt(u * u + v * v)
            if (speed < 0.01) continue

            const len = Math.max(0.22, Math.min(1.2, speed * 1.5))
            const angle = Math.atan2(-v, u)

            const dx = Math.cos(angle) * len
            const dz = Math.sin(angle) * len

            const tipX = xCoord + dx
            const tipZ = zCoord + dz

            const headSize = len * 0.28
            const fin1X = tipX + Math.cos(angle + 2.5) * headSize
            const fin1Z = tipZ + Math.sin(angle + 2.5) * headSize
            const fin2X = tipX + Math.cos(angle - 2.5) * headSize
            const fin2Z = tipZ + Math.sin(angle - 2.5) * headSize

            const t = Math.max(0, Math.min(1, speed / 1.0))
            const lutIdx = Math.min(255, Math.floor(t * 255))
            const cr = turboLut[lutIdx * 3] / 255
            const cg = turboLut[lutIdx * 3 + 1] / 255
            const cb = turboLut[lutIdx * 3 + 2] / 255

            // Main arrow shaft
            linePositions.push(xCoord, yPos, zCoord)
            linePositions.push(tipX, yPos, tipZ)
            lineColors.push(cr, cg, cb, cr, cg, cb)

            // Arrowhead fin 1
            linePositions.push(tipX, yPos, tipZ)
            linePositions.push(fin1X, yPos, fin1Z)
            lineColors.push(cr, cg, cb, cr, cg, cb)

            // Arrowhead fin 2
            linePositions.push(tipX, yPos, tipZ)
            linePositions.push(fin2X, yPos, fin2Z)
            lineColors.push(cr, cg, cb, cr, cg, cb)
          }
        }

        if (linePositions.length > 0) {
          const linesGeo = new THREE.BufferGeometry()
          linesGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3))
          linesGeo.setAttribute("color", new THREE.Float32BufferAttribute(lineColors, 3))

          const linesMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.92,
          })
          const linesMesh = new THREE.LineSegments(linesGeo, linesMat)
          rootGroup.add(linesMesh)
        }
      })
    }

    // 4. REAL 3D MARCHING CUBES ISOSURFACE EXTRACTION
    if (modelState.showIsosurfaces) {
      let grid3D: (number | null | undefined)[][][] = []
      let depthLevels: number[] = []

      if (!isCurrents && depthStack.length >= 2) {
        grid3D = depthStack.map((s) => s.values)
        depthLevels = depthStack.map((s) => s.depth ?? 0)
      } else if (isCurrents && uDepthStack.length >= 2 && vDepthStack.length >= 2) {
        grid3D = uDepthStack.map((uSlice, dIdx) => {
          const vSlice = vDepthStack[dIdx]
          const uVals = uSlice.values || []
          const vVals = vSlice?.values || []
          return uVals.map((uRow, rIdx) => {
            const vRow = vVals[rIdx] || []
            return uRow.map((uVal, cIdx) => {
              const vVal = vRow[cIdx]
              if (uVal === null || vVal === null || uVal === undefined || vVal === undefined || isNaN(uVal) || isNaN(vVal)) {
                return null
              }
              return Math.sqrt(uVal * uVal + vVal * vVal)
            })
          })
        })
        depthLevels = uDepthStack.map((s) => s.depth ?? 0)
      }

      if (grid3D.length >= 2) {
        const isoGeo = extractIsosurface(
          grid3D,
          depthLevels,
          activeIsovalue,
          planeW,
          planeH,
          maxZDepth
        )

        if (isoGeo) {
          let col = 0x38bdf8
          if (modelState.variable === "temperature") {
            const t = Math.max(0, Math.min(1, (activeIsovalue - 15) / 17))
            const idx = Math.min(255, Math.floor(t * 255))
            col = (lut[idx * 3] << 16) | (lut[idx * 3 + 1] << 8) | lut[idx * 3 + 2]
          } else if (modelState.variable === "salinity") {
            const t = Math.max(0, Math.min(1, (activeIsovalue - 33.0) / 3.5))
            const idx = Math.min(255, Math.floor(t * 255))
            col = (lut[idx * 3] << 16) | (lut[idx * 3 + 1] << 8) | lut[idx * 3 + 2]
          } else if (modelState.variable === "chlorophyll") {
            const t = Math.max(0, Math.min(1, (activeIsovalue - 0.02) / 1.98))
            const idx = Math.min(255, Math.floor(t * 255))
            col = (lut[idx * 3] << 16) | (lut[idx * 3 + 1] << 8) | lut[idx * 3 + 2]
          } else if (isCurrents) {
            const t = Math.max(0, Math.min(1, activeIsovalue / 1.0))
            const idx = Math.min(255, Math.floor(t * 255))
            col = (lut[idx * 3] << 16) | (lut[idx * 3 + 1] << 8) | lut[idx * 3 + 2]
          }

          const isoMat = new THREE.MeshStandardMaterial({
            color: col,
            roughness: 0.35,
            metalness: 0.15,
            transparent: true,
            opacity: 0.84,
            side: THREE.DoubleSide,
            depthWrite: true,
          })

          const isoMesh = new THREE.Mesh(isoGeo, isoMat)
          rootGroup.add(isoMesh)

          const wireMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.18,
          })
          const wireMesh = new THREE.Mesh(isoGeo, wireMat)
          rootGroup.add(wireMesh)
        }
      }
    }

    // 5. TRUE 3D VOLUMETRIC RAY-MARCHING RENDERING
    if (modelState.show3DVolume) {
      let stackForVolume: ModelFieldResponse[] = []
      if (!isCurrents && depthStack.length >= 2) {
        stackForVolume = depthStack
      } else if (isCurrents && uDepthStack.length >= 2 && vDepthStack.length >= 2) {
        // Construct true speed magnitude slices for volumetric currents rendering: speed = sqrt(uo² + vo²)
        stackForVolume = uDepthStack.map((uSlice, dIdx) => {
          const vSlice = vDepthStack[dIdx]
          const uVals = uSlice.values || []
          const vVals = vSlice?.values || []
          let sliceMin = Infinity
          let sliceMax = -Infinity
          const speedVals = uVals.map((uRow, rIdx) => {
            const vRow = vVals[rIdx] || []
            return uRow.map((uVal, cIdx) => {
              const vVal = vRow[cIdx]
              if (uVal === null || vVal === null || uVal === undefined || vVal === undefined || isNaN(uVal) || isNaN(vVal)) {
                return null
              }
              const speed = Math.sqrt(uVal * uVal + vVal * vVal)
              if (speed < sliceMin) sliceMin = speed
              if (speed > sliceMax) sliceMax = speed
              return speed
            })
          })
          return {
            ...uSlice,
            values: speedVals,
            min_value: isFinite(sliceMin) ? sliceMin : 0.0,
            max_value: isFinite(sliceMax) ? sliceMax : 1.0,
            unit: "m/s",
          }
        })
      }

      if (stackForVolume.length >= 2) {
        const vol = createVolumeMesh(
          stackForVolume,
          palette,
          planeW,
          planeH,
          maxZDepth
        )
        if (vol) {
          volumeHandleRef.current = vol
          if (cameraRef.current) {
            vol.updateCameraPos(cameraRef.current.position)
          }
          rootGroup.add(vol.mesh)
        }
      }
    }

    // 6. In-Situ Observation Markers (Clickable & Hoverable in 3D)
    markerMeshesRef.current = []
    validObservations.forEach((obs) => {
      const xRel = (obs.longitude - bounds.lonMin) / lonSpan - 0.5
      const zRel = (bounds.latMax - obs.latitude) / latSpan - 0.5

      const markerX = xRel * planeW
      const markerZ = zRel * planeH
      const markerY = 0.08

      const isArgo = obs.type === "argo"
      const isGlider = obs.type === "glider"
      const isCtd = obs.type === "ctd"
      const col = isArgo ? 0x22c55e : isGlider ? 0x06b6d4 : isCtd ? 0xf97316 : 0xa855f7

      const sphereGeo = new THREE.SphereGeometry(0.24, 16, 16)
      const sphereMat = new THREE.MeshBasicMaterial({ color: col })
      const markerMesh = new THREE.Mesh(sphereGeo, sphereMat)
      markerMesh.position.set(markerX, markerY, markerZ)
      rootGroup.add(markerMesh)

      markerMeshesRef.current.push({ mesh: markerMesh, obs })
    })

    scene.add(rootGroup)
  }, [
    depthStack,
    uDepthStack,
    vDepthStack,
    isCurrents,
    palette,
    resolvedDepth,
    modelState.showDepthSlices,
    modelState.show3DVolume,
    modelState.showIsosurfaces,
    modelState.showCurrentVectors,
    activeIsovalue,
    modelState.vectorDensity,
    verticalExaggeration,
    validObservations,
    bounds,
    latSpan,
    lonSpan,
  ])

  // Mouse / Pointer Event Handling for 3D Navigation vs Instrument Selection
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now() }
    if (isNavActive) {
      if (e.button === 2) {
        controlsRef.current.isRightDragging = true
      } else {
        controlsRef.current.isDragging = true
      }
      controlsRef.current.prevX = e.clientX
      controlsRef.current.prevY = e.clientY
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = mountRef.current
    const camera = cameraRef.current
    if (!container || !camera) return

    // 1. Check Raycasting against observation markers for hover tooltip (in selection mode)
    if (!isNavActive) {
      const rect = container.getBoundingClientRect()
      const xNdc = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const yNdc = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      mouseVecRef.current.set(xNdc, yNdc)
      raycasterRef.current.setFromCamera(mouseVecRef.current, camera)

      const meshes = markerMeshesRef.current.map((m) => m.mesh)
      const intersects = raycasterRef.current.intersectObjects(meshes)

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object
        const item = markerMeshesRef.current.find((m) => m.mesh === hitMesh)
        if (item) {
          setHoveredObs(item.obs)
          setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        }
      } else {
        setHoveredObs(null)
        setTooltipPos(null)
      }
    } else {
      setHoveredObs(null)
      setTooltipPos(null)
    }

    // 2. Camera Orbit / Pan Navigation (in Hand navigation mode)
    if (isNavActive) {
      const { isDragging, isRightDragging, prevX, prevY } = controlsRef.current
      if (!isDragging && !isRightDragging) return

      const dx = e.clientX - prevX
      const dy = e.clientY - prevY
      controlsRef.current.prevX = e.clientX
      controlsRef.current.prevY = e.clientY

      if (isDragging) {
        controlsRef.current.rotY += dx * 0.008
        controlsRef.current.rotX = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, controlsRef.current.rotX + dy * 0.008))
      } else if (isRightDragging) {
        controlsRef.current.panX -= dx * 0.02
        controlsRef.current.panY += dy * 0.02
      }
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    controlsRef.current.isDragging = false
    controlsRef.current.isRightDragging = false

    const down = pointerDownRef.current
    const distMoved = Math.hypot(e.clientX - down.x, e.clientY - down.y)

    // In Marker Selection mode (when hand tool is deselected)
    if (!isNavActive && distMoved < 6) {
      const container = mountRef.current
      const camera = cameraRef.current
      if (!container || !camera) return

      const rect = container.getBoundingClientRect()
      const xNdc = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const yNdc = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      mouseVecRef.current.set(xNdc, yNdc)
      raycasterRef.current.setFromCamera(mouseVecRef.current, camera)

      const meshes = markerMeshesRef.current.map((m) => m.mesh)
      const intersects = raycasterRef.current.intersectObjects(meshes)

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object
        const item = markerMeshesRef.current.find((m) => m.mesh === hitMesh)
        if (item) {
          onSelectObservation?.(item.obs)
        }
      }
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (isNavActive) {
      controlsRef.current.distance = Math.max(8, Math.min(50, controlsRef.current.distance + e.deltaY * 0.03))
    }
  }

  const setCameraPreset = (preset: "3d" | "top" | "side") => {
    setViewMode(preset)
    if (preset === "3d") {
      controlsRef.current.rotX = 0.55
      controlsRef.current.rotY = -0.65
      controlsRef.current.distance = 24
      controlsRef.current.panX = 0
      controlsRef.current.panY = 0
    } else if (preset === "top") {
      controlsRef.current.rotX = Math.PI / 2 - 0.02
      controlsRef.current.rotY = 0
      controlsRef.current.distance = 20
      controlsRef.current.panX = 0
      controlsRef.current.panY = 0
    } else if (preset === "side") {
      controlsRef.current.rotX = 0.1
      controlsRef.current.rotY = -Math.PI / 2
      controlsRef.current.distance = 22
      controlsRef.current.panX = 0
      controlsRef.current.panY = -2
    }
  }

  const activeLabel =
    modelState.variable === "salinity"
      ? "Salinity"
      : modelState.variable === "chlorophyll"
      ? "Chlorophyll"
      : modelState.variable === "currents"
      ? "Current Speed"
      : "Temperature"

  const activeUnit = isCurrents ? "m/s" : primarySlice?.unit || ""

  return (
    <div
      className="relative w-full h-full min-h-[500px] flex flex-col justify-between overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-b from-[#030914] via-[#051124] to-[#02060e] shadow-2xl p-4 select-none"
    >
      {/* ─── Top Header: Selected Region & Synchronized Model Coordinates ─── */}
      <div className="relative z-20 flex flex-col items-center justify-center text-center">
        <h2 className="text-sm md:text-base font-black text-white tracking-tight flex items-center gap-2">
          <span>SELECTED REGION — 3D DEPTH-RESOLVED OCEAN MODEL</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            {modelState.show3DVolume
              ? "3D VOLUMETRIC RAY MARCHING"
              : modelState.showIsosurfaces
              ? `ISOSURFACE (${activeIsovalue.toFixed(modelState.variable === "chlorophyll" ? 2 : 1)} ${activeUnit})`
              : modelState.showDepthSlices
              ? "7 DEPTH LEVELS (0–1000m)"
              : "SINGLE DEPTH SLICE"}{" "}
            · {verticalExaggeration}× VE
          </span>
        </h2>
        <div className="flex items-center gap-2 text-[11px] font-mono font-semibold text-sky-300 mt-0.5 tracking-wider flex-wrap justify-center">
          <span>Lat: {formatCoord(bounds.latMin, true)} → {formatCoord(bounds.latMax, true)}</span>
          <span>·</span>
          <span>Lon: {formatCoord(bounds.lonMin, false)} → {formatCoord(bounds.lonMax, false)}</span>
          <span>·</span>
          <span className="text-emerald-400">
            Selected Depth: {modelState.depth} m (Resolved:{" "}
            {resolvedDepth <= 5
              ? "0 m"
              : resolvedDepth <= 35
              ? "25 m"
              : resolvedDepth <= 65
              ? "50 m"
              : resolvedDepth <= 150
              ? "100 m"
              : resolvedDepth <= 350
              ? "250 m"
              : resolvedDepth <= 750
              ? "500 m"
              : resolvedDepth <= 1250
              ? "1000 m"
              : `${Math.round(resolvedDepth)} m`}
            )
          </span>
          <span>·</span>
          <span className="text-white">{getDateStr(modelState.timeStepIndex)}</span>
        </div>
      </div>

      {/* ─── Center: 3D Depth-Resolved WebGL Viewport ─── */}
      <div
        className={`relative flex-1 w-full h-full min-h-[320px] my-3 rounded-xl border border-sky-500/30 bg-[#020712] shadow-inner flex items-center justify-center overflow-hidden ${
          isNavActive ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* WebGL Canvas Mount */}
        <div ref={mountRef} className="absolute inset-0 w-full h-full pointer-events-auto" />

        {/* Loading Indicator */}
        {modelLoading && (
          <div className="absolute top-4 left-14 z-30 px-3 py-1.5 rounded-lg bg-[#081a33]/90 border border-sky-400/50 text-sky-300 text-[10px] font-mono font-bold flex items-center gap-2 shadow-lg backdrop-blur-md">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
            <span>Loading 3D CMEMS {modelState.variable} depth planes…</span>
          </div>
        )}

        {/* Error Indicator */}
        {modelError && (
          <div className="absolute top-4 left-14 z-30 px-3 py-1.5 rounded-lg bg-rose-950/90 border border-rose-500/50 text-rose-300 text-[10px] font-mono font-bold shadow-lg">
            {modelError}
          </div>
        )}

        {/* Tiny Hand Navigation Tool (Top-Left) */}
        <div className="absolute top-4 left-4 z-30">
          <button
            type="button"
            onClick={() => setIsNavActive((prev) => !prev)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all border shadow-lg backdrop-blur-md ${
              isNavActive
                ? "bg-sky-500 border-sky-300 text-white shadow-sky-500/30 ring-1 ring-sky-400"
                : "bg-[#081a33]/90 border-sky-500/30 text-slate-300 hover:text-white hover:border-sky-400"
            }`}
            title={
              isNavActive
                ? "Hand Tool Active (Drag to Orbit/Pan, Scroll to Zoom). Click to switch to Marker Selection."
                : "Marker Selection Mode (Click markers to inspect profiles). Click to enable 3D Orbit/Zoom."
            }
          >
            ✋
          </button>
        </div>

        {/* Maximize / Minimize Fullpage Toggle Button (Bottom-Left) */}
        <div className="absolute bottom-4 left-4 z-30">
          <button
            type="button"
            onClick={toggleMaximize}
            className="px-2.5 py-1.5 rounded-lg bg-[#081a33]/90 border border-sky-500/40 hover:border-sky-400 text-slate-200 hover:text-white text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-all active:scale-95"
            title={isMaximized ? "Minimize to original space" : "Maximize 3D model to full page"}
          >
            <span className="text-sky-300 text-xs">{isMaximized ? "🗗" : "⛶"}</span>
            <span>{isMaximized ? "Minimize" : "Maximize"}</span>
          </button>
        </div>

        {/* Camera Perspective Switcher Buttons (Bottom-Right) */}
        <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1.5 bg-[#081a33]/90 border border-sky-500/30 rounded-lg p-1 shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => setCameraPreset("3d")}
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-all ${
              viewMode === "3d" ? "bg-sky-500 text-white shadow" : "text-slate-300 hover:text-white"
            }`}
          >
            3D Oblique
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("top")}
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-all ${
              viewMode === "top" ? "bg-sky-500 text-white shadow" : "text-slate-300 hover:text-white"
            }`}
          >
            Top Surface
          </button>
          <button
            type="button"
            onClick={() => setCameraPreset("side")}
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold transition-all ${
              viewMode === "side" ? "bg-sky-500 text-white shadow" : "text-slate-300 hover:text-white"
            }`}
          >
            Side Profile
          </button>
        </div>

        {/* Synchronized Vertical Depth Reference Axis (Left side of 3D Scene) */}
        <div className="absolute top-16 left-4 z-20 pointer-events-none flex flex-col justify-between h-56 border-l-2 border-sky-400/40 pl-2 font-mono text-[9px] text-sky-300">
          {[0, 50, 100, 200, 400, 800, 1200, 1600, 2000].map((depthTick) => {
            const nearestTick = [0, 50, 100, 200, 400, 800, 1200, 1600, 2000].reduce((prev, curr) =>
              Math.abs(curr - modelState.depth) < Math.abs(prev - modelState.depth) ? curr : prev
            )
            const isSelected = depthTick === nearestTick
            return (
              <div
                key={depthTick}
                className={`flex items-center gap-1.5 transition-colors ${
                  isSelected ? "text-emerald-400 font-bold" : "text-sky-300/70"
                }`}
              >
                <span className={`h-0.5 ${isSelected ? "w-3 bg-emerald-400 shadow-[0_0_6px_#34d399]" : "w-1.5 bg-sky-400/50"}`} />
                <span>
                  {depthTick} m {isSelected ? "(Selected)" : ""}
                </span>
              </div>
            )
          })}
        </div>

        {/* Dynamic Floating Colorbar Scale (Top-Right inside map - Authoritative single legend) */}
        {primarySlice || (isCurrents && uDepthStack.length > 0) ? (
          <div className="absolute top-2 right-2 z-20 bg-[#081a33]/90 border border-sky-400/40 rounded-lg p-2 shadow-xl backdrop-blur-md flex flex-col gap-1 w-44">
            <div className="flex items-center justify-between text-[9px] font-mono font-bold text-white">
              <span>{activeLabel} {activeUnit && `(${activeUnit})`}</span>
              <span className="text-sky-300">
                {isCurrents
                  ? "0.0 → 1.0 m/s"
                  : `${primarySlice?.min_value?.toFixed(2)} → ${primarySlice?.max_value?.toFixed(2)}`}
              </span>
            </div>
            <div
              className="w-full h-2 rounded shadow-inner border border-white/20"
              style={{ background: gradient }}
            />
            <div className="flex justify-between text-[8px] font-mono text-slate-300">
              <span>{isCurrents ? "0.0" : primarySlice?.min_value?.toFixed(1)}</span>
              <span>
                {isCurrents
                  ? "0.5"
                  : ((primarySlice?.min_value! + primarySlice?.max_value!) / 2).toFixed(1)}
              </span>
              <span>
                {isCurrents ? "1.0 m/s" : `${primarySlice?.max_value?.toFixed(1)} ${activeUnit}`}
              </span>
            </div>
          </div>
        ) : null}

        {/* Live Observation Marker Tooltip */}
        {hoveredObs && tooltipPos && (
          <div
            style={{
              left: `${Math.min(window.innerWidth - 220, tooltipPos.x + 12)}px`,
              top: `${Math.max(10, tooltipPos.y - 45)}px`,
            }}
            className="absolute z-50 pointer-events-none bg-[#081a33]/95 border border-sky-400/50 rounded-lg px-2.5 py-1.5 shadow-2xl text-[10px] font-mono backdrop-blur-md"
          >
            <div className="flex items-center gap-1.5 text-white font-bold">
              <span className="uppercase text-sky-300">{hoveredObs.type}</span>
              <span>#{hoveredObs.platform_id}</span>
            </div>
            <div className="text-slate-300">
              {formatCoord(hoveredObs.latitude, true)}, {formatCoord(hoveredObs.longitude, false)}
            </div>
            <div className="text-emerald-400 text-[9px] font-semibold mt-0.5">
              Click to inspect vertical profile graph
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom Status Bar ─── */}
      <div className="relative z-20 flex items-center justify-between pt-1 font-mono text-[10px]">
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-full bg-[#081a33]/90 border border-sky-400/40 text-sky-300 font-bold tracking-wider uppercase backdrop-blur-md">
            STAGE 2.6: {modelState.show3DVolume ? "3D VOLUMETRIC RAY MARCHING" : modelState.showIsosurfaces ? "3D MARCHING CUBES ISOSURFACE" : modelState.showDepthSlices ? "3D DEPTH SLICES" : "SINGLE SLICE"} ({verticalExaggeration}× VE)
          </div>
          <span className="text-slate-400 text-[9px] hidden sm:inline font-mono">
            Mode: {isNavActive ? "NAVIGATE" : "SELECT"} · Depth: {resolvedDepth.toFixed(1)}m
          </span>
        </div>

        <div className="px-3 py-1 rounded-md bg-[#040e1b]/85 border border-slate-700/60 text-slate-300 font-semibold">
          {validObservations.length} in-situ profiles inside ROI
        </div>
      </div>
    </div>
  )
}
