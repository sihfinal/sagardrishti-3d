"use client"

import React, { useMemo } from "react"
import * as THREE from "three"

const ATMO_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ATMO_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  uniform vec3 uColor;
  uniform float uIntensity;
  void main() {
    float fres = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.6);
    gl_FragColor = vec4(uColor, clamp(fres * uIntensity, 0.0, 1.0));
  }
`

export default function AtmosphereGlow({
  radius = 2,
  color = "#38bdf8",
  intensity = 1.25,
}: {
  radius?: number
  color?: string
  intensity?: number
}) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    }),
    [color, intensity]
  )

  return (
    <mesh scale={1.032}>
      <sphereGeometry args={[radius, 48, 48]} />
      <shaderMaterial
        vertexShader={ATMO_VERTEX}
        fragmentShader={ATMO_FRAGMENT}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}
