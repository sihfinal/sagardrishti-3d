"use client"

import { Suspense, useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import type { Manifest } from "@/types"
import { useOcean } from "@/lib/store"
import Basemap from "./Basemap"
import DepthSlices from "./DepthSlices"
import InstrumentMarkers from "./InstrumentMarkers"
import Isosurface from "./Isosurface"
import Bathymetry from "./Bathymetry"
import ClassClouds from "./ClassClouds"
import Transect from "./Transect"
import VolumeWalls from "./VolumeWalls"
import MarineSnow from "./MarineSnow"
import GodRays from "./GodRays"
import DepthScan from "./DepthScan"
import CurrentVectors from "./CurrentVectors"
import ObservationErrorLayer from "./ObservationErrorLayer"
import TrajectoryTrack from "./TrajectoryTrack"
import { makeMapping } from "./mapping"
import { simClock } from "@/lib/simClock"

const SKY_VERTEX = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vPos;
  uniform vec3 uTop;
  uniform vec3 uBottom;
  void main() {
    float t = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
    float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) / 255.0;
    vec3 col = mix(uBottom, uTop, smoothstep(0.35, 0.85, t)) + d;
    gl_FragColor = vec4(col, 1.0);
  }
`

function SkyDome({ radius }: { radius: number }) {
  const theme = useOcean((s) => s.theme)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color(theme === "dark" ? "#0a1a35" : "#5d7c9c") },
          uBottom: { value: new THREE.Color(theme === "dark" ? "#1e4d77" : "#7c9ebf") },
        },
      }),
    [theme]
  )

  useEffect(() => {
    mat.uniforms.uTop.value.set(theme === "dark" ? "#0a1a35" : "#5d7c9c")
    mat.uniforms.uBottom.value.set(theme === "dark" ? "#1e4d77" : "#7c9ebf")
  }, [theme, mat])

  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[radius, 24, 16]} />
    </mesh>
  )
}

/** Sun elevation slider drives light position + warmth. */
function SunRig() {
  const sunElevation = useOcean((s) => s.sunElevation)
  const theme = useOcean((s) => s.theme)
  const lightRef = useRef<THREE.DirectionalLight>(null)

  useFrame(() => {
    const l = lightRef.current
    if (!l) return
    const el = (sunElevation * Math.PI) / 180
    const R = 120
    l.position.set(Math.cos(el) * R * 0.6, Math.sin(el) * R, Math.cos(el) * R * 0.8)
    const t = Math.min(1, Math.max(0, (sunElevation - 10) / 50))
    l.color.setRGB(1.0, 0.75 + 0.25 * t, 0.5 + 0.5 * t)
    l.intensity = (theme === "dark" ? 0.35 : 0.5) + 0.55 * Math.sin(el)
  })

  return <directionalLight ref={lightRef} intensity={0.6} />
}

/** Smooth camera fly-to when an instrument is selected. */
function CameraRig({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
  const cameraFocus = useOcean((s) => s.cameraFocus)
  const cameraResetTrigger = useOcean((s) => s.cameraResetTrigger)
  const camera = useThree((s) => s.camera)
  
  const isTransitioningRef = useRef(false)
  const transitionProgressRef = useRef(0)
  const startCameraPosRef = useRef(new THREE.Vector3())
  const targetCameraDirRef = useRef(new THREE.Vector3())
  const lastFocusRef = useRef<THREE.Vector3 | null>(null)
  const lastResetRef = useRef(0)

  useEffect(() => {
    if (cameraResetTrigger > lastResetRef.current) {
      lastResetRef.current = cameraResetTrigger
      const focusVec = new THREE.Vector3(10, 16, 26) // Default camera pos
      startCameraPosRef.current.copy(camera.position)
      targetCameraDirRef.current.copy(focusVec).normalize()
      isTransitioningRef.current = true
      transitionProgressRef.current = 0
      return
    }

    if (!cameraFocus) {
      isTransitioningRef.current = false
      return
    }
    const focusVec = new THREE.Vector3(cameraFocus.x, cameraFocus.y, cameraFocus.z)
    if (!lastFocusRef.current || lastFocusRef.current.distanceTo(focusVec) > 0.05) {
      lastFocusRef.current = focusVec.clone()
      startCameraPosRef.current.copy(camera.position)
      targetCameraDirRef.current.copy(focusVec).normalize()
      isTransitioningRef.current = true
      transitionProgressRef.current = 0
    }
  }, [cameraFocus, camera])

  useFrame(() => {
    const controls = controlsRef.current
    if (!controls) return

    // Keep target strictly locked at the center of the globe
    controls.target.set(0, 0, 0)

    if (isTransitioningRef.current && cameraFocus) {
      transitionProgressRef.current += 0.04 // takes ~25 frames (~400ms)
      if (transitionProgressRef.current >= 1.0) {
        isTransitioningRef.current = false
      }
      const k = transitionProgressRef.current
      const currentDist = camera.position.length()
      const targetPos = targetCameraDirRef.current.clone().multiplyScalar(currentDist)
      
      // Interpolate along the sphere surface by maintaining current camera distance
      camera.position.lerpVectors(startCameraPosRef.current, targetPos, k).setLength(currentDist)
      camera.lookAt(0, 0, 0)
      controls.update()
    }
  })

  return null
}

/** Cinematic orbit mode. */
function CinemaRig({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
  const cinemaEnabled = useOcean((s) => s.cinemaEnabled)
  const angle = useRef(0.7)

  useFrame(({ clock }, dt) => {
    if (!cinemaEnabled) return
    const controls = controlsRef.current
    if (!controls) return
    const camera = controls.object as unknown as THREE.PerspectiveCamera
    const target = controls.target
    const radius = camera.position.distanceTo(target)
    angle.current += dt * 0.07
    const bob = Math.sin(clock.elapsedTime * 0.18) * 3
    camera.position.set(
      target.x + Math.cos(angle.current) * radius,
      target.y + radius * 0.45 + bob,
      target.z + Math.sin(angle.current) * radius
    )
    camera.lookAt(target)
    controls.update()
  })
  return null
}

function SimClockRig() {
  useFrame((_, dt) => simClock.advance(dt))
  return null
}

let savedCameraPosition: THREE.Vector3 | null = null

export default function OceanScene({ manifest }: { manifest: Manifest }) {
  const map = makeMapping(manifest.roi)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const camDist = Math.max(map.width, map.depth) * 1.15
  const theme = useOcean((s) => s.theme)
  const snowEnabled = useOcean((s) => s.snowEnabled)
  const raysEnabled = useOcean((s) => s.raysEnabled)
  const scanEnabled = useOcean((s) => s.scanEnabled)
  const quality = useOcean((s) => s.quality)
  const vertExaggeration = useOcean((s) => s.vertExaggeration)
  const maxDepthM =
    manifest.variables.find((v) => v.id === "temp_annual")?.depthsM.slice(-1)[0] ??
    600
  const colHeight = maxDepthM * 50 * 0.00025

  const ORBIT_TARGET = useMemo(() => [0, 0, 0] as [number, number, number], [])

  const cameraConfig = useMemo(() => {
    const defaultPos: [number, number, number] = [camDist * 0.42, camDist * 0.34, camDist * 0.88]
    const pos = savedCameraPosition
      ? [savedCameraPosition.x, savedCameraPosition.y, savedCameraPosition.z] as [number, number, number]
      : defaultPos
    return {
      position: pos,
      fov: 45,
      near: 0.1,
      far: 4000
    }
  }, [camDist])

  return (
    <Canvas
      camera={cameraConfig}
      dpr={[1, quality === "low" ? 1 : 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
      }}
    >
      <fogExp2 attach="fog" args={[theme === "dark" ? "#0d2547" : "#7c9ebf", 0.0035]} />
      <SkyDome radius={camDist * 4} />
      <hemisphereLight
        intensity={theme === "dark" ? 1.0 : 1.25}
        color={theme === "dark" ? "#ffffff" : "#ffffff"}
        groundColor={theme === "dark" ? "#0a1a35" : "#5d7c9c"}
      />
      <SunRig />
      <Suspense fallback={null}>
        <Basemap roi={manifest.roi} />
        <DepthSlices manifest={manifest} />
        <Isosurface manifest={manifest} />
        <Bathymetry manifest={manifest} />
        <ClassClouds manifest={manifest} />
        <Transect manifest={manifest} />
        <VolumeWalls manifest={manifest} />
        <InstrumentMarkers manifest={manifest} />
        <ObservationErrorLayer manifest={manifest} />
        <TrajectoryTrack />
      </Suspense>
      {snowEnabled && (
        <MarineSnow width={map.width} depth={map.depth} height={colHeight * 1.1} count={quality === "high" ? 700 : 350} roi={manifest.roi} />
      )}
      {raysEnabled && quality !== "low" && <GodRays roi={manifest.roi} height={colHeight} vertExaggeration={vertExaggeration} />}
      {scanEnabled && (
        <DepthScan roi={manifest.roi} maxDepthM={maxDepthM} vertExaggeration={vertExaggeration} />
      )}
      <CurrentVectors manifest={manifest} />
      <OrbitControls
        ref={controlsRef}
        target={ORBIT_TARGET}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={35}
        maxDistance={250}
        onChange={(e) => {
          if (e && e.target && e.target.object) {
            const cam = e.target.object as THREE.Camera
            if (!savedCameraPosition) {
              savedCameraPosition = new THREE.Vector3()
            }
            savedCameraPosition.copy(cam.position)
          }
        }}
      />
      <CameraRig controlsRef={controlsRef} />
      <CinemaRig controlsRef={controlsRef} />
      <SimClockRig />
    </Canvas>
  )
}
