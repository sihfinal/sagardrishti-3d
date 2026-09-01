"use client"

import React from "react"
import { DATA_LAYERS, DataLayerItem } from "./page3Config"

interface DataLayerSelectorProps {
  activeLayerId: string | null
  onSelectLayer: (layer: DataLayerItem | null) => void
  layerVisibility: Record<string, boolean>
  onToggleVisibility: (layerId: string) => void
}

export default function DataLayerSelector({
  activeLayerId,
  onSelectLayer,
  layerVisibility,
  onToggleVisibility,
}: DataLayerSelectorProps) {
  return (
    <div className="bg-[#08172b]/85 backdrop-blur-xl border border-sky-500/20 rounded-xl p-3.5 shadow-lg shadow-black/40">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase">
          DATA LAYERS
        </h3>
      </div>

      <div className="space-y-1">
        {/* Base Ocean / No Model Layer Option */}
        <div
          onClick={() => onSelectLayer(null)}
          className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg cursor-pointer transition-all ${
            activeLayerId === null
              ? "bg-[#102a4a]/90 border border-sky-400/50 text-white shadow-md shadow-sky-950/50"
              : "bg-[#040e1b]/50 border border-transparent hover:border-sky-500/30 text-slate-300 hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-sm select-none">🌍</span>
            <span className="text-xs font-semibold tracking-wide">Base Ocean (No Layer)</span>
          </div>
          <span className="text-[10px] font-mono text-sky-400">
            {activeLayerId === null ? "● Active" : ""}
          </span>
        </div>

        {DATA_LAYERS.map((layer) => {
          const isActive = layer.id === activeLayerId
          const isVisible = layerVisibility[layer.id] ?? true

          return (
            <div
              key={layer.id}
              onClick={() => onSelectLayer(isActive ? null : layer)}
              className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg cursor-pointer transition-all ${
                isActive
                  ? "bg-[#102a4a]/90 border border-sky-400/50 text-white shadow-md shadow-sky-950/50"
                  : "bg-[#040e1b]/50 border border-transparent hover:border-sky-500/30 text-slate-300 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm select-none">{layer.icon}</span>
                <span className="text-xs font-semibold tracking-wide">{layer.label}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleVisibility(layer.id)
                }}
                className="text-slate-400 hover:text-sky-300 transition-colors p-1 rounded hover:bg-white/5"
                title={isVisible ? "Hide layer" : "Show layer"}
              >
                {isVisible ? (
                  <svg
                    className="w-3.5 h-3.5 text-sky-400 opacity-90"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-3.5 h-3.5 text-slate-500 opacity-50"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                    />
                  </svg>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
