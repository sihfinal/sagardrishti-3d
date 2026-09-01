"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ObservationItem, fetchObservationProfile, ObservationProfileResponse } from "@/lib/observationsApi"
import ObservationProfileChart from "./ObservationProfileChart"

interface ObservationDetailModalProps {
  observation: ObservationItem | null
  onClose: () => void
}

const TYPE_METADATA: Record<string, { label: string; color: string; icon: string }> = {
  argo: { label: "Argo Profiling Float", color: "#10b981", icon: "●" },
  glider: { label: "Autonomous Underwater Glider", color: "#06b6d4", icon: "■" },
  ctd: { label: "Shipboard CTD Rosette Cast", color: "#f97316", icon: "▲" },
  bgc: { label: "Biogeochemical Argo Float", color: "#a855f7", icon: "◆" },
}

export default function ObservationDetailModal({
  observation,
  onClose,
}: ObservationDetailModalProps) {
  const [profileData, setProfileData] = useState<ObservationProfileResponse | null>(null)
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Fetch depth profile only when a new observation is selected
  useEffect(() => {
    let isMounted = true
    if (!observation?.id) {
      setProfileData(null)
      setLoadingProfile(false)
      setProfileError(null)
      return
    }

    setLoadingProfile(true)
    setProfileError(null)

    fetchObservationProfile(observation.id)
      .then((res) => {
        if (!isMounted) return
        setProfileData(res)
        setLoadingProfile(false)
        setProfileError(null)
      })
      .catch((err) => {
        if (!isMounted) return
        console.warn("Observation profile fetch error:", err)
        setLoadingProfile(false)
        setProfileError("Observation profile unavailable")
      })

    return () => {
      isMounted = false
    }
  }, [observation?.id])

  if (!observation) return null

  const meta = TYPE_METADATA[observation.type] || {
    label: observation.type.toUpperCase(),
    color: "#38bdf8",
    icon: "●",
  }

  const formatCoord = (val: number, isLat: boolean) => {
    if (isLat) {
      return val >= 0 ? `${val.toFixed(2)}°N` : `${Math.abs(val).toFixed(2)}°S`
    }
    return val >= 0 ? `${val.toFixed(2)}°E` : `${Math.abs(val).toFixed(2)}°W`
  }

  return (
    <AnimatePresence>
      <div className="absolute top-14 right-4 z-40 max-w-md w-full pointer-events-auto select-none max-h-[85vh] overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl bg-[#081a33]/95 border border-sky-400/40 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.85)] text-slate-100 flex flex-col gap-3 backdrop-blur-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-sky-900/40">
            <div className="flex items-center gap-2">
              <span
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-xs font-bold shadow-md"
                style={{ color: meta.color }}
              >
                {meta.icon}
              </span>
              <div className="flex flex-col">
                <span className="text-[10px] font-mono font-bold tracking-widest text-sky-400 uppercase">
                  INSTRUMENT DETAILS & PROFILE
                </span>
                <span className="text-xs font-bold text-white tracking-wide">
                  {meta.label}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 rounded-lg bg-[#040e1b] border border-slate-700/60 hover:border-rose-400 text-slate-400 hover:text-rose-300 text-xs flex items-center justify-center transition-colors font-bold"
              title="Close Details"
            >
              ✕
            </button>
          </div>

          {/* Details Grid */}
          <div className="rounded-xl bg-[#040e1b]/90 border border-sky-500/20 p-3 space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Platform / Cast ID:</span>
              <span className="text-white font-bold tracking-wide">
                #{observation.platform_id || observation.id}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Coordinates:</span>
              <span className="text-sky-300 font-semibold">
                {formatCoord(observation.latitude, true)}, {formatCoord(observation.longitude, false)}
              </span>
            </div>

            {observation.timestamp && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Observation Date:</span>
                <span className="text-slate-200">{observation.timestamp}</span>
              </div>
            )}

            {observation.max_depth !== undefined && observation.max_depth > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Max Sounding Depth:</span>
                <span className="text-sky-300 font-bold">{observation.max_depth} m</span>
              </div>
            )}

            <div className="pt-1.5 border-t border-sky-900/30">
              <span className="text-slate-400 text-[10px] block mb-1">AVAILABLE VARIABLES:</span>
              <div className="flex flex-wrap gap-1">
                {observation.variables && observation.variables.length > 0 ? (
                  observation.variables.map((v) => (
                    <span
                      key={v}
                      className="px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-500/30 text-[9px] text-sky-200 font-semibold capitalize"
                    >
                      {v}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 text-[10px]">Temperature, Salinity</span>
                )}
              </div>
            </div>
          </div>

          {/* Scientific Depth Profile Section */}
          {loadingProfile ? (
            <div className="rounded-xl bg-[#040e1b]/90 border border-sky-500/20 p-6 flex flex-col items-center justify-center gap-2 text-sky-400">
              <span className="w-6 h-6 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
              <span className="text-xs font-mono font-semibold">Loading observation profile…</span>
            </div>
          ) : profileError ? (
            <div className="rounded-xl bg-rose-950/40 border border-rose-500/30 p-4 text-center text-rose-300 text-xs font-mono">
              {profileError}
            </div>
          ) : profileData && profileData.data && profileData.data.length > 0 ? (
            <ObservationProfileChart
              data={profileData.data}
              availableVariables={profileData.variables || observation.variables}
            />
          ) : (
            <div className="rounded-xl bg-[#040e1b]/90 border border-sky-500/20 p-4 text-center text-slate-500 text-xs font-mono">
              No depth-resolved measurements available for this profile.
            </div>
          )}

          {/* Source Attribution */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
            <span>Source:</span>
            <span className="text-slate-300 font-medium truncate max-w-[240px]">
              {observation.source || "NOAA / NCEI World Ocean Database"}
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
