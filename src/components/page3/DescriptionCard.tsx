"use client"

import React from "react"
import { DataLayerItem } from "./page3Config"

interface DescriptionCardProps {
  activeLayer: DataLayerItem | null
}

export default function DescriptionCard({ activeLayer }: DescriptionCardProps) {
  if (!activeLayer) {
    return (
      <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-lg shadow-black/40">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-2">
          DESCRIPTION
        </h3>
        <p className="text-xs text-slate-200 leading-relaxed mb-2.5">
          Realistic satellite Earth imagery with Natural Earth sovereign country boundaries and real-time in-situ profiling observations.
        </p>

        <div className="pt-2 border-t border-sky-900/30 flex flex-col gap-1 text-[11px] font-mono">
          <div className="flex items-center justify-between text-slate-400">
            <span>Source:</span>
            <span className="text-sky-300 font-semibold">NASA / Blue Marble • NOAA WOD</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Coverage:</span>
            <span className="text-slate-300 text-[10px]">Global Earth & Indian Ocean</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-lg shadow-black/40">
      <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-2">
        DESCRIPTION
      </h3>
      <p className="text-xs text-slate-200 leading-relaxed mb-2.5">
        {activeLayer.description}
      </p>

      <div className="pt-2 border-t border-sky-900/30 flex flex-col gap-1 text-[11px] font-mono">
        <div className="flex items-center justify-between text-slate-400">
          <span>Source:</span>
          <span className="text-sky-300 font-semibold">{activeLayer.source}</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span>Product:</span>
          <span className="text-slate-300 text-[10px]">{activeLayer.product}</span>
        </div>
      </div>
    </div>
  )
}
