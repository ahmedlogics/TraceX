import { cn } from "@/lib/utils";

/** Geometric chevron mark matching the TraceX aesthetic. */
export function TraceXMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className ?? "size-7 text-[#8C6D53]"}
      aria-hidden="true"
    >
      <path
        d="M22 2L42 36H36L22 12L8 36H2L22 2Z"
        fill="currentColor"
      />
      <path
        d="M22 15L32 32H27.5L22 22L16.5 32H12L22 15Z"
        fill="currentColor"
      />
      <path
        d="M22 25L25 30H19L22 25Z"
        fill="currentColor"
      />
    </svg>
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
