"use client"

import React from "react"
import { HOW_TO_USE_STEPS } from "./page3Config"

export default function HowToUseCard() {
  return (
    <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-lg shadow-black/40">
      <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase mb-2">
        HOW TO USE
      </h3>
      <div className="space-y-1.5">
        {HOW_TO_USE_STEPS.map((step, idx) => (
          <div key={idx} className="text-xs text-slate-300 flex items-start gap-1.5 leading-snug">
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
