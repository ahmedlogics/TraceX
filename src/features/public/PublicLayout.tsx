import type { ReactNode } from "react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";

/**
 * Public customer shopper layout.
 * Scoped muted plum & purple theme with restrained ambient gradients and refined glass surfaces.
 * Strictly isolates the public journey theme from the internal staff application.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#1E152A] via-[#171022] to-[#120D1C] text-[#F3F0F8] selection:bg-purple-500/30 selection:text-purple-100 antialiased font-sans">
      {/* Subtle, soft ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 h-[450px] w-[750px] rounded-full bg-purple-600/10 blur-[130px]"
      />

      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-purple-500/15 bg-[#1A1225]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <AppLink
            href={paths.home}
            className="group flex items-center gap-2 transition-opacity hover:opacity-90"
            aria-label="TraceX home"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-500/15 border border-purple-400/25 text-purple-200">
              <svg
                width="14"
                height="9"
                viewBox="0 0 24 14"
                fill="none"
                className="text-white"
                aria-hidden="true"
              >
                <path
                  d="M1 7C3.5 2 6 2 8.5 7C11 12 13.5 12 16 7C18.5 2 21 2 23 7"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-base font-bold tracking-tight text-white">TraceX</span>
          </AppLink>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-medium text-purple-300/80">
              Garment journey
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-950/40 px-2.5 py-0.5 text-[11px] font-mono text-purple-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Verified
            </span>
          </div>
        </div>
      </header>

      {/* Main Journey Container */}
      <main className="relative z-10 mx-auto max-w-2xl px-4 py-8">{children}</main>

      {/* Public Footer */}
      <footer className="relative z-10 border-t border-purple-500/15 bg-[#140D1E]/60 mt-12">
        <div className="mx-auto flex max-w-2xl flex-col sm:flex-row items-center justify-between gap-3 px-4 py-6 text-xs text-purple-300/60">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-purple-200/90">TraceX</span>
            <span>· Public garment traceability</span>
          </div>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="inline-flex items-center gap-1 text-purple-300/70 hover:text-purple-100 transition-colors cursor-pointer select-none"
            aria-label="Scroll back to top of page"
          >
            Back to top ↑
          </button>
        </div>
      </footer>
    </div>
  );
}
