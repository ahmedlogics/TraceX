import type { ReactNode } from "react";
import { Logo } from "@/components/wt/Logo";

/** Clean single-column, mobile-first layout for anonymous shopper pages. */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-xl items-center px-4 py-3">
          <Logo height={26} />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-xl px-4 pb-10 text-xs text-muted-foreground">
        WearTrail demo · no account, wallet or personal details needed to view this page.
      </footer>
    </div>
  );
}
