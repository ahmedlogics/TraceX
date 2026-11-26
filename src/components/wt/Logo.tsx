import { cn } from "@/lib/utils";

/** Authentic TraceX brand mark using the finalized emblem shield icon (transparent). */
export function TraceXMark({ className }: { className?: string }) {
  return (
    <img
      src="/images/tracex-icon-dark-optimized.png"
      alt="TraceX Icon"
      className={cn("h-7 w-auto object-contain drop-shadow-sm", className)}
    />
  );
}

/** Shared TraceX brand mark wordmark. */
export function Logo({
  className,
  height = 28,
  showIcon = true,
}: {
  className?: string | undefined;
  height?: number | undefined;
  showIcon?: boolean;
}) {
  return (
    <span
      className={cn("font-serif tracking-tight text-foreground inline-flex items-center gap-2 select-none", className)}
      style={{ fontSize: height * 0.8 }}
      aria-label="TraceX"
    >
      {showIcon && <TraceXMark className="h-[0.9em] w-auto text-[#8C6D53]" />}
      <span>
        Trace<span className="text-[#8C6D53]">X</span>
      </span>
    </span>
  );
}

export const TAGLINE = "Follow the journey behind what you wear";
