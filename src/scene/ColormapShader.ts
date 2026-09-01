import * as THREE from "three"

export const SLICE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const SLICE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uData;   // R channel: quantized value, 1.0 = land/fill
  uniform sampler2D uLut;    // 256x1 palette
  uniform float uMin;
  uniform float uMax;
  uniform float uLog;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float q = texture2D(uData, vUv).r;
    if (q > 0.9985) discard; // land / missing
    float t = clamp(q * (255.0 / 254.0), 0.0, 1.0);
    if (uLog > 0.5) {
      float v = max(uMin + t * (uMax - uMin), 1e-6);
      t = clamp((log(v) - log(uMin)) / (log(uMax) - log(uMin)), 0.0, 1.0);
    }
    vec3 color = texture2D(uLut, vec2(t, 0.5)).rgb;
    gl_FragColor = vec4(color, uOpacity);
  }
`

export const SLICE_MASKED_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uData;   // R channel: quantized value, 1.0 = land/fill
  uniform sampler2D uLut;    // 256x1 palette
  uniform sampler2D uMask;   // Geographic land mask (1.0 = ocean, 0.0 = land)
  uniform vec2 uResolution;  // Resolution of uData (e.g. vec2(60.0, 65.0))
  uniform float uMin;
  uniform float uMax;
  uniform float uLog;
  uniform float uOpacity;
  uniform vec4 uRoiBounds;
  varying vec2 vUv;

  void main() {
    // 0. Visual cropping exact shape based on user's reference image
    float lon = uRoiBounds.x + vUv.x * (uRoiBounds.y - uRoiBounds.x);
    float lat = uRoiBounds.z + vUv.y * (uRoiBounds.w - uRoiBounds.z);

    bool inRegion = (lat >= -8.0 && lat <= 30.0 && lon >= 61.0 && lon <= 98.0);
    if (!inRegion) discard;

    // 1. High-res geographic land mask (0.0 = land, 1.0 = ocean)
    float geoMask = texture2D(uMask, vUv).r;
    if (geoMask < 0.5) discard;

    // 2. Manual Bilinear Interpolation ignoring native 255 (missing) values
    vec2 texelSize = 1.0 / uResolution;
    // Map uv to pixel coordinates
    vec2 px = vUv * uResolution - 0.5;
    vec2 f = fract(px);
    vec2 tc = (floor(px) + 0.5) * texelSize;

    float q00 = texture2D(uData, tc).r;
    float q10 = texture2D(uData, tc + vec2(texelSize.x, 0.0)).r;
    float q01 = texture2D(uData, tc + vec2(0.0, texelSize.y)).r;
    float q11 = texture2D(uData, tc + texelSize).r;

    // Check validity (255/255 = 1.0 is missing/land in data)
    bool v00 = q00 < 0.9985;
    bool v10 = q10 < 0.9985;
    bool v01 = q01 < 0.9985;
    bool v11 = q11 < 0.9985;

    // If all 4 texels are missing, this is an ocean area with no data
    if (!v00 && !v10 && !v01 && !v11) discard;

    // Extrapolate valid values to prevent dark/false color bleeding at the edge
    float val00 = v00 ? q00 : (v10 ? q10 : (v01 ? q01 : q11));
    float val10 = v10 ? q10 : (v00 ? q00 : (v11 ? q11 : q01));
    float val01 = v01 ? q01 : (v00 ? q00 : (v11 ? q11 : q10));
    float val11 = v11 ? q11 : (v01 ? q01 : (v10 ? q10 : q00));

    // Bilinear blend of extrapolated values
    float qx0 = mix(val00, val10, f.x);
    float qx1 = mix(val01, val11, f.x);
    float q = mix(qx0, qx1, f.y);

    // 3. Map to color
    float t = clamp(q * (255.0 / 254.0), 0.0, 1.0);
    if (uLog > 0.5) {
      float v = max(uMin + t * (uMax - uMin), 1e-6);
      t = clamp((log(v) - log(uMin)) / (log(uMax) - log(uMin)), 0.0, 1.0);
    }
    
    // Smooth alpha at the coastline based on geoMask to prevent aliasing
    float alpha = uOpacity * smoothstep(0.4, 0.6, geoMask);
    vec3 color = texture2D(uLut, vec2(t, 0.5)).rgb;
    gl_FragColor = vec4(color, alpha);
  }
`

/** Build a 256x1 RGBA DataTexture from a 256x3 LUT byte array. */
export function makeLutTexture(lut: Uint8Array): THREE.DataTexture {
  const rgba = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    rgba[i * 4] = lut[i * 3]
    rgba[i * 4 + 1] = lut[i * 3 + 1]
    rgba[i * 4 + 2] = lut[i * 3 + 2]
    rgba[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(rgba, 256, 1, THREE.RGBAFormat)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}
