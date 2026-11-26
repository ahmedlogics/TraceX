import type { ReactNode } from "react";
import { AppLink } from "@/app/navigation";
import { paths } from "@/app/paths";

/**
 * High-contrast artisan tailoring visual for desktop side margin (Left gutter).
 * Features a polished golden tailor's needle, flowing basting stitch thread, and atelier measurement scale.
 */
function TailorNeedleMarginVisual() {
  return (
    <aside
      aria-hidden="true"
      className="pointer-events-none fixed left-3 xl:left-6 2xl:left-14 top-24 hidden xl:flex flex-col items-center select-none z-10 w-24"
    >
      {/* Golden Tailor's Needle & Flowing Thread */}
      <svg
        width="90"
        height="560"
        viewBox="0 0 90 560"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="filter drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]"
      >
        <defs>
          <linearGradient id="goldNeedle" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FEF3C7" />
            <stop offset="40%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <linearGradient id="threadGradientLeft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="45%" stopColor="#E9D5FF" />
            <stop offset="80%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#FCD34D" />
          </linearGradient>
        </defs>

        {/* Needle Top Eye Eyelet */}
        <circle cx="45" cy="18" r="4.5" fill="#1E152A" stroke="url(#goldNeedle)" strokeWidth="2" />
        <ellipse cx="45" cy="18" rx="1.5" ry="3" fill="#FDE68A" />

        {/* Polished Tapered Needle Shaft */}
        <path
          d="M42 22 L44.2 82 L45 88 L45.8 82 L48 22 Z"
          fill="url(#goldNeedle)"
          filter="drop-shadow(0 0 4px rgba(251,191,36,0.6))"
        />
        {/* Needle Point Gleam */}
        <circle cx="45" cy="88" r="1.5" fill="#FFFBEB" />

        {/* Thread Loop Threading Through the Eye */}
        <path
          d="M45 18 C30 5, 20 28, 45 35 C68 42, 60 70, 45 88"
          stroke="url(#threadGradientLeft)"
          strokeWidth="2"
          strokeDasharray="4 3"
          strokeLinecap="round"
        />

        {/* Flowing Stitched Tailor's Basting Seam Down the Margin */}
        <path
          d="M45 88 C25 135, 65 175, 45 225 C25 275, 65 325, 45 375 C25 425, 65 475, 45 530"
          stroke="url(#threadGradientLeft)"
          strokeWidth="2.2"
          strokeDasharray="8 6"
          strokeLinecap="round"
        />

        {/* Cross-stitch / Basting Anchor Marks along the curve */}
        <g stroke="#FDE68A" strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
          <line x1="41" y1="150" x2="49" y2="150" />
          <line x1="45" y1="146" x2="45" y2="154" />

          <line x1="41" y1="300" x2="49" y2="300" />
          <line x1="45" y1="296" x2="45" y2="304" />

          <line x1="41" y1="450" x2="49" y2="450" />
          <line x1="45" y1="446" x2="45" y2="454" />
        </g>

        {/* Tailor's Tape Metric Graduation Marks along the left border */}
        <g stroke="#C084FC" strokeWidth="1.2" opacity="0.6">
          <line x1="14" y1="120" x2="26" y2="120" />
          <line x1="18" y1="140" x2="26" y2="140" />
          <line x1="18" y1="160" x2="26" y2="160" />
          <line x1="14" y1="180" x2="26" y2="180" />
          <line x1="18" y1="200" x2="26" y2="200" />
          <line x1="18" y1="220" x2="26" y2="220" />
          <line x1="14" y1="240" x2="26" y2="240" />
          <line x1="18" y1="260" x2="26" y2="260" />
          <line x1="18" y1="280" x2="26" y2="280" />
          <line x1="14" y1="300" x2="26" y2="300" />
          <line x1="18" y1="320" x2="26" y2="320" />
          <line x1="18" y1="340" x2="26" y2="340" />
          <line x1="14" y1="360" x2="26" y2="360" />
          <line x1="18" y1="380" x2="26" y2="380" />
          <line x1="18" y1="400" x2="26" y2="400" />
          <line x1="14" y1="420" x2="26" y2="420" />
          <line x1="18" y1="440" x2="26" y2="440" />
          <line x1="18" y1="460" x2="26" y2="460" />
          <line x1="14" y1="480" x2="26" y2="480" />
        </g>
      </svg>

      {/* Vertical Atelier Traceability Callout */}
      <div className="mt-3 flex flex-col items-center gap-2">
        <span className="size-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.95)] animate-pulse" />
        <span className="[writing-mode:vertical-rl] font-mono text-[10px] tracking-[0.32em] uppercase text-amber-200/90 font-medium">
          TRACEX · TAILOR'S TRACEABILITY
        </span>
      </div>
    </aside>
  );
}

