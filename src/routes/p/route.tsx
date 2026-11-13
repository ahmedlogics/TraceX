import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/features/public/PublicLayout";

// Rendered client-side: the demo reads shared mock state from the browser.
// With the Express API these pages can be server-rendered.
export const Route = createFileRoute("/p")({
  ssr: false,
  component: PublicShell,
});

function PublicShell() {
  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}
