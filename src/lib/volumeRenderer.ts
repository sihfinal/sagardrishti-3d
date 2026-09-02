import * as THREE from "three"
import { ModelFieldResponse } from "./modelApi"
import { buildLut, PaletteId } from "./colormaps"

const volumeVertexShader = `
varying vec3 vPosition;
varying vec3 vLocalPos;

void main() {
  vLocalPos = position;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vPosition = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`

const volumeFragmentShader = `
precision highp float;
precision highp sampler3D;
precision highp sampler2D;

varying vec3 vPosition;
varying vec3 vLocalPos;

uniform sampler3D u_data;
uniform sampler2D u_colormap;
uniform vec3 u_boxMin;
uniform vec3 u_boxMax;
uniform vec3 u_cameraPos;
uniform float u_opacity;
uniform int u_steps;

vec2 hitBox(vec3 orig, vec3 dir) {
  vec3 inv_dir = 1.0 / dir;
  vec3 tmin_tmp = (u_boxMin - orig) * inv_dir;
  vec3 tmax_tmp = (u_boxMax - orig) * inv_dir;
  vec3 tmin = min(tmin_tmp, tmax_tmp);
  vec3 tmax = max(tmin_tmp, tmax_tmp);
  float t0 = max(tmin.x, max(tmin.y, tmin.z));
  float t1 = min(tmax.x, min(tmax.y, tmax.z));
  return vec2(t0, t1);
}

void main() {
  vec3 rayDir = normalize(vPosition - u_cameraPos);
  vec2 bounds = hitBox(u_cameraPos, rayDir);

  if (bounds.x > bounds.y || bounds.y < 0.0) {
    discard;
  }

  bounds.x = max(bounds.x, 0.0);
  vec3 pStart = u_cameraPos + rayDir * bounds.x;
  vec3 pEnd = u_cameraPos + rayDir * bounds.y;

  float totalDist = length(pEnd - pStart);
  if (totalDist <= 0.001) {
    discard;
  }

  int steps = u_steps;
  float stepSize = totalDist / float(steps);
  vec3 stepVec = rayDir * stepSize;

  vec3 currentPos = pStart + stepVec * 0.5;
  vec4 accColor = vec4(0.0);

  for (int i = 0; i < 96; i++) {
    if (i >= steps || accColor.a >= 0.92) break;

    // Map world coords to [0, 1]^3 texture coordinates
    vec3 texCoord = (currentPos - u_boxMin) / (u_boxMax - u_boxMin);
    // Vertical axis: top (surface) is y=1 in texture, downward is y=0
    texCoord.y = clamp(texCoord.y, 0.0, 1.0);
    texCoord.x = clamp(texCoord.x, 0.0, 1.0);
    texCoord.z = clamp(texCoord.z, 0.0, 1.0);

    vec4 sampleVal = texture(u_data, texCoord);
    float scalar = sampleVal.r;
    float validMask = sampleVal.a;

    if (validMask > 0.5) {
      vec4 col = texture(u_colormap, vec2(clamp(scalar, 0.0, 1.0), 0.5));
      float sampleAlpha = u_opacity * 0.06 * (0.3 + 0.7 * scalar);
      
      accColor.rgb += (1.0 - accColor.a) * col.rgb * sampleAlpha;
      accColor.a += (1.0 - accColor.a) * sampleAlpha;
    }

    currentPos += stepVec;
  }

  if (accColor.a <= 0.02) {
    discard;
  }

  gl_FragColor = accColor;
}
`

/**
 * Creates a GPU Ray-Marching 3D Volume Mesh from real multi-depth NetCDF model slices
 */
