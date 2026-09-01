"use client"

import React, { useState, useMemo } from "react"
import { ObservationProfilePoint } from "@/lib/observationsApi"

interface ObservationProfileChartProps {
  data: ObservationProfilePoint[]
  availableVariables: string[]
}

const VARIABLE_CONFIG: Record<
  string,
  { label: string; unit: string; color: string; lineColor: string }
> = {
  temperature: { label: "Temperature", unit: "°C", color: "#38bdf8", lineColor: "rgba(56, 189, 248, 0.85)" },
  salinity: { label: "Salinity", unit: "PSU", color: "#34d399", lineColor: "rgba(52, 211, 153, 0.85)" },
  oxygen: { label: "Oxygen", unit: "µmol/kg", color: "#fbbf24", lineColor: "rgba(251, 191, 36, 0.85)" },
  chlorophyll: { label: "Chlorophyll", unit: "mg/m³", color: "#a78bfa", lineColor: "rgba(167, 139, 250, 0.85)" },
  nitrate: { label: "Nitrate", unit: "µmol/L", color: "#f87171", lineColor: "rgba(248, 113, 113, 0.85)" },
  ph: { label: "pH", unit: "", color: "#ec4899", lineColor: "rgba(236, 72, 153, 0.85)" },
}

export default function ObservationProfileChart({
  data,
  availableVariables,
}: ObservationProfileChartProps) {
  // Determine which variables actually have non-null valid numeric points in data
  const validVars = useMemo(() => {
    const list: string[] = []
    for (const v of availableVariables) {
      const varKey = v.toLowerCase() as keyof ObservationProfilePoint
      const hasPoints = data.some((pt) => {
        const val = pt[varKey]
        return typeof val === "number" && !isNaN(val) && val !== null
      })
      if (hasPoints) {
        list.push(varKey)
      }
    }
    return list.length > 0 ? list : ["temperature"]
  }, [data, availableVariables])

  const [activeVar, setActiveVar] = useState<string>(validVars[0] || "temperature")
  const [hoveredPoint, setHoveredPoint] = useState<{ depth: number; value: number; x: number; y: number } | null>(null)

  // Ensure activeVar is in validVars
  const currentVar = validVars.includes(activeVar) ? activeVar : validVars[0] || "temperature"
  const config = VARIABLE_CONFIG[currentVar] || {
    label: currentVar.toUpperCase(),
    unit: "",
    color: "#38bdf8",
    lineColor: "rgba(56, 189, 248, 0.85)",
  }

  // Filter and sort valid (depth, value) points for the active variable
  const points = useMemo(() => {
    const varKey = currentVar as keyof ObservationProfilePoint
    const filtered = data
      .filter((pt) => typeof pt.depth === "number" && !isNaN(pt.depth) && typeof pt[varKey] === "number" && !isNaN(pt[varKey] as number) && pt[varKey] !== null)
      .map((pt) => ({
        depth: pt.depth,
        value: pt[varKey] as number,
      }))
      .sort((a, b) => a.depth - b.depth)
    return filtered
  }, [data, currentVar])

  // Compute depth and value min/max domains
  const { minVal, maxVal, minDepth, maxDepth } = useMemo(() => {
    if (points.length === 0) {
      return { minVal: 0, maxVal: 30, minDepth: 0, maxDepth: 2000 }
    }
    let minV = Infinity
    let maxV = -Infinity
    let minD = 0
    let maxD = -Infinity

    for (const p of points) {
      if (p.value < minV) minV = p.value
      if (p.value > maxV) maxV = p.value
      if (p.depth > maxD) maxD = p.depth
    }

    if (minV === maxV) {
      minV -= 1
      maxV += 1
    }
    if (maxD <= 0) maxD = 100

    return { minVal: minV, maxVal: maxV, minDepth: minD, maxDepth: maxD }
  }, [points])

  // Chart Dimensions
  const W = 320
  const H = 220
  const PAD_L = 44
  const PAD_R = 16
  const PAD_T = 24
  const PAD_B = 24

  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const valSpan = maxVal - minVal || 1
  const depthSpan = maxDepth - minDepth || 1

  // Map coordinates: X = value, Y = depth (increasing downward)
  const getX = (val: number) => PAD_L + ((val - minVal) / valSpan) * plotW
  const getY = (depth: number) => PAD_T + ((depth - minDepth) / depthSpan) * plotH

  // Build SVG polyline path
  const polylinePoints = useMemo(() => {
    return points.map((p) => `${getX(p.value).toFixed(1)},${getY(p.depth).toFixed(1)}`).join(" ")
  }, [points, minVal, maxVal, minDepth, maxDepth])

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[#040e1b]/90 border border-sky-500/20 p-3 select-none">
      {/* Variable Switcher Tabs */}
      <div className="flex items-center justify-between pb-1 border-b border-sky-900/30">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300">
          PROFILE VARIABLE
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          {validVars.map((v) => {
            const vConf = VARIABLE_CONFIG[v] || { label: v }
            const isActive = v === currentVar
            return (
              <button
                key={v}
                type="button"
                onClick={() => setActiveVar(v)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  isActive
                    ? "bg-sky-500/30 border border-sky-400 text-white shadow-sm"
                    : "bg-[#081a33]/60 border border-slate-700/50 text-slate-400 hover:text-slate-200"
                }`}
              >
                {vConf.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Profile Chart Header */}
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="font-bold text-white">
          {config.label} {config.unit && `(${config.unit})`} vs Depth (m)
        </span>
        <span className="text-sky-400">
          {points.length} levels · 0 to {maxDepth.toFixed(0)}m
        </span>
      </div>

      {/* SVG Scientific Depth Profile Graph */}
      {points.length === 0 ? (
        <div className="w-full h-44 flex items-center justify-center text-slate-500 text-xs font-mono">
          No depth-resolved {config.label.toLowerCase()} measurements available.
        </div>
      ) : (
        <div className="relative w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto max-h-[220px] overflow-visible"
          >
            {/* Background Grid */}
            <rect
              x={PAD_L}
              y={PAD_T}
              width={plotW}
              height={plotH}
              fill="#020712"
              stroke="#0f2942"
              strokeWidth="1"
            />

            {/* Depth Horizontal Grid Lines & Ticks (Downward) */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const d = minDepth + frac * depthSpan
              const y = PAD_T + frac * plotH
              return (
                <g key={frac}>
                  <line
                    x1={PAD_L}
                    y1={y}
                    x2={PAD_L + plotW}
                    y2={y}
                    stroke="#1e3a5f"
                    strokeWidth="0.75"
                    strokeDasharray="2,2"
                  />
                  <text
                    x={PAD_L - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {d.toFixed(0)}m
                  </text>
                </g>
              )
            })}

            {/* Value Vertical Grid Lines & Ticks (X-Axis at top) */}
            {[0, 0.5, 1].map((frac) => {
              const val = minVal + frac * valSpan
              const x = PAD_L + frac * plotW
              return (
                <g key={frac}>
                  <line
                    x1={x}
                    y1={PAD_T}
                    x2={x}
                    y2={PAD_T + plotH}
                    stroke="#1e3a5f"
                    strokeWidth="0.75"
                    strokeDasharray="2,2"
                  />
                  <text
                    x={x}
                    y={PAD_T - 6}
                    textAnchor={frac === 0 ? "start" : frac === 1 ? "end" : "middle"}
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {val.toFixed(1)} {config.unit}
                  </text>
                </g>
              )
            })}

            {/* Scientific Profile Connecting Polyline */}
            <polyline
              fill="none"
              stroke={config.lineColor}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={polylinePoints}
            />

            {/* In-Situ Data Points */}
            {points.map((p, idx) => {
              const cx = getX(p.value)
              const cy = getY(p.depth)
              return (
                <circle
                  key={idx}
                  cx={cx}
                  cy={cy}
                  r="2.5"
                  fill={config.color}
                  stroke="#020712"
                  strokeWidth="0.75"
                  className="cursor-pointer hover:r-4 transition-all"
                  onMouseEnter={() => setHoveredPoint({ depth: p.depth, value: p.value, x: cx, y: cy })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              )
            })}

            {/* Hover Crosshair Dot */}
            {hoveredPoint && (
              <g>
                <line
                  x1={PAD_L}
                  y1={hoveredPoint.y}
                  x2={PAD_L + plotW}
                  y2={hoveredPoint.y}
                  stroke="#ffffff"
                  strokeWidth="0.75"
                  strokeDasharray="1,1"
                />
                <circle
                  cx={hoveredPoint.x}
                  cy={hoveredPoint.y}
                  r="4"
                  fill="#ffffff"
                  stroke={config.color}
                  strokeWidth="2"
                />
              </g>
            )}
          </svg>

          {/* Hover Readout Tooltip */}
          {hoveredPoint && (
            <div className="absolute top-2 right-2 px-2 py-1 rounded bg-[#081a33]/95 border border-sky-400/50 text-[10px] font-mono text-white shadow-lg pointer-events-none">
              <div>Depth: <span className="text-sky-300 font-bold">{hoveredPoint.depth.toFixed(1)} m</span></div>
              <div>{config.label}: <span className="text-emerald-300 font-bold">{hoveredPoint.value.toFixed(3)} {config.unit}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
