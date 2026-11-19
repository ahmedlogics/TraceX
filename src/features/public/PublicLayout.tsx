import type { ReactNode } from "react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";

/**
 * Luxury midnight-purple public shopper layout.
 * Features atmospheric radial glows, editorial typography, and high-contrast glass surfaces.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="relative min-h-screen bg-[#0B0713] text-[#F3F0F8] selection:bg-purple-500/30 selection:text-purple-100 antialiased font-sans">
      {/* Ambient luminous purple glowing atmospheric backgrounds */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 h-[560px] w-[900px] rounded-full bg-purple-600/15 blur-[130px] animate-ambient-pulse"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-32 right-[-5%] h-[500px] w-[500px] rounded-full bg-fuchsia-700/10 blur-[140px]"
      />

      {/* Top Brand & Provenance Bar */}
      <header className="sticky top-0 z-40 border-b border-purple-900/40 bg-[#0B0713]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-8 py-4">
          {/* Brand Mark with Stitch Wave */}
          <AppLink
            href={paths.home}
            className="group flex items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/15 border border-purple-400/30 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.35)] group-hover:border-purple-300 transition-colors">
              {/* Signature continuous thread stitch wave */}
              <svg
                width="18"
                height="11"
                viewBox="0 0 24 14"
                fill="none"
                className="text-white"
                aria-hidden="true"
              >
                <path
                  d="M1 7C3.5 2 6 2 8.5 7C11 12 13.5 12 16 7C18.5 2 21 2 23 7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-lg font-bold tracking-tight text-white">WearTrail</span>
          </AppLink>

          {/* Right Navigation & Status */}
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-block text-xs font-medium tracking-wide text-purple-300/80">
              Garment journey
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-950/40 px-3.5 py-1 text-xs font-medium text-purple-200 shadow-sm backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
              Demo record
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto max-w-5xl px-4 sm:px-8 py-8 md:py-12">{children}</main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-purple-900/30 bg-[#0B0713]/90 mt-16">
        <div className="mx-auto flex max-w-5xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-8 py-8 text-xs text-purple-300/70">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">WearTrail</span>
            <span className="text-purple-500/50">·</span>
            <span>The story behind the stitch</span>
          </div>

          <div className="text-center sm:text-right flex items-center gap-6">
            <span className="hidden md:inline text-purple-400/60">
              Public read-only provenance · No wallet or login required
            </span>
            <button
              type="button"
              onClick={scrollToTop}
              className="inline-flex items-center gap-1 text-purple-200 hover:text-white transition-colors cursor-pointer"
            >
              Back to top ↑
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
