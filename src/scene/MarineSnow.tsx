"use client"

/**
 * Marine snow (upgrade I): shader-animated particle motes drifting down
 * through the volume. All motion happens in the vertex shader from a seed
 * attribute — zero per-frame CPU work.
 */
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import type { Roi } from "@/types"

const VERT = /* glsl */ `
  attribute float seed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uWidth;
  uniform float uDepth;
  uniform float uCenterLon;
  uniform float uCenterLat;
  uniform float uHorizScale;
  uniform float uSphereRadius;
  varying float vFade;
  void main() {
    vec3 p = position;
    float t = uTime * (0.14 + fract(seed * 7.31) * 0.12);
    p.y = uHeight / 2.0 - mod(seed * 971.0 + t * uHeight, uHeight);
    p.x += sin(uTime * 0.4 + seed * 40.0) * 0.35;
    p.z += cos(uTime * 0.33 + seed * 29.0) * 0.35;
    vFade = smoothstep(0.0, 0.15, p.y / uHeight + 0.5) *
            smoothstep(1.0, 0.85, p.y / uHeight + 0.5);
            
    // Project to sphere
    float lon = p.x / uHorizScale + uCenterLon;
    float lat = -p.z / uHorizScale + uCenterLat;
    float r = uSphereRadius + p.y;
    
    float phi = (90.0 - lat) * (3.14159265 / 180.0);
    float theta = (lon + 180.0) * (3.14159265 / 180.0);
    
    p.x = -r * sin(phi) * cos(theta);
    p.y = r * cos(phi);
    p.z = r * sin(phi) * sin(theta);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (1.5 + fract(seed * 13.7) * 2.2);
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.1, length(c)) * vFade;
    gl_FragColor = vec4(0.75, 0.83, 0.9, a * 0.35);
  }
`

export default function MarineSnow({
  width,
  depth,
  height,
  count = 700,
  roi,
}: {
  width: number
  depth: number
  height: number
  count?: number
  roi: Roi
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const geometry = useMemo(() => {
    const N = count
    const pos = new Float32Array(N * 3)
    const seeds = new Float32Array(N)
    let s = 0x9e3779b9
    const rand = () => {
      s ^= s << 13
      s ^= s >>> 17
      s ^= s << 5
      return ((s >>> 0) % 100000) / 100000
    }
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rand() - 0.5) * width
      pos[i * 3 + 1] = 0 // set by shader
      pos[i * 3 + 2] = (rand() - 0.5) * depth
      seeds[i] = rand()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    g.setAttribute("seed", new THREE.BufferAttribute(seeds, 1))
    return g
  }, [width, depth, count])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ clock }) => {
    if (!matRef.current) return
    ;(matRef.current.uniforms.uTime as { value: number }).value =
      clock.elapsedTime
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthWrite={false}
        uniforms={{
          uTime: { value: 0 },
          uHeight: { value: height },
          uWidth: { value: width },
          uDepth: { value: depth },
          uCenterLon: { value: (roi.lonMin + roi.lonMax) / 2 },
          uCenterLat: { value: (roi.latMin + roi.latMax) / 2 },
          uHorizScale: { value: 1.5 },
          uSphereRadius: { value: 30.0 },
        }}
      />
    </points>
  )
}
