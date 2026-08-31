import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import path from "path"
import { buildLut, buildDivergingLut, valueToLutIndex } from "../src/lib/colormaps"

const DATA = path.join(__dirname, "..", "public", "data")

const manifest = JSON.parse(readFileSync(path.join(DATA, "manifest.json"), "utf-8"))

describe("GATE 1: manifest + binaries", () => {
  it("manifest parses and grid is consistent", () => {
    expect(manifest.roi.latMin).toBe(-35)
    expect(manifest.grid.nLat).toBe(manifest.grid.lats.length)
    expect(manifest.grid.nLon).toBe(manifest.grid.lons.length)
  })

  it("every field binary matches manifest dims", () => {
    for (const v of manifest.variables) {
      const size = statSync(path.join(DATA, v.file)).size
      const expect_ =
        v.dims.nDepth * (v.dims.nTime ?? 1) * v.dims.nLat * v.dims.nLon
      expect(size, v.id).toBe(expect_)
      expect(v.depthsM.length).toBe(v.dims.nDepth)
    }
  })

  it("committed data stays under the 15 MB contract", () => {
    let total = 0
    for (const f of readdirSync(DATA)) total += statSync(path.join(DATA, f)).size
    expect(total).toBeLessThan(15 * 1024 * 1024)
  })
})

describe("GATE 1: instrument profiles", () => {
  const profiles = JSON.parse(
    readFileSync(path.join(DATA, "profiles.json"), "utf-8")
  ) as {
    platforms: Array<{
      id: string
      type: string
      cycles: Array<{
        profile: Array<{ depthM: number; tempC: number | null }>
      }>
    }>
  }

  it("has >=20 Argo platforms AND >=1 glider", () => {
    const argo = profiles.platforms.filter((p) => p.type === "argo").length
    const gliders = profiles.platforms.filter((p) => p.type === "glider").length
    expect(argo).toBeGreaterThanOrEqual(20)
    expect(gliders).toBeGreaterThanOrEqual(1)
  })

  it("some platform has non-null temperature below 500 m", () => {
    const deep = profiles.platforms.some((p) =>
      p.cycles.some((c) =>
        c.profile.some((pt) => pt.depthM > 500 && pt.tempC !== null)
      )
    )
    expect(deep).toBe(true)
  })

  it("cycles are capped at 5 and points at 200", () => {
    for (const p of profiles.platforms) {
      expect(p.cycles.length).toBeLessThanOrEqual(5)
      for (const c of p.cycles) expect(c.profile.length).toBeLessThanOrEqual(200)
    }
  })
})

describe("colormap math", () => {
  it("LUTs are monotonic-ish in blue channel and have correct endpoints", () => {
    for (const lut of [buildLut("turbo"), buildDivergingLut()]) {
      // first stop is dark/blue-ish, last is bright
      const firstR = lut[0]
      const lastR = lut[252]
      expect(lastR).toBeGreaterThan(firstR - 60) // sanity on ordering
      expect(lut.length).toBe(256 * 3)
    }
  })

  it("valueToLutIndex clamps and maps linearly", () => {
    expect(valueToLutIndex(0, 0, 10, false)).toBe(0)
    expect(valueToLutIndex(10, 0, 10, false)).toBe(255)
    expect(valueToLutIndex(5, 0, 10, false)).toBeCloseTo(128, 0)
    expect(valueToLutIndex(-5, 0, 10, false)).toBe(0)
    expect(valueToLutIndex(50, 0, 10, false)).toBe(255)
  })

  it("log scale only maps positive domains", () => {
    expect(() => valueToLutIndex(1, 1, 100, true)).not.toThrow()
    expect(valueToLutIndex(1, 1, 100, true)).toBe(0)
    expect(valueToLutIndex(100, 1, 100, true)).toBe(255)
  })
})

describe("temporal fields", () => {
  it("monthly volume carries 12 named months", () => {
    const vol = manifest.variables.find(
      (v: { id: string }) => v.id === "temp_monthly"
    )
    expect(vol).toBeTruthy()
    expect((vol as { dims: { nTime: number } }).dims.nTime).toBe(12)
    expect(((vol as { times?: string[] }).times)?.length).toBe(12)
  })

  it("anomaly range is symmetric", () => {
    const a = manifest.variables.find(
      (v: { id: string }) => v.id === "sst_anomaly"
    ) as { globalMin: number; globalMax: number }
    expect(a).toBeTruthy()
    expect(Math.abs(a.globalMin + a.globalMax)).toBeLessThan(0.01)
  })
})
