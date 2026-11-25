import {
  Activity,
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Cpu,
  FileClock,
  Home,
  Link2,
  PackageCheck,
  Scissors,
  Settings,
  Shirt,
  Truck,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { RouteKey } from "@/domain/permissions";
import type { StaffUser } from "@/domain/types";
import { paths } from "./paths";

export interface NavItem {
  key: RouteKey;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Work",
    items: [
      { key: "home", label: "Home", href: paths.home, icon: Home },
      { key: "productionOrders", label: "Production orders", href: paths.orders, icon: ClipboardList },
      { key: "workstation", label: "Workstation", href: paths.workstation, icon: Cpu },
    ],
  },
  {
    label: "Materials & production",
    items: [
      { key: "materialLots", label: "Material lots", href: paths.lots, icon: Boxes },
      { key: "garments", label: "Garments", href: paths.garments, icon: Shirt },
      { key: "nfcHub", label: "NFC Tag Passports", href: paths.nfcHub, icon: Zap },
    ],
  },
  {
    label: "Quality",
    items: [
      { key: "quality", label: "Quality", href: paths.quality, icon: ClipboardCheck },
      { key: "rework", label: "Rework", href: paths.rework, icon: Wrench },
    ],
  },
  {
    label: "Logistics",
    items: [
      { key: "fulfilment", label: "Fulfilment", href: paths.fulfilment, icon: PackageCheck },
      { key: "shipments", label: "Shipments", href: paths.shipments, icon: Truck },
    ],
  },
  {
    label: "Oversight",
    items: [
      { key: "ledger", label: "Ledger", href: paths.ledger, icon: Link2 },
      { key: "audit", label: "Audit log", href: paths.audit, icon: FileClock },
      { key: "reports", label: "Reports", href: paths.reports, icon: BarChart3 },
    ],
  },
  {
    label: "Administration",
    items: [
      { key: "adminUsers", label: "Staff directory", href: paths.adminUsers, icon: Users },
      { key: "settings", label: "Settings", href: paths.settings, icon: Settings },
    ],
  },
];

export const ActivityIcon = Activity;

export function getNavGroups(user?: StaffUser | null): { label: string; items: NavItem[] }[] {
  const isFinalQc = user?.username?.toLowerCase() === "qc.demo";
  if (isFinalQc) {
    return navGroups.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.key !== "home"),
    }));
  }

  const isWarehouse =
    user?.username?.toLowerCase() === "warehouse.demo" ||
    user?.department?.toLowerCase() === "warehouse";

  if (isWarehouse) {
    return navGroups
      .map((g) => {
        if (g.label === "Work") {
          return {
            ...g,
            items: g.items.filter((i) => i.key !== "home"),
          };
        }
        if (g.label === "Logistics") {
          return {
            ...g,
            items: g.items.filter((i) => i.key !== "shipments"),
          };
        }
        return g;
      })
      .filter((g) => g.items.length > 0);
  }

  const isRawStore =
    user?.username?.toLowerCase() === "rawstore.demo" || user?.department === "raw-store";

  if (isRawStore) {
    return navGroups.map((g) => {
      if (g.label === "Work") {
        return {
          ...g,
          items: [
            { key: "home", label: "Home", href: paths.home, icon: Home },
            { key: "workstation", label: "Workstation", href: paths.workstation, icon: Cpu },
            { key: "productionOrders", label: "Production orders", href: paths.orders, icon: ClipboardList },
          ],
        };
      }
      return g;
    });
  }

  return navGroups;
}
