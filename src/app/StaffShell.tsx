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
import { Logo } from "@/components/wt/Logo";
import { canAccessRoute } from "@/domain/permissions";
import { departmentLabels, roleLabels } from "@/domain/labels";
import type { StaffUser } from "@/domain/types";
import { getDataMode, setDataMode } from "@/lib/data/provider";
import { cn } from "@/lib/utils";
import { useSignOut } from "./auth";
import { AppLink, useAppNavigate, usePathname } from "./navigation";
import { getNavGroups } from "./nav-items";
import { paths } from "./paths";

function NavList({ user, onNavigate }: { user: StaffUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === paths.home
      ? pathname === href || pathname === `${href}/`
      : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav aria-label="Staff navigation" className="space-y-5">
      {getNavGroups(user).map((g) => {
        const items = g.items.filter((i) => canAccessRoute(user, i.key));
        if (!items.length) return null;
        return (
          <div key={g.label}>
            <p className="wt-eyebrow mb-1.5 px-2.5 text-[#6E5748] font-bold">{g.label}</p>
            <ul className="space-y-1">
              {items.map((i) => (
                <li key={i.key}>
                  <AppLink
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={isActive(i.href) ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[#6E5748] transition-colors hover:bg-[#E2C8A8]/60 hover:text-[#2B170E]",
                      isActive(i.href) && "bg-[#E2C8A8] font-bold text-[#2B170E] shadow-2xs border-l-[3px] border-[#1B5E5A] rounded-l-none pl-2",
                    )}
                  >
                    <i.icon className={cn("size-4 shrink-0 transition-colors", isActive(i.href) ? "text-[#1B5E5A]" : "text-[#6E5748]")} aria-hidden />
                    <span>{i.label}</span>
                  </AppLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function RoleChip({ user }: { user: StaffUser }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#CDBBA8] bg-[#FFFDFC] px-2.5 py-1 text-xs shadow-2xs text-[#2B170E]">
      <span className="wt-id rounded bg-[#E2C8A8] px-1.5 py-0.5 font-bold text-[#2B170E]">{user.role}</span>
      <span className="font-semibold text-[#2B170E]">{roleLabels[user.role]}</span>
      <span className="text-[#6E5748]">· {departmentLabels[user.department]}</span>
    </span>
  );
}

export function StaffShell({ user, children }: { user: StaffUser; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const signOut = useSignOut();
  const navigate = useAppNavigate();
  const dataMode = getDataMode();
  const isFinalQc = user?.username?.toLowerCase() === "qc.demo";
  const isWarehouse =
    user?.username?.toLowerCase() === "warehouse.demo" ||
    user?.department?.toLowerCase() === "warehouse";
  const isDispatch =
    user?.username?.toLowerCase() === "dispatch.demo" ||
    user?.department?.toLowerCase() === "dispatch";

  const logoHref = isFinalQc
    ? paths.quality
    : isWarehouse || isDispatch
    ? paths.workstation
    : paths.home;
  return (
    <div className="flex min-h-screen w-full bg-[#FBF6EE]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[#CDBBA8] bg-[#F2E4D2] lg:flex">
        <div className="border-b border-[#CDBBA8] px-4 py-4 bg-[#F2E4D2]">
          <AppLink href={logoHref} aria-label="TraceX staff home">
            <Logo height={32} />
          </AppLink>
          <p className="wt-eyebrow mt-1 text-[#6E5748]">Staff workspace</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-[#FBF6EE]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[#CDBBA8] bg-[#FFFDFC]/95 px-3 backdrop-blur sm:px-5">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-[#2B170E] hover:bg-[#F2E4D2]"
                aria-label="Open navigation"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto bg-[#F2E4D2] border-r border-[#CDBBA8]">
              <SheetHeader>
                <SheetTitle>
                  <Logo height={28} />
                </SheetTitle>
              </SheetHeader>
              <div className="px-2 pb-6">
                <NavList user={user} onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <AppLink href={logoHref} className="lg:hidden" aria-label="TraceX staff home">
            <Logo height={24} />
          </AppLink>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setDataMode(dataMode === "live" ? "mock" : "live")}
              title={`Currently connected to ${dataMode === "live" ? "Live Database (PostgreSQL)" : "Mock Data (Fixtures)"}. Click to toggle.`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer border shadow-2xs",
                dataMode === "live"
                  ? "bg-[#E6F0EE] text-[#134441] border-[#99C5C1] hover:bg-[#D1E6E3]"
                  : "bg-[#FBF6EE] text-[#6E5748] border-[#CDBBA8] hover:bg-[#F2E4D2]",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  dataMode === "live" ? "bg-[#1B5E5A] animate-pulse" : "bg-[#6E5748]",
                )}
              />
              {dataMode === "live" ? "Live API" : "Mock Mode"}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Account menu">
                  <UserRound />
                  <span className="hidden max-w-32 truncate sm:inline">{user.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="space-y-0.5">
                  <p>{user.displayName}</p>
                  <p className="text-xs font-normal text-muted-foreground">
                    {roleLabels[user.role]} · {departmentLabels[user.department]}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate(paths.account)}>
                  My account
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setDataMode(dataMode === "live" ? "mock" : "live")}
                  onClick={() => setDataMode(dataMode === "live" ? "mock" : "live")}
                >
                  Switch to {dataMode === "live" ? "Mock Data" : "Live API"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
