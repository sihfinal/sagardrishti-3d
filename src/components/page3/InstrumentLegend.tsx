"use client"

import React from "react"
import { INSTRUMENT_LEGEND } from "./page3Config"

export default function InstrumentLegend() {
  return (
    <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-lg shadow-black/40">
      <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-2">
        LEGEND <span className="text-slate-400 font-normal">(Instruments)</span>
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {INSTRUMENT_LEGEND.map((item) => (
          <div key={item.id} className="flex items-center gap-2 py-0.5">
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
            <span className="text-xs text-slate-200 font-medium truncate">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
