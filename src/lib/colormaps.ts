// Turbo / Viridis / Plasma LUTs (256 entries) as compact anchor stops;
// linear interpolation builds the full 256-entry lookup table.
export type PaletteId = "turbo" | "viridis" | "plasma"

type Stop = [number, number, number]

const TURBO_STOPS: Stop[] = [
  [48, 18, 59], [70, 107, 227], [42, 181, 246], [24, 236, 202],
  [128, 245, 114], [222, 216, 57], [252, 166, 37], [237, 79, 17],
  [122, 4, 3],
]
const VIRIDIS_STOPS: Stop[] = [
  [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
  [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89],
  [180, 222, 44], [253, 231, 37],
]
const PLASMA_STOPS: Stop[] = [
  [13, 8, 135], [69, 3, 158], [114, 1, 168], [156, 23, 158],
  [189, 55, 134], [216, 87, 107], [237, 121, 83], [251, 159, 58],
  [253, 202, 38], [240, 249, 33],
]

const PALETTES: Record<PaletteId, Stop[]> = {
  turbo: TURBO_STOPS,
  viridis: VIRIDIS_STOPS,
  plasma: PLASMA_STOPS,
}

const DIVERGING_STOPS: Stop[] = [
  [33, 102, 172], [67, 147, 195], [146, 197, 222], [247, 247, 247],
  [244, 165, 130], [214, 96, 77], [178, 24, 43],
]

export function buildLut(palette: PaletteId, size = 256): Uint8Array {
  const stops = PALETTES[palette]
  const lut = new Uint8Array(size * 3)
  const segs = stops.length - 1
  for (let i = 0; i < size; i++) {
    const t = (i / (size - 1)) * segs
    const s = Math.min(Math.floor(t), segs - 1)
    const f = t - s
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = Math.round(
        stops[s][c] + (stops[s + 1][c] - stops[s][c]) * f
      )
    }
  }
  return lut
}

export function buildDivergingLut(size = 256): Uint8Array {
  const stops = DIVERGING_STOPS
  const lut = new Uint8Array(size * 3)
  const segs = stops.length - 1
  for (let i = 0; i < size; i++) {
    const t = (i / (size - 1)) * segs
    const s = Math.min(Math.floor(t), segs - 1)
    const f = t - s
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = Math.round(
        stops[s][c] + (stops[s + 1][c] - stops[s][c]) * f
      )
    }
  }
  return lut
}

/** Map a data value to a LUT index honoring min/max range and log scale. */
export function valueToLutIndex(
  v: number,
  min: number,
  max: number,
  logScale: boolean,
  size = 256
): number {
  let t: number
  if (logScale && min > 0 && v > 0) {
    t = (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))
  } else {
    t = (v - min) / (max - min)
  }
  t = Math.min(1, Math.max(0, t))
  return Math.round(t * (size - 1))
}

export function cssGradient(palette: PaletteId, steps = 32): string {
  const lut = buildLut(palette)
  const parts: string[] = []
  for (let i = 0; i < steps; i++) {
    const idx = Math.round((i / (steps - 1)) * 255) * 3
    parts.push(
      `rgb(${lut[idx]},${lut[idx + 1]},${lut[idx + 2]}) ` +
        `${((i / (steps - 1)) * 100).toFixed(1)}%`
    )
  }
  return `linear-gradient(to right, ${parts.join(",")})`
}
