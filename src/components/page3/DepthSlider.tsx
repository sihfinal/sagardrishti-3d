"use client"

import React from "react"
import { DEPTH_CONFIG } from "./page3Config"

interface DepthSliderProps {
  depth: number
  onChangeDepth: (val: number) => void
}

export default function DepthSlider({ depth, onChangeDepth }: DepthSliderProps) {
  return (
    <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-lg shadow-black/40">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase">
          DEPTH <span className="text-slate-400 font-normal">(Model Layer)</span>
        </h3>
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-sky-950/80 border border-sky-400/40 text-sky-300 shadow">
          {depth} {DEPTH_CONFIG.unit}
        </span>
      </div>

      <div className="relative flex flex-col gap-1.5 pt-1">
        <input
          type="range"
          min={DEPTH_CONFIG.min}
          max={DEPTH_CONFIG.max}
          step={25}
          value={depth}
          onChange={(e) => onChangeDepth(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-400 px-0.5">
          <span>0 m</span>
          <span>2000 m</span>
        </div>
      </div>
    </div>
  )
}
