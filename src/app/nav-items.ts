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
  type LucideIcon,
} from "lucide-react";
import type { RouteKey } from "@/domain/permissions";
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
      { key: "workstation", label: "Workstation", href: paths.workstation, icon: Cpu },
    ],
  },
  {
    label: "Materials & production",
    items: [
      { key: "materialLots", label: "Material lots", href: paths.lots, icon: Boxes },
      { key: "productionOrders", label: "Production orders", href: paths.orders, icon: ClipboardList },
      { key: "garments", label: "Garments", href: paths.garments, icon: Shirt },
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
