import type { ReactNode } from "react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";

/**
 * Public customer shopper layout.
 * Warm luxury dark espresso and camel amber glassmorphism aesthetic.
 * Focuses on clean centered max-w-3xl column with ambient lighting depth.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#140D08] via-[#0E0905] to-[#070503] text-[#FAF7F2] selection:bg-[#B88A58]/30 selection:text-[#FFF5EB] antialiased font-sans overflow-x-hidden">
      {/* Ambient background lighting mesh orbs that provide light refraction for glassmorphism */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden -z-10 select-none">
        {/* Top vibrant amber/camel spotlight behind hero passport */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[750px] h-[480px] bg-gradient-to-br from-amber-500/30 via-[#B88A58]/25 to-orange-500/20 rounded-full blur-[110px]" />
        {/* Mid-screen emerald glow representing verification */}
        <div className="absolute top-[42%] -left-28 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[120px]" />
        {/* Lower warm espresso glow anchor */}
        <div className="absolute bottom-10 right-0 w-[600px] h-[600px] bg-[#8C6D53]/25 rounded-full blur-[130px]" />
      </div>

      {/* Frosted Sticky Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#140D08]/60 backdrop-blur-2xl transition-all">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 sm:px-6 py-3">
          <AppLink
            href={paths.home}
            className="group flex items-center gap-2.5 transition-opacity hover:opacity-90"
            aria-label="TraceX home"
          >
            {/* The Finalized TraceX Brand Shield Icon with Transparent Background */}
            <img
              src="/images/tracex-icon-dark-optimized.png"
              alt="TraceX Icon"
              className="h-8 w-auto object-contain filter drop-shadow-[0_2px_8px_rgba(245,158,11,0.25)] group-hover:scale-105 transition-transform"
            />
            <div className="flex items-baseline gap-0.5">
              <span className="text-lg font-bold tracking-tight text-[#FAF7F2]">Trace</span>
              <span className="text-lg font-bold tracking-tight text-[#B88A58]">X</span>
            </div>
          </AppLink>

          <div className="flex items-center gap-2.5">
            <span className="glass-pill-emerald inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium text-emerald-200">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Digital Passport
            </span>
          </div>
        </div>
      </header>

      {/* Main Journey Container: Comfortable Centered max-w-3xl */}
      <main className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>

      {/* Public Footer */}
      <footer className="relative z-10 border-t border-[#B88A58]/15 bg-[#120B07]/80 backdrop-blur-md mt-12">
        <div className="mx-auto flex max-w-3xl flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-5 text-xs text-[#A89885]/70">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#FAF7F2]">TraceX</span>
            <span>· Blockchain-Backed Provenance & Garment Passport</span>
          </div>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="inline-flex items-center gap-1 text-[#D6C2A8] hover:text-[#FAF7F2] transition-colors cursor-pointer select-none"
            aria-label="Scroll back to top of page"
          >
            Back to top ↑
          </button>
        </div>
      </footer>
    </div>
  );
}
