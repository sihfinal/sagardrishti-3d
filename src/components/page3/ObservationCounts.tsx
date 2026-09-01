"use client"

import React from "react"
import { OBSERVATION_COUNTS } from "./page3Config"

interface ObservationCountsProps {
  counts?: Record<string, number>
  visibleTypes?: Record<string, boolean>
  onToggleType?: (type: string) => void
}

export default function ObservationCounts({
  counts = {},
  visibleTypes = { argo: true, glider: true, ctd: true, bgc: true },
  onToggleType,
}: ObservationCountsProps) {
  return (
    <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-lg shadow-black/40 select-none">
      <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-2.5 flex items-center justify-between">
        <span>OBSERVATION COUNTS</span>
        <span className="text-[9px] font-mono text-sky-400/80 font-normal">Real Data</span>
      </h3>
      <div className="space-y-1.5">
        {OBSERVATION_COUNTS.map((item) => {
          const isVisible = visibleTypes[item.id] !== false
          const realCount = counts[item.id] !== undefined ? counts[item.id] : item.count

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggleType?.(item.id)}
              className={`w-full flex items-center justify-between py-1.5 px-2.5 rounded-lg border transition-all text-xs ${
                isVisible
                  ? "bg-[#040e1b]/70 border-sky-500/30 hover:bg-[#0d223f]/80"
                  : "bg-[#030812]/40 border-slate-800 opacity-50 hover:opacity-75"
              }`}
              title={isVisible ? `Click to hide ${item.label}` : `Click to show ${item.label}`}
            >
              <div className="flex items-center gap-2">
                {item.shape === "circle" && (
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block shadow-[0_0_8px_currentColor]"
                    style={{ backgroundColor: item.color, color: item.color }}
                  />
                )}
                {item.shape === "square" && (
                  <span
                    className="w-2.5 h-2.5 rounded-[2px] inline-block shadow-[0_0_8px_currentColor]"
                    style={{ backgroundColor: item.color, color: item.color }}
                  />
                )}
                {item.shape === "triangle" && (
                  <span
                    className="inline-block text-[11px] leading-none drop-shadow-[0_0_6px_currentColor]"
                    style={{ color: item.color }}
                  >
                    ▲
                  </span>
                )}
                <span className="text-slate-200 text-xs font-medium">{item.label}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="font-bold text-white text-xs tracking-wider">
                  {realCount.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400">
                  {isVisible ? "✓" : "✗"}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
