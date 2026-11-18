import { createContext, useContext, useState, type ReactNode } from "react";
import { getSessionUserId } from "@/app/session";
import { createMockClient } from "@/mock/mock-client";
import type { WearTrailClient } from "./client";

const ClientContext = createContext<WearTrailClient | null>(null);

/** Swap createMockClient for an Express-backed client here. */
export function DataProvider({
  children,
  client,
}: {
  children: ReactNode;
  client?: WearTrailClient;
}) {
  const [value] = useState(() => client ?? createMockClient(getSessionUserId));
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient(): WearTrailClient {
  const c = useContext(ClientContext);
  if (!c) throw new Error("useClient must be used inside <DataProvider>");
  return c;
}
