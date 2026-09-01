"use client"

/**
 * God-ray shafts (upgrade I): additive gradient planes tilted along the sun
 * direction, slowly breathing. Cheap stand-in for raymarched volumetrics —
 * reads perfectly on projector GPUs.
 */
import { useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import type { Roi } from "@/types"
import { geoToSphere } from "./mapping"

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    // fade toward the bottom and edges of each shaft
    float vert = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
    float edge = smoothstep(0.0, 0.4, vUv.x) * smoothstep(1.0, 0.6, vUv.x);
    float breathe = 0.75 + 0.25 * sin(uTime * 0.5 + uSeed * 17.0);
    float a = vert * edge * breathe * 0.06;
    gl_FragColor = vec4(0.65, 0.8, 0.95, a);
  }
`

const N = 7

export default function GodRays({
  roi,
  height,
  vertExaggeration,
}: {
  roi: Roi
  height: number
  vertExaggeration: number
}) {
  const matRefs = useRef<(THREE.ShaderMaterial | null)[]>([])

  useFrame(({ clock }) => {
    for (const m of matRefs.current) {
      if (!m) continue
      ;(m.uniforms.uTime as { value: number }).value = clock.elapsedTime
    }
  })

  return (
    <group>
      {Array.from({ length: N }, (_, i) => {
        const lon = roi.lonMin + (roi.lonMax - roi.lonMin) * (i / (N - 1)) + Math.sin(i * 3.7) * 3
        const lat = roi.latMin + (roi.latMax - roi.latMin) * 0.5 + Math.cos(i * 5.1) * 6
        const pos = geoToSphere(lon, lat, 300, vertExaggeration)
        const normal = pos.clone().normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)

        return (
          <mesh
            key={i}
            position={[pos.x, pos.y, pos.z]}
            quaternion={q}
          >
            <planeGeometry args={[12, height]} />
            <shaderMaterial
              ref={(m) => {
                matRefs.current[i] = m as THREE.ShaderMaterial | null
              }}
              vertexShader={VERT}
              fragmentShader={FRAG}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              uniforms={{
                uTime: { value: 0 },
                uSeed: { value: i / N },
              }}
            />
          </mesh>
        )
      })}
    </group>
  )
}
