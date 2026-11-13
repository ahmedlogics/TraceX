import { Outlet, createFileRoute } from "@tanstack/react-router";

// Staff area renders client-side only: the mock session and demo state live in browser storage.
export const Route = createFileRoute("/staff")({
  ssr: false,
  component: Outlet,
});
