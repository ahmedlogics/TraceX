import type { RouteKey } from "@/domain/permissions";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Route-access key checked by the staff workspace guard. */
    access?: RouteKey | undefined;
  }
}

export {};
