import { readFileSync } from "fs"
import { sampleField } from "../src/scene/mapping"

const manifest = JSON.parse(readFileSync("public/data/manifest.json", "utf-8")) as {
  grid: { nLat: number; nLon: number; lats: number[]; lons: number[] }
  variables: Array<{ id: string; file: string; dims: { nDepth: number }; depthsM: number[]; encoding: { fillByte: number; offset: number }; globalMin: number; globalMax: number }>
}
const profiles = JSON.parse(readFileSync("public/data/profiles.json", "utf-8"))
const meta = manifest.variables.find((v) => v.id === "temp_annual")!
const data = new Uint8Array(readFileSync(`public/data/${meta.file}`))

let n = 0
let sumDiff = 0
let sumSq = 0
for (const p of platforms(profiles)) {
  const cycle = p.cycles[p.cycles.length - 1]
  if (!cycle) continue
  const obsPt = cycle.profile.find((t) => t.tempC !== null && t.depthM < 20)
  if (!obsPt || obsPt.tempC === null) continue
  const q = sampleField(data, manifest.grid, meta.depthsM, cycle.lon, cycle.lat, 0)
  if (q === null) continue
  const model = meta.encoding.offset + (q / 254) * (meta.globalMax - meta.globalMin)
  const d = obsPt.tempC - model
  sumDiff += d
  sumSq += d * d
  n++
}
console.log(`points=${n} bias=${(sumDiff / n).toFixed(2)} rmse=${Math.sqrt(sumSq / n).toFixed(2)}`)
if (n < 100 || Math.abs(sumDiff / n) > 3) {
  console.error("SCATTER CHECK FAILED")
  process.exit(1)
}

function platforms(p: { platforms?: Array<Record<string, unknown>> }): { cycles: { lon: number; lat: number; profile: { depthM: number; tempC: number | null }[] }[] }[] {
  return (p.platforms ?? []) as never
}