export function createVolumeMesh(
  depthStack: ModelFieldResponse[],
  palette: PaletteId,
  planeW: number,
  planeH: number,
  maxZDepth: number
): { mesh: THREE.Mesh; updateCameraPos: (camPos: THREE.Vector3) => void; dispose: () => void } | null {
  if (!depthStack || depthStack.length < 2) return null

  const dCount = depthStack.length
  const hCount = depthStack[0]?.height || 0
  const wCount = depthStack[0]?.width || 0
  if (hCount === 0 || wCount === 0) return null

  // 1. Build 3D Data Texture from actual scalar values
  // Find global min and max across loaded depth slices
  let globalMin = Infinity
  let globalMax = -Infinity
  for (const slice of depthStack) {
    if (slice.min_value != null && slice.min_value < globalMin) globalMin = slice.min_value
    if (slice.max_value != null && slice.max_value > globalMax) globalMax = slice.max_value
  }
  if (!isFinite(globalMin)) globalMin = 0
  if (!isFinite(globalMax)) globalMax = 1
  const span = globalMax - globalMin || 1

  // 3D Texture array (RGBA format: R = normalized scalar, A = 255 valid / 0 invalid)
  const texData = new Uint8Array(wCount * hCount * dCount * 4)

  for (let z = 0; z < dCount; z++) {
    // Invert Z index so layer 0 (surface) is at top of texture (y=1)
    const sliceIdx = z
    const slice = depthStack[sliceIdx]
    const vals = slice?.values || []

    for (let r = 0; r < hCount; r++) {
      const latIdx = hCount - 1 - r
      const row = vals[latIdx] || []

      for (let c = 0; c < wCount; c++) {
        const val = row[c]
        const pxIdx = (z * (hCount * wCount) + r * wCount + c) * 4

        if (val === null || val === undefined || isNaN(val)) {
          texData[pxIdx] = 0
          texData[pxIdx + 1] = 0
          texData[pxIdx + 2] = 0
          texData[pxIdx + 3] = 0 // Land / NaN
        } else {
          const norm = Math.max(0, Math.min(1, (val - globalMin) / span))
          texData[pxIdx] = Math.round(norm * 255)
          texData[pxIdx + 1] = 0
          texData[pxIdx + 2] = 0
          texData[pxIdx + 3] = 255 // Valid ocean
        }
      }
    }
  }

  const data3DTexture = new THREE.Data3DTexture(texData, wCount, hCount, dCount)
  data3DTexture.format = THREE.RGBAFormat
  data3DTexture.type = THREE.UnsignedByteType
  data3DTexture.minFilter = THREE.LinearFilter
  data3DTexture.magFilter = THREE.LinearFilter
  data3DTexture.wrapS = THREE.ClampToEdgeWrapping
  data3DTexture.wrapT = THREE.ClampToEdgeWrapping
  data3DTexture.wrapR = THREE.ClampToEdgeWrapping
  data3DTexture.needsUpdate = true

  // 2. Build Colormap 2D Texture (256x1 RGBA)
  const lut = buildLut(palette, 256)
  const cmapData = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    cmapData[i * 4] = lut[i * 3]
    cmapData[i * 4 + 1] = lut[i * 3 + 1]
    cmapData[i * 4 + 2] = lut[i * 3 + 2]
    cmapData[i * 4 + 3] = 255
  }
  const colormapTexture = new THREE.DataTexture(cmapData, 256, 1, THREE.RGBAFormat)
  colormapTexture.minFilter = THREE.LinearFilter
  colormapTexture.magFilter = THREE.LinearFilter
  colormapTexture.needsUpdate = true

  // 3. Create Bounding Volume Geometry and Shader Material
  const boxGeo = new THREE.BoxGeometry(planeW, maxZDepth, planeH)

  const uniforms = {
    u_data: { value: data3DTexture },
    u_colormap: { value: colormapTexture },
    u_boxMin: { value: new THREE.Vector3(-planeW / 2, -maxZDepth, -planeH / 2) },
    u_boxMax: { value: new THREE.Vector3(planeW / 2, 0, planeH / 2) },
    u_cameraPos: { value: new THREE.Vector3(0, 0, 20) },
    u_opacity: { value: 0.75 },
    u_steps: { value: 64 },
  }

  const shaderMat = new THREE.ShaderMaterial({
    vertexShader: volumeVertexShader,
    fragmentShader: volumeFragmentShader,
    uniforms: uniforms,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  })

  const mesh = new THREE.Mesh(boxGeo, shaderMat)
  mesh.position.set(0, -maxZDepth / 2, 0)

  const updateCameraPos = (camPos: THREE.Vector3) => {
    uniforms.u_cameraPos.value.copy(camPos)
  }

  const dispose = () => {
    boxGeo.dispose()
    shaderMat.dispose()
    data3DTexture.dispose()
    colormapTexture.dispose()
  }

  return { mesh, updateCameraPos, dispose }
}
