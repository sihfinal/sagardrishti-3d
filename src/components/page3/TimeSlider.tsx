"use client"

import React, { useState, useEffect } from "react"
import { TIME_CONFIG } from "./page3Config"

interface TimeSliderProps {
  currentDateStr: string
  stepIndex: number
  onStepChange: (index: number) => void
}

export default function TimeSlider({
  currentDateStr,
  stepIndex,
  onStepChange,
}: TimeSliderProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)

  useEffect(() => {
    if (!isPlaying) return
    const intervalMs = Math.round(1000 / speed)
    const timer = setInterval(() => {
      onStepChange((stepIndex + 1) % TIME_CONFIG.totalSteps)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [isPlaying, speed, stepIndex, onStepChange])

  return (
    <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-lg shadow-black/40">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase">
          TIME
        </h3>
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-sky-950/80 border border-sky-400/40 text-sky-300 shadow">
          {currentDateStr}
        </span>
      </div>

      <div className="relative flex flex-col gap-1.5 pt-1">
        <input
          type="range"
          min={0}
          max={TIME_CONFIG.totalSteps - 1}
          value={stepIndex}
          onChange={(e) => {
            setIsPlaying(false)
            onStepChange(Number(e.target.value))
          }}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-400 px-0.5">
          <span>{TIME_CONFIG.startDateStr}</span>
          <span className="text-sky-300 font-semibold">{currentDateStr}</span>
          <span>{TIME_CONFIG.endDateStr}</span>
        </div>
      </div>

      {/* Media Playback Controls */}
      <div className="flex items-center justify-center gap-3 mt-3 pt-2.5 border-t border-sky-900/30">
        <button
          type="button"
          onClick={() => onStepChange(Math.max(0, stepIndex - 1))}
          className="w-7 h-7 rounded-lg bg-[#040e1b] hover:bg-sky-950/80 border border-slate-700/60 hover:border-sky-500/50 text-slate-300 hover:text-white flex items-center justify-center text-xs transition-colors"
          title="Previous Step"
        >
          ⏮
        </button>

        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shadow-md transition-all ${
            isPlaying
              ? "bg-amber-500 text-slate-950 border border-amber-300"
              : "bg-sky-500 hover:bg-sky-400 text-slate-950 border border-sky-300 shadow-sky-500/20"
          }`}
          title={isPlaying ? "Pause Timeline" : "Play Timeline"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        <button
          type="button"
          onClick={() => onStepChange((stepIndex + 1) % TIME_CONFIG.totalSteps)}
          className="w-7 h-7 rounded-lg bg-[#040e1b] hover:bg-sky-950/80 border border-slate-700/60 hover:border-sky-500/50 text-slate-300 hover:text-white flex items-center justify-center text-xs transition-colors"
          title="Next Step"
        >
          ⏭
        </button>

        <button
          type="button"
          onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
          className="px-2 py-1 rounded bg-[#040e1b] border border-slate-700/60 text-[10px] font-mono font-bold text-sky-300 hover:text-white hover:border-sky-500/50 transition-colors"
          title="Toggle Playback Speed"
        >
          {speed}x
        </button>
      </div>
    </div>
  )
}
