"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { motion } from "framer-motion"
import { useOcean } from "@/lib/store"

const GlobeCanvas = dynamic(() => import("@/components/Globe"), {
  ssr: false,
  loading: () => null,
})

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.25 + i * 0.14, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
  }),
}

export default function Landing() {
  const router = useRouter()
  const theme = useOcean((s) => s.theme)
  const setTheme = useOcean((s) => s.setTheme)

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light"
    if (saved) {
      setTheme(saved)
    } else {
      document.documentElement.setAttribute("data-theme", "dark")
    }
  }, [setTheme])

  function diveIn() {
    useOcean.getState().setViewMode("globe")
    router.push("/explore?view=globe")
  }

  return (
    <main
      className="relative h-screen w-screen overflow-hidden text-slate-100"
      style={{
        background: "var(--bg-landing)"
      }}
    >
      {/* top right floating theme toggle */}
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-full glass p-2.5 text-xs font-bold transition-all shadow-md bg-[#0b2545]/60 hover:bg-[#0b2545]/80 border border-sky-500/30 hover:border-sky-400 pointer-events-auto flex items-center justify-center text-sky-300 hover:text-white"
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
      {/* globe backdrop */}
      <div className="absolute inset-0">
        <GlobeCanvas onSelectRoi={diveIn} />
        {/* vignette + grade */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(120% 90% at 50% 42%, transparent 55%, var(--vignette-color) 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background: "linear-gradient(to top, var(--fade-color) 12%, transparent)",
          }}
        />
      </div>

      {/* content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-end pb-24 text-center px-6 pointer-events-none">
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show">
          <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1 text-xs tracking-widest text-sky-300 uppercase">
            SIH 26067 · INCOIS · Ministry of Earth Sciences
          </span>
        </motion.div>

        <motion.h1
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-5 text-5xl md:text-7xl font-black tracking-tight leading-[1.05]"
        >
          <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-teal-300 bg-clip-text text-transparent">
            SagarDrishti-3D
          </span>
          <span className="block mt-2 text-xl md:text-3xl font-semibold text-slate-300">
            One Ocean. Every Dimension.
          </span>
        </motion.h1>

        <motion.p
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-5 max-w-xl text-sm md:text-base text-slate-400 leading-relaxed"
        >
          Interactive 3D visualization of ocean model outputs and in-situ observations across space, depth and time.
          <span className="block mt-2 text-xs md:text-sm text-slate-500">
            Explore temperature, salinity, current vectors and chlorophyll alongside Argo, Glider, CTD and BGC observations in one browser-based environment.
          </span>
        </motion.p>

        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-9 flex flex-wrap items-center justify-center gap-4 pointer-events-auto"
        >
          <button
            onClick={() => {
              useOcean.getState().setViewMode("volume")
              router.push("/explore")
            }}
            className="group relative overflow-hidden rounded-full bg-gradient-to-r from-sky-500 to-teal-400 px-8 py-3.5 font-semibold text-slate-950 shadow-lg shadow-sky-500/25 transition-transform hover:scale-[1.04] active:scale-[0.98]"
          >
            <span className="relative z-10">Launch 3D Explorer</span>
            <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-500 group-hover:translate-x-0" />
          </button>
          <button
            onClick={diveIn}
            className="rounded-full border border-white/15 bg-white/5 backdrop-blur px-7 py-3.5 font-medium text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-400/10"
          >
            Fly to the study region ↗
          </button>
        </motion.div>

        <motion.div
          custom={4}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-10 flex gap-6 text-[11px] uppercase tracking-wider text-slate-500"
        >
          <span>NOAA WOA23 fields</span>
          <span>·</span>
          <span>463 Argo floats</span>
          <span>·</span>
          <span>HYCOM currents</span>
          <span>·</span>
          <span>BGC chlorophyll</span>
        </motion.div>
      </div>

      {/* scroll hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
        className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-[10px] text-slate-600 tracking-widest uppercase pointer-events-none"
      >
        click the glowing marker to dive in
      </motion.div>
    </main>
  )
}
