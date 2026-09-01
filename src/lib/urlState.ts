"use client"

import { useEffect } from "react"
import { useOcean } from "@/lib/store"
import type { Manifest } from "@/types"

/**
 * URL state sharing: key controls are encoded as query params so judges can
 * open pre-built views. Applied once on load; written back (debounced) on
 * every store change.
 *
 *   ?var=temp_monthly&depth=8&pal=viridis&log=1&exag=80&iso=20&sel=1901839&m=3
 */

function applyFromUrl(m: Manifest) {
  const p = new URLSearchParams(window.location.search)
  const s = useOcean.getState()
  const varId = p.get("var")
  if (varId && m.variables.some((v) => v.id === varId)) {
    s.setVariable(varId)
    const meta = m.variables.find((v) => v.id === varId)!
    const d = parseInt(p.get("depth") ?? "", 10)
    if (!isNaN(d)) s.setDepthIdx(Math.min(meta.depthsM.length - 1, Math.max(0, d)))
    const mo = parseInt(p.get("m") ?? "", 10)
    const nTime = meta.times?.length ?? 0
    if (!isNaN(mo) && nTime > 0) s.setTimeIdx(Math.min(nTime - 1, Math.max(0, mo)))
  }
  const pal = p.get("pal") as "turbo" | "viridis" | "plasma" | "diverging" | null
  if (pal && ["turbo", "viridis", "plasma", "diverging"].includes(pal))
    s.setPalette(pal)
  if (p.get("log") === "1") s.setLogScale(true)
  const exag = parseFloat(p.get("exag") ?? "")
  if (!isNaN(exag)) s.setVertExaggeration(Math.min(200, Math.max(10, exag)))
  const iso = parseFloat(p.get("iso") ?? "")
  if (!isNaN(iso)) {
    s.setIsoEnabled(true)
    s.setIsoValue(iso)
  }
  const rmin = parseFloat(p.get("rmin") ?? "")
  const rmax = parseFloat(p.get("rmax") ?? "")
  if (!isNaN(rmin) || !isNaN(rmax))
    s.setRange(
      isNaN(rmin) ? null : rmin,
      isNaN(rmax) ? null : rmax
    )
  const sel = p.get("sel")
  if (sel) s.selectPlatform(sel)
  if (p.get("view") === "globe") s.setViewMode("globe")
}

let writeTimer: ReturnType<typeof setTimeout> | null = null

function writeUrl() {
  if (writeTimer) return
  writeTimer = setTimeout(() => {
    writeTimer = null
    const s = useOcean.getState()
    const meta = s.manifest?.variables.find((v) => v.id === s.variableId)
    const p = new URLSearchParams()
    if (meta) {
      p.set("var", s.variableId)
      p.set("depth", String(s.depthIdx))
      if (meta.times?.length) p.set("m", String(Math.floor(s.timeIdx)))
    }
    if (s.palette !== "turbo") p.set("pal", s.palette)
    if (s.logScale) p.set("log", "1")
    if (s.vertExaggeration !== 50) p.set("exag", String(s.vertExaggeration))
    if (s.isoEnabled) p.set("iso", String(s.isoValue))
    if (s.rangeMin !== null || s.rangeMax !== null) {
      if (s.rangeMin !== null) p.set("rmin", String(s.rangeMin))
      if (s.rangeMax !== null) p.set("rmax", String(s.rangeMax))
    }
    if (s.selectedPlatformId) p.set("sel", s.selectedPlatformId)
    if (s.viewMode === "globe") p.set("view", "globe")
    const qs = p.toString()
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    )
  }, 400)
}

export function useUrlState(manifest: Manifest | null): void {
  useEffect(() => {
    if (manifest) applyFromUrl(manifest)
  }, [manifest])

  useEffect(() => {
    const unsub = useOcean.subscribe(writeUrl)
    return unsub
  }, [])
}
