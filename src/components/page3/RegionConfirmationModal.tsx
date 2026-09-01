"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { GeographicBounds } from "./globe/RegionSelectionBox"

interface RegionConfirmationModalProps {
  open: boolean
  bounds: GeographicBounds | null
  onConfirm: () => void
  onCancel: () => void
}

export default function RegionConfirmationModal({
  open,
  bounds,
  onConfirm,
  onCancel,
}: RegionConfirmationModalProps) {
  if (!open || !bounds) return null

  const dLat = (bounds.latMax - bounds.latMin).toFixed(2)
  const dLon = (bounds.lonMax - bounds.lonMin).toFixed(2)

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[3px] pointer-events-auto select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md rounded-2xl bg-[#081a33]/95 border border-sky-400/40 p-5 md:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-slate-100 flex flex-col gap-4"
        >
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-teal-300 text-slate-950 flex items-center justify-center text-xl font-black shadow-md shadow-sky-500/30 flex-shrink-0">
              🌊
            </div>
            <div className="flex-1">
              <span className="text-[10px] font-mono font-bold tracking-widest text-sky-400 uppercase block mb-0.5">
                GEOGRAPHIC ROI CONFIRMATION
              </span>
              <h2 className="text-base md:text-lg font-bold text-white tracking-tight leading-snug">
                Explore Ocean Observations?
              </h2>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-slate-300 leading-relaxed">
            Continue to explore the 3D ocean volume and in-situ instrument observations available within this selected geographic region?
          </p>

          {/* Selected Region Coordinates Card */}
          <div className="rounded-xl bg-[#040e1b]/90 border border-sky-500/30 p-3.5 flex flex-col gap-2 font-mono text-xs">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-sky-900/40">
              <span>SELECTED REGION</span>
              <span className="text-sky-300">Δ {dLat}° × {dLon}°</span>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <span className="text-slate-400">Latitude:</span>
              <span className="text-white font-bold tracking-wide">
                {bounds.latMin > 0 ? `+${bounds.latMin}` : bounds.latMin}°
                <span className="text-sky-400 mx-1.5">→</span>
                {bounds.latMax > 0 ? `+${bounds.latMax}` : bounds.latMax}°
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Longitude:</span>
              <span className="text-white font-bold tracking-wide">
                {bounds.lonMin > 0 ? `+${bounds.lonMin}` : bounds.lonMin}°
                <span className="text-sky-400 mx-1.5">→</span>
                {bounds.lonMax > 0 ? `+${bounds.lonMax}` : bounds.lonMax}°
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-600/60 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-400 via-cyan-300 to-teal-300 text-slate-950 text-xs font-bold uppercase tracking-wider shadow-lg shadow-sky-400/25 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1.5"
            >
              <span>YES, EXPLORE</span>
              <span className="text-sm">→</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