/**
 * High-contrast artisan tailoring shears visual for desktop side margin (Right gutter).
 * Features polished golden tailor's scissors, cutting basting seam line, and atelier measurement scale.
 */
function TailorShearsMarginVisual() {
  return (
    <aside
      aria-hidden="true"
      className="pointer-events-none fixed right-3 xl:right-6 2xl:right-14 top-24 hidden xl:flex flex-col items-center select-none z-10 w-24"
    >
      {/* Golden Tailor's Scissors / Shears & Flowing Thread */}
      <svg
        width="90"
        height="560"
        viewBox="0 0 90 560"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="filter drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]"
      >
        <defs>
          <linearGradient id="goldShears" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FEF3C7" />
            <stop offset="40%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <linearGradient id="threadGradientRight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="45%" stopColor="#E9D5FF" />
            <stop offset="80%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#FCD34D" />
          </linearGradient>
        </defs>

        {/* Tailor's Shears Finger Loops (Handles) */}
        {/* Left Loop */}
        <ellipse
          cx="34"
          cy="20"
          rx="10"
          ry="12"
          fill="none"
          stroke="url(#goldShears)"
          strokeWidth="2.8"
        />
        {/* Right Loop (Elongated finger bow) */}
        <ellipse
          cx="56"
          cy="24"
          rx="12"
          ry="16"
          fill="none"
          stroke="url(#goldShears)"
          strokeWidth="2.8"
        />

        {/* Shears Pivot Bolt */}
        <circle cx="45" cy="46" r="3.5" fill="#1E152A" stroke="url(#goldShears)" strokeWidth="2" />
        <circle cx="45" cy="46" r="1.5" fill="#FEF3C7" />

        {/* Left Shears Blade */}
        <path
          d="M38 46 L45 46 L51 92 L47 90 Z"
          fill="url(#goldShears)"
          filter="drop-shadow(0 0 4px rgba(251,191,36,0.6))"
        />
        {/* Right Shears Blade (Crossing) */}
        <path
          d="M52 46 L45 46 L39 92 L43 90 Z"
          fill="url(#goldShears)"
          filter="drop-shadow(0 0 4px rgba(251,191,36,0.6))"
        />

        {/* Shears Cutting Tip Gleam */}
        <circle cx="45" cy="92" r="1.5" fill="#FFFBEB" />

        {/* Thread Loop Weaving Through the Shears Handle */}
        <path
          d="M34 20 C20 40, 60 40, 45 46"
          stroke="url(#threadGradientRight)"
          strokeWidth="2"
          strokeDasharray="4 3"
          strokeLinecap="round"
        />

        {/* Flowing Stitched Tailor's Basting Seam Down the Right Margin */}
        <path
          d="M45 92 C65 135, 25 175, 45 225 C65 275, 25 325, 45 375 C65 425, 25 475, 45 530"
          stroke="url(#threadGradientRight)"
          strokeWidth="2.2"
          strokeDasharray="8 6"
          strokeLinecap="round"
        />

        {/* Cross-stitch / Basting Anchor Marks along the curve */}
        <g stroke="#FDE68A" strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
          <line x1="41" y1="150" x2="49" y2="150" />
          <line x1="45" y1="146" x2="45" y2="154" />

          <line x1="41" y1="300" x2="49" y2="300" />
          <line x1="45" y1="296" x2="45" y2="304" />

          <line x1="41" y1="450" x2="49" y2="450" />
          <line x1="45" y1="446" x2="45" y2="454" />
        </g>

        {/* Tailor's Tape Metric Graduation Marks along the right border */}
        <g stroke="#C084FC" strokeWidth="1.2" opacity="0.6">
          <line x1="64" y1="120" x2="76" y2="120" />
          <line x1="64" y1="140" x2="72" y2="140" />
          <line x1="64" y1="160" x2="72" y2="160" />
          <line x1="64" y1="180" x2="76" y2="180" />
          <line x1="64" y1="200" x2="72" y2="200" />
          <line x1="64" y1="220" x2="72" y2="220" />
          <line x1="64" y1="240" x2="76" y2="240" />
          <line x1="64" y1="260" x2="72" y2="260" />
          <line x1="64" y1="280" x2="72" y2="280" />
          <line x1="64" y1="300" x2="76" y2="300" />
          <line x1="64" y1="320" x2="72" y2="320" />
          <line x1="64" y1="340" x2="72" y2="340" />
          <line x1="64" y1="360" x2="76" y2="360" />
          <line x1="64" y1="380" x2="72" y2="380" />
          <line x1="64" y1="400" x2="72" y2="400" />
          <line x1="64" y1="420" x2="76" y2="420" />
          <line x1="64" y1="440" x2="72" y2="440" />
          <line x1="64" y1="460" x2="72" y2="460" />
          <line x1="64" y1="480" x2="76" y2="480" />
        </g>
      </svg>

      {/* Vertical Atelier Precision Callout */}
      <div className="mt-3 flex flex-col items-center gap-2">
        <span className="size-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.95)] animate-pulse" />
        <span className="[writing-mode:vertical-rl] font-mono text-[10px] tracking-[0.32em] uppercase text-amber-200/90 font-medium">
          TRACEX · PATTERN CUTTING
        </span>
      </div>
    </aside>
  );
}

