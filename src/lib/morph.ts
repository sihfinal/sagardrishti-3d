import type { FieldMeta, Manifest } from "@/types"

/**
 * Blend two time frames of a time-major binary (nTime, nDepth, nLat*nLon).
 * srcOffset selects the exact cell range already; mix in [0,1].
 */
export function blendRange(
  bytes: Uint8Array,
  srcA: number,
  srcB: number,
  len: number,
  w256: number,
  dst: Uint8Array
): void {
  if (w256 === 0 || srcA === srcB) {
    for (let i = 0; i < len; i++) dst[i] = bytes[srcA + i]
    return
  }
  for (let i = 0; i < len; i++) {
    dst[i] =
      (bytes[srcA + i] * (256 - w256) + bytes[srcB + i] * w256 + 128) >> 8
  }
}

/**
 * Blend two time frames of a time-major binary (nTime, nDepth, nLat*nLon)
 * into dst per-level. mix in [0,1]; returns nothing, writes dst levels.
 */
export function blendVolume(
  bytes: Uint8Array,
  nTime: number,
  nLevelBytes: number,
  iA: number,
  iB: number,
  mix: number,
  dst: Uint8Array
): void {
  const offA = iA * nLevelBytes
  const offB = iB * nLevelBytes
  const m = Math.round(mix * 16) / 16
  const w = Math.round(mix * 256)
  if (m === 0 || iA === iB) {
    for (let i = 0; i < nLevelBytes; i++) dst[i] = bytes[offA + i]
    return
  }
  if (m === 1) {
    for (let i = 0; i < nLevelBytes; i++) dst[i] = bytes[offB + i]
    return
  }
  for (let i = 0; i < nLevelBytes; i++) {
    dst[i] = (bytes[offA + i] * (256 - w) + bytes[offB + i] * w + 128) >> 8
  }
}

/** Bracketing info for interpolating a depth within the level list. */
export function bracketLevels(
  depthsM: number[],
  d: number
): { k0: number; k1: number; mix: number } {
  const n = depthsM.length
  if (d <= depthsM[0]) return { k0: 0, k1: 0, mix: 0 }
  if (d >= depthsM[n - 1]) return { k0: n - 1, k1: n - 1, mix: 0 }
  let k = 0
  while (k < n - 2 && depthsM[k + 1] < d) k++
  const span = depthsM[k + 1] - depthsM[k] || 1
  return { k0: k, k1: k + 1, mix: (d - depthsM[k]) / span }
}

export interface VolumeInfo {
  meta: FieldMeta
  manifest: Manifest
  bytes: Uint8Array
}
