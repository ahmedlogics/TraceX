import { createContext, useContext, useState, type ReactNode } from "react";
import { getSessionUserId } from "@/app/session";
import { createMockClient } from "@/mock/mock-client";
import type { WearTrailClient } from "./client";
import { createHttpClient } from "./http-client";

export type DataMode = "live" | "mock";

const DATA_MODE_STORAGE_KEY = "weartrail.data_mode";

/**
 * Returns current data mode.
 * Explicitly selected development/test mode can be configured via VITE_DATA_MODE or localStorage.
 * Defaults to "mock" for isolated client development unless configured or toggled to "live".
 */
export function getDataMode(): DataMode {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(DATA_MODE_STORAGE_KEY);
      if (stored === "live" || stored === "mock") return stored;
    } catch {
      /* ignore */
    }
  }

  const envMode = import.meta.env?.["VITE_DATA_MODE"] as string | undefined;
  if (envMode === "live") return "live";
  if (envMode === "mock") return "mock";

  // When backend is explicitly configured via VITE_API_URL, default to live
  if (import.meta.env?.["VITE_API_URL"]) return "live";

  return "mock";
}

/**
 * Switches the active data mode between live Express API and local mock engine.
 * Never silently switches: requires explicit caller or user selection.
 */
export function setDataMode(mode: DataMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DATA_MODE_STORAGE_KEY, mode);
    window.location.reload();
  } catch {
    /* ignore */
  }
}

const ClientContext = createContext<WearTrailClient | null>(null);

/**
 * Provides the authoritative WearTrailClient to the application.
 * Never silently falls back from live API failure to mock mutation.
 */
export function DataProvider({
  children,
  client,
}: {
  children: ReactNode;
  client?: WearTrailClient;
}) {
  const [value] = useState(() => {
    if (client) return client;
    const mode = getDataMode();
    if (mode === "live") {
      return createHttpClient();
    }
    return createMockClient(getSessionUserId);
  });

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient(): WearTrailClient {
  const c = useContext(ClientContext);
  if (!c) throw new Error("useClient must be used inside <DataProvider>");
  return c;
}
