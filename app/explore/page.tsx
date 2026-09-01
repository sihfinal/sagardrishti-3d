"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { fetchManifest } from "@/lib/api"
import { useOcean } from "@/lib/store"
import { useUrlState } from "@/lib/urlState"
import Manual from "@/ui/Manual"
import GuidedTour from "@/ui/GuidedTour"
import ConceptInfoCard from "@/ui/ConceptInfoCard"
import ScientificJourney from "@/ui/ScientificJourney"
import Page3Workstation from "@/components/page3/Page3Workstation"

const GlobeCanvas = dynamic(() => import("@/components/Globe"), {
  ssr: false,
  loading: () => <BootScreen label="spinning up the globe…" />,
})

function BootScreen({ label }: { label: string }) {
  return (
    <div className="h-full w-full grid place-items-center">
      <div className="flex flex-col items-center gap-4 text-slate-400">
        <motion.div
          className="h-12 w-12 rounded-full border-2 border-sky-500/30 border-t-sky-400"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
        />
        <span className="text-xs tracking-widest uppercase">{label}</span>
      </div>
    </div>
  )
}




export default function ExplorePage() {
  const manifest = useOcean((s) => s.manifest)
  const setManifest = useOcean((s) => s.setManifest)
  const setVariable = useOcean((s) => s.setVariable)
  const hoverInfo = useOcean((s) => s.hoverInfo)
  
  const viewMode = useOcean((s) => s.viewMode)
  const setViewMode = useOcean((s) => s.setViewMode)
  const theme = useOcean((s) => s.theme)
  const setTheme = useOcean((s) => s.setTheme)
  
  const [manualOpen, setManualOpen] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [activeTerm, setActiveTerm] = useState<string | null>(null)

  useUrlState(manifest)

  useEffect(() => {
    fetchManifest().then((m) => {
      setManifest(m)
      if (m && m.variables.length > 0) {
        setVariable("temp_annual")
      }
    })
  }, [setManifest, setVariable])

  return (
    <main 
      className="relative h-screen w-screen overflow-hidden select-none text-slate-100"
      style={{ background: "var(--bg-study)" }}
    >
      <AnimatePresence mode="wait">
        {viewMode === "globe" && (
          <motion.div
            key="globe"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 lg:left-1/2 lg:w-1/2"
          >
            <GlobeCanvas
              cameraZ={6}
              onSelectRoi={() => setViewMode("volume")}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Page 2 Glass Top Bar (Globe Mode Only) ─── */}
      <AnimatePresence>
        {viewMode === "globe" && (
          <motion.header
            initial={{ y: -56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -56, opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-0 inset-x-0 z-20 h-16 px-4 md:px-6 flex items-center justify-between bg-transparent border-0 pointer-events-none"
          >
            <Link href="/" className="flex items-center gap-3 group pointer-events-auto">
              <span className="h-6 w-6 md:h-7 md:w-7 rounded-lg bg-gradient-to-br from-sky-400 to-teal-300 shadow shadow-sky-500/40" />
              <span className="font-black tracking-tight text-sm md:text-base group-hover:text-sky-300 transition-colors">
                SagarDrishti-3D
              </span>
            </Link>
            <div className="flex items-center gap-2.5">
              {/* ← Main Page Button */}
              <Link
                href="/"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-300 hover:text-white bg-[#0a1f3d]/60 hover:bg-[#0f2d59] border border-sky-500/30 transition-all flex items-center gap-1 shadow-sm pointer-events-auto"
                title="Return to Main Landing Page"
              >
                <span>←</span>
                <span>Main Page</span>
              </Link>

              {/* 📖 Manual Button */}
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:text-white bg-[#0a1f3d]/60 hover:bg-[#0f2d59] border border-slate-700/60 hover:border-sky-400/50 transition-all flex items-center gap-1.5 shadow-sm pointer-events-auto"
              >
                <span>📖</span>
                <span>Manual</span>
              </button>

              {/* ☀️ / 🌙 Theme Toggle Button */}
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-sky-300 hover:text-white bg-[#0a1f3d]/60 hover:bg-[#0f2d59] border border-slate-700/60 hover:border-sky-400/50 transition-all shadow-sm pointer-events-auto"
                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* ─── Globe Mode 50 / 50 Workspace Layout ─── */}
      <AnimatePresence>
        {viewMode === "globe" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pt-16 flex flex-col lg:flex-row pointer-events-none overflow-hidden"
          >
            {/* ─── LEFT 50% COLUMN: Educational Knowledge Path / Contextual Information Card ─── */}
            <div className="w-full lg:w-1/2 h-[calc(100vh-64px)] flex flex-col p-4 md:p-6 lg:p-8 z-20 pointer-events-auto overflow-hidden">
              <AnimatePresence mode="wait">
                {activeTerm ? (
                  <ConceptInfoCard
                    key="concept-card"
                    activeTerm={activeTerm}
                    onClose={() => setActiveTerm(null)}
                  />
                ) : (
                  <ScientificJourney
                    key="scientific-journey"
                    activeTerm={activeTerm}
                    onSelectTerm={(t) => setActiveTerm(t)}
                    onStartDiscovery={() => setShowTour(true)}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* ─── RIGHT 50% COLUMN: 3D Ocean Globe Viewport & Direct Dive Entry ─── */}
            <div className="w-full lg:w-1/2 h-[calc(100vh-64px)] flex flex-col items-center justify-end pb-8 md:pb-12 z-10 pointer-events-none relative">
              {/* Geographic Coordinates Context Indicator */}
              <div className="flex flex-col items-center gap-1.5 mb-3">
                <span className="px-4 py-1.5 rounded-full text-[10px] md:text-xs font-mono font-bold tracking-widest uppercase bg-[#081a33]/85 border border-sky-400/40 text-sky-300 backdrop-blur-md shadow-lg shadow-black/40 pointer-events-auto">
                  INDIAN OCEAN STUDY REGION · LAT -35..30 · LON 40..100
                </span>
              </div>

              {/* Primary Direct Action Button to Dive into Ocean Volume */}
              <button
                onClick={() => setViewMode("volume")}
                className="group relative overflow-hidden px-8 py-3.5 md:px-10 md:py-4 rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-teal-300 text-slate-950 font-black text-xs md:text-sm tracking-widest uppercase shadow-xl shadow-sky-400/30 transition-all duration-300 hover:scale-[1.04] active:scale-[0.98] pointer-events-auto flex items-center gap-2"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <span>Dive into the Ocean Volume</span>
                  <span className="text-base group-hover:translate-y-0.5 transition-transform">↓</span>
                </span>
                <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-500 group-hover:translate-x-0" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Hover tooltip (Volume Mode) ─── */}
      <AnimatePresence>
        {hoverInfo && viewMode === "volume" && (
          <motion.div
            key={`${hoverInfo.id}-${hoverInfo.screen.x}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-30 rounded-lg glass border-sky-500/30 px-2.5 py-1.5 text-xs shadow-xl"
            style={{ left: hoverInfo.screen.x + 14, top: hoverInfo.screen.y + 14 }}
          >
            <div className="font-semibold">
              {hoverInfo.type === "argo"
                ? "Argo"
                : hoverInfo.type === "glider"
                  ? "Glider"
                  : "BGC float"}{" "}
              {hoverInfo.id}
            </div>
            <div className="text-slate-400">{hoverInfo.lastSeen.slice(0, 16).replace("T", " ")} UTC</div>
            {hoverInfo.obsTemp !== null && (
              <div>surface obs: <span className="text-sky-300 font-mono">{hoverInfo.obsTemp.toFixed(2)}°C</span></div>
            )}
            {hoverInfo.modelTemp !== null && (
              <div>model @ cell: <span className="text-amber-300 font-mono">{hoverInfo.modelTemp.toFixed(2)}°C</span></div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── User Manual Dialog (3x3 grid) ─── */}
      <Manual open={manualOpen} onClose={() => setManualOpen(false)} />

      {/* ─── Guided Walkthrough Modal (8 Steps) ─── */}
      <GuidedTour 
        open={showTour} 
        onClose={() => setShowTour(false)} 
        onComplete={() => setViewMode("volume")} 
      />

      {/* ─── PAGE 3: Complete Workstation Shell (Stage 1: Global Overview) ─── */}
      <AnimatePresence mode="wait">
        {viewMode === "volume" && (
          <motion.div
            key="page3-workstation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-30 pointer-events-auto"
          >
            <Page3Workstation
              onReturnToStudyRegion={() => setViewMode("globe")}
              onOpenManual={() => setManualOpen(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
