"use client"

/**
 * Depth-scan sweep (upgrade M2): a glowing ring plane sweeps repeatedly
 * from surface to the bottom of the volume, highlighting each depth.
 */
import { useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import type { Roi } from "@/types"
import { SPHERE_RADIUS } from "./mapping"

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uPulse;
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c);
    float edge = smoothstep(0.5, 0.46, d) * smoothstep(0.40, 0.46, d);
    gl_FragColor = vec4(0.55, 0.95, 1.0, edge * (0.55 + uPulse * 0.45));
  }
`

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export default function DepthScan({
  roi,
  maxDepthM,
  vertExaggeration,
  periodSec = 7,
}: {
  roi: Roi
  maxDepthM: number
  vertExaggeration: number
  periodSec?: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.ShaderMaterial>(null)

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    const mat = matRef.current
    if (!mesh || !mat) return
    const phase = (clock.elapsedTime % periodSec) / periodSec
    // sweep top → bottom with eased ends
    const eased = phase < 0.5 ? 2 * phase * phase : 1 - Math.pow(-2 * phase + 2, 2) / 2
    
    // radius sweeps from SPHERE_RADIUS to SPHERE_RADIUS - maxDepthM * vertExaggeration * 0.00025
    const r = SPHERE_RADIUS - eased * maxDepthM * vertExaggeration * 0.00025
    mesh.scale.setScalar(r / SPHERE_RADIUS)

    ;(mat.uniforms.uPulse as { value: number }).value =
      0.5 + 0.5 * Math.sin(clock.elapsedTime * 6)
  })

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} rotation={[0, 0, 0]}>
      <sphereGeometry
        args={[
          SPHERE_RADIUS,
          64,
          64,
          (roi.lonMin + 180) * (Math.PI / 180),
          (roi.lonMax - roi.lonMin) * (Math.PI / 180),
          (90 - roi.latMax) * (Math.PI / 180),
          (roi.latMax - roi.latMin) * (Math.PI / 180),
        ]}
      />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        uniforms={{ uPulse: { value: 0 } }}
      />
    </mesh>
  )
}