/**
 * Public customer shopper layout.
 * Scoped muted plum & purple theme with restrained ambient gradients and refined glass surfaces.
 * Preserves clean centered max-w-4xl column while adorning side margins with tailoring needle and scissors.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#1E152A] via-[#171022] to-[#120D1C] text-[#F3F0F8] selection:bg-purple-500/30 selection:text-purple-100 antialiased font-sans overflow-x-hidden">
      {/* Subtle, soft ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 h-[550px] w-[950px] rounded-full bg-purple-600/10 blur-[150px]"
      />

      {/* Artisan Tailoring Motifs in Desktop Side Gutters: Needle on Left, Shears/Scissors on Right */}
      <TailorNeedleMarginVisual />
      <TailorShearsMarginVisual />

      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-purple-500/15 bg-[#1A1225]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 sm:px-6 py-3.5">
          <AppLink
            href={paths.home}
            className="group flex items-center gap-2.5 transition-opacity hover:opacity-90"
            aria-label="TraceX home"
          >
            <img
              src="/images/tracex-logo.png"
              alt="TraceX Logo"
              className="size-8 object-contain rounded-lg border border-purple-400/25 bg-[#1F162B] p-0.5 shadow-md group-hover:scale-105 transition-transform"
            />
            <span className="text-base font-bold tracking-tight text-white">TraceX</span>
          </AppLink>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-xs font-mono font-medium text-purple-300/80">
              Garment journey
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-950/50 px-2.5 py-0.5 text-[11px] font-mono text-purple-200">
              Demo record
            </span>
          </div>
        </div>
      </header>

      {/* Main Journey Container: Comfortable Centered max-w-3xl for Optimal Proportions */}
      <main className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 py-5 sm:py-6">
        {children}
      </main>

      {/* Public Footer */}
      <footer className="relative z-10 border-t border-purple-500/15 bg-[#140D1E]/70 mt-10">
        <div className="mx-auto flex max-w-3xl flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-5 text-xs text-purple-300/60">
          <div className="flex items-center gap-2">
            <img
              src="/images/tracex-logo.png"
              alt="TraceX Logo"
              className="size-5 object-contain rounded bg-[#1F162B] p-0.5 border border-purple-500/20"
            />
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
