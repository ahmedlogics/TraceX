import { useState } from "react";
import logo from "@/assets/weartrail-logo.png.asset.json";
import { cn } from "@/lib/utils";

/** Shared WearTrail brand mark. Falls back to a text wordmark if the image fails. */
export function Logo({
  className,
  height = 28,
}: {
  className?: string | undefined;
  height?: number | undefined;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span
        className={cn("font-bold tracking-tight text-foreground", className)}
        style={{ fontSize: height * 0.8 }}
      >
        Wear<span className="text-primary">Trail</span>
      </span>
    );
  return (
    <img
      src={logo.url}
      alt="WearTrail"
      onError={() => setFailed(true)}
      style={{ height, width: "auto" }}
      className={cn("block select-none", className)}
    />
  );
}

export const TAGLINE = "Follow the journey behind what you wear";
