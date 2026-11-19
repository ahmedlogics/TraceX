import { useState, type ReactNode } from "react";
import { LogOut, Menu, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { canAccessRoute } from "@/domain/permissions";
import { departmentLabels, roleLabels } from "@/domain/labels";
import type { StaffUser } from "@/domain/types";
import { cn } from "@/lib/utils";
import { useSignOut } from "./auth";
import { AppLink, useAppNavigate, usePathname } from "./navigation";
import { navGroups } from "./nav-items";
import { paths } from "./paths";

function NavList({ user, onNavigate }: { user: StaffUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === paths.home
      ? pathname === href || pathname === `${href}/`
      : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav aria-label="Staff navigation" className="space-y-6">
      {navGroups.map((g) => {
        const items = g.items.filter((i) => canAccessRoute(user, i.key));
        if (!items.length) return null;
        return (
          <div key={g.label}>
            <p className="text-[10px] font-mono font-semibold tracking-[0.2em] uppercase text-purple-400/80 mb-2 px-2.5">
              {g.label}
            </p>
            <ul className="space-y-1">
              {items.map((i) => {
                const active = isActive(i.href);
                return (
                  <li key={i.key}>
                    <AppLink
                      href={i.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all duration-200",
                        active
                          ? "bg-purple-950/70 text-purple-100 font-semibold border border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                          : "text-purple-300/70 hover:bg-purple-900/30 hover:text-white",
                      )}
                    >
                      <i.icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-purple-300" : "text-purple-400/70",
                        )}
                        aria-hidden
                      />
                      {i.label}
                    </AppLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function RoleChip({ user }: { user: StaffUser }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-purple-500/25 bg-[#170F25] px-3 py-1 text-xs text-purple-200 shadow-sm backdrop-blur-md">
      <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
      <span className="wt-id rounded-md bg-purple-900/60 px-1.5 py-0.5 text-[10px] font-mono font-bold text-purple-200">
        {user.role}
      </span>
      <span className="font-medium text-white">{roleLabels[user.role]}</span>
      <span className="text-purple-300/70 font-mono">· {departmentLabels[user.department]}</span>
    </span>
  );
}

export function StaffShell({ user, children }: { user: StaffUser; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const signOut = useSignOut();
  const navigate = useAppNavigate();

  return (
    <div className="flex min-h-screen w-full bg-[#0B0713] text-[#F3F0F8] antialiased selection:bg-purple-500/30 selection:text-purple-100">
      {/* Desktop Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-purple-900/40 bg-[#0F0A1C] lg:flex">
        <div className="border-b border-purple-900/40 px-5 py-4">
          <AppLink
            href={paths.home}
            aria-label="WearTrail staff home"
            className="flex items-center gap-2.5 group"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/15 border border-purple-400/30 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.35)] group-hover:border-purple-300 transition-colors">
              <svg
                width="18"
                height="11"
                viewBox="0 0 24 14"
                fill="none"
                className="text-white"
                aria-hidden="true"
              >
                <path
                  d="M1 7C3.5 2 6 2 8.5 7C11 12 13.5 12 16 7C18.5 2 21 2 23 7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-lg font-bold tracking-tight text-white">WearTrail</span>
          </AppLink>
          <p className="text-[10px] font-mono tracking-wider uppercase text-purple-400/80 mt-1.5">
            Staff workspace
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <NavList user={user} />
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top App Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-purple-900/40 bg-[#0F0A1C]/90 px-4 backdrop-blur-xl sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-purple-200 hover:text-white hover:bg-purple-900/40"
                aria-label="Open navigation"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 overflow-y-auto bg-[#0F0A1C] border-purple-900/40 text-purple-100"
            >
              <SheetHeader>
                <SheetTitle className="text-white flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-purple-500/20 text-white">
                    <svg
                      width="14"
                      height="9"
                      viewBox="0 0 24 14"
                      fill="none"
                      className="text-white"
                    >
                      <path
                        d="M1 7C3.5 2 6 2 8.5 7C11 12 13.5 12 16 7C18.5 2 21 2 23 7"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span>WearTrail</span>
                </SheetTitle>
              </SheetHeader>
              <div className="px-2 pb-6 pt-4">
                <NavList user={user} onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <AppLink
            href={paths.home}
            className="lg:hidden flex items-center gap-2"
            aria-label="WearTrail staff home"
          >
            <span className="text-base font-bold text-white">WearTrail</span>
          </AppLink>

          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden sm:inline-flex">
              <RoleChip user={user} />
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Account menu"
                  className="border-purple-500/30 bg-[#160E24] text-purple-200 hover:bg-purple-900/50 hover:text-white"
                >
                  <UserRound className="size-3.5 text-purple-300" />
                  <span className="hidden max-w-32 truncate sm:inline">{user.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64 bg-[#160E24] border-purple-500/30 text-purple-100 shadow-2xl"
              >
                <DropdownMenuLabel className="space-y-0.5">
                  <p className="font-semibold text-white">{user.displayName}</p>
                  <p className="text-xs font-normal text-purple-300/80">
                    {roleLabels[user.role]} · {departmentLabels[user.department]}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-purple-800/40" />
                <DropdownMenuItem
                  onSelect={() => navigate(paths.account)}
                  className="hover:bg-purple-900/40 cursor-pointer"
                >
                  My account
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void signOut()}
                  className="hover:bg-purple-900/40 cursor-pointer"
                >
                  Switch demo account
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-purple-800/40" />
                <DropdownMenuItem
                  onSelect={() => void signOut()}
                  className="text-rose-400 hover:bg-purple-900/40 cursor-pointer"
                >
                  <LogOut className="size-3.5 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Principal & Security Context Banner */}
        <div className="border-b border-purple-900/30 bg-[#120B1F] px-4 py-2 text-center text-xs text-purple-300/80 flex items-center justify-center gap-2">
          <span
            className="inline-block size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
            aria-hidden
          />
          <span>
            Verified Staff Workspace · Principal:{" "}
            <strong className="text-white font-semibold">{user.username}</strong> (
            {roleLabels[user.role]} · {departmentLabels[user.department]})
          </span>
        </div>

        {/* Main Routed Content Area */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
          <span className="mb-4 inline-flex sm:hidden">
            <RoleChip user={user} />
          </span>
          {children}
        </main>
      </div>
    </div>
  );
}
