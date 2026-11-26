import { cn } from "@/lib/utils";

/** Official TraceX mark image. */
export function TraceXMark({
  className,
  size = 32,
}: {
  className?: string | undefined;
  size?: number | undefined;
}) {
  return (
    <img
      src="/images/tracex-logo.png"
      alt="TraceX Logo"
      style={{ height: size, width: size }}
      className={cn(
        "object-contain rounded-lg p-0.5 shrink-0 select-none",
        className,
      )}
    />
  );
}

/** Shared TraceX brand mark with official logo and styling. */
export function Logo({
  className,
  height = 30,
  showIcon = true,
  showText = true,
}: {
  className?: string | undefined;
  height?: number | undefined;
  showIcon?: boolean;
  showText?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2.5 select-none", className)}
      aria-label="TraceX"
    >
      {showIcon && (
        <img
          src="/images/tracex-logo.png"
          alt="TraceX Emblem"
          style={{ height, width: height }}
          className="object-contain rounded-lg bg-[#FFFDFC] p-0.5 border border-[#CDBBA8]/80 shadow-2xs shrink-0"
        />
      )}
      {showText && (
        <span
          className="font-bold tracking-tight text-[#2B170E] leading-none"
          style={{ fontSize: Math.max(15, height * 0.7) }}
        >
          Trace<span className="text-[#C79C70]">X</span>
        </span>
      )}
    </span>
  );
}

export const TAGLINE = "Follow the journey behind what you wear";
