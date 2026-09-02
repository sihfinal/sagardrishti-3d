import * as THREE from "three"
import type { Roi } from "@/types"

let cachedMaskTex: THREE.Texture | null = null
let maskPromise: Promise<THREE.Texture> | null = null

export function getLandMaskTex(roi: Roi): Promise<THREE.Texture> {
  if (cachedMaskTex) return Promise.resolve(cachedMaskTex)
  if (maskPromise) return maskPromise

  maskPromise = fetch("/data/coastlines.json")
    .then((r) => r.json())
    .then((gj) => {
      const w = 2048
      const h = 2048
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!

      // Ocean (data is visible) -> White
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, w, h)

      // Land (data is masked out) -> Black
      ctx.fillStyle = "#000000"

      const lonToX = (lon: number) => ((lon - roi.lonMin) / (roi.lonMax - roi.lonMin)) * w
      const latToY = (lat: number) => (1.0 - (lat - roi.latMin) / (roi.latMax - roi.latMin)) * h

      for (const f of gj.features) {
        const polys =
          f.geometry.type === "Polygon"
            ? [f.geometry.coordinates]
            : f.geometry.coordinates
        for (const poly of polys) {
          ctx.beginPath()
          for (let r = 0; r < poly.length; r++) {
            const ring = poly[r]
            for (let i = 0; i < ring.length; i++) {
              const [lon, lat] = ring[i]
              const x = lonToX(lon)
              const y = latToY(lat)
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            }
          }
          ctx.fill("evenodd")
        }
      }

      const tex = new THREE.CanvasTexture(canvas)
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.generateMipmaps = false
      tex.needsUpdate = true
      cachedMaskTex = tex
      return tex as THREE.Texture
    })
    .catch((err) => {
      console.error("[maskCache] Failed to build land mask", err)
      // Fallback: fully white texture if we fail
      const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
      tex.needsUpdate = true
      cachedMaskTex = tex as THREE.Texture
      return tex as THREE.Texture
    })

  return maskPromise
}
