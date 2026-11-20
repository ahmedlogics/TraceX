/**
 * Integration Test Suite: Milestone 5 — Dashboard, Audit, Reports & HTTP Integration
 * Owned by Member 4 (Staff access, shared UI, audit, reports & dashboard).
 */
import { describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createExpressApp } from "../server/app";
import { prisma } from "../server/db/client";
import {
  getStaffDashboard,
  getStaffAuditTrail,
  getStaffOperationalReports,
  listStaffUsers,
} from "../server/staff/staff-service";
import type { StaffUser } from "@/domain/types";
import { createHttpClient, ApiError } from "../lib/data/http-client";

describe("Milestone 5: Staff Analytics & Dashboard Service", { timeout: 30000 }, () => {
  const adminUser: StaffUser = {
    id: "00000000-0000-0000-0000-000000000001",
    username: "ahmed.admin",
    displayName: "Ahmed Lead",
    role: "A",
    department: "receiving",
    email: "ahmed@weartrail.internal",
    status: "active",
    scope: "all",
  };

  const managerUser: StaffUser = {
    id: "00000000-0000-0000-0000-000000000002",
    username: "marta.manager",
    displayName: "Marta Manager",
    role: "M",
    department: "cutting",
    email: "marta@weartrail.internal",
    status: "active",
    scope: "department",
  };

  const qualityUser: StaffUser = {
    id: "00000000-0000-0000-0000-000000000003",
    username: "elena.quality",
    displayName: "Elena Rossi",
    role: "Q",
    department: "quality",
    email: "elena@weartrail.internal",
    status: "active",
    scope: "department",
  };

  const logisticsUser: StaffUser = {
    id: "00000000-0000-0000-0000-000000000004",
    username: "drew.logistics",
    displayName: "Drew Dispatch",
    role: "L",
    department: "dispatch",
    email: "drew@weartrail.internal",
    status: "active",
    scope: "department",
  };

  it(
    "generates role-appropriate metrics for Administrator",
    async () => {
      const dashboard = await getStaffDashboard(prisma, adminUser);
      expect(dashboard).toBeDefined();
      expect(dashboard.metrics).toBeDefined();
      expect(Array.isArray(dashboard.metrics)).toBe(true);
      expect(dashboard.metrics.length).toBe(4);

      const labels = dashboard.metrics.map((m) => m.label);
      expect(labels).toContain("Active staff");
      expect(labels).toContain("Failed commitments");
      expect(labels).toContain("Pending commitments");
      expect(labels).toContain("RFID stations enabled");
    },
    30000,
  );

  it(
    "generates operational metrics and active task queue for Manager",
    async () => {
      const dashboard = await getStaffDashboard(prisma, managerUser);
      expect(dashboard).toBeDefined();
      expect(dashboard.metrics.length).toBe(4);

      const labels = dashboard.metrics.map((m) => m.label);
      expect(labels).toContain("Open tasks");
      expect(labels).toContain("Garments on hold");
      expect(labels).toContain("Open inspections");
      expect(labels).toContain("Shipments in progress");
    },
    30000,
  );

  it(
    "generates quality metrics and hold exceptions for Quality Inspector",
    async () => {
      const dashboard = await getStaffDashboard(prisma, qualityUser);
      expect(dashboard).toBeDefined();
      expect(dashboard.metrics.length).toBe(4);

      const labels = dashboard.metrics.map((m) => m.label);
      expect(labels).toContain("Open inspections");
      expect(labels).toContain("Garments on hold");
      expect(labels).toContain("Reinspections");
      expect(labels).toContain("Lots awaiting inspection");
    },
    30000,
  );

  it(
    "generates packing and finished stock metrics for Logistics staff",
    async () => {
      const dashboard = await getStaffDashboard(prisma, logisticsUser);
      expect(dashboard).toBeDefined();
      expect(dashboard.metrics.length).toBe(4);

      const labels = dashboard.metrics.map((m) => m.label);
      expect(labels).toContain("My open tasks");
      expect(labels).toContain("Awaiting packing");
      expect(labels).toContain("In finished stock");
      expect(labels).toContain("Shipments in progress");
    },
    30000,
  );
});

describe("Milestone 5: Role-Scoped Operational Reports", { timeout: 30000 }, () => {
  it(
    "produces inspection throughput and disposition breakdown for Quality role",
    async () => {
      const qualityUser: StaffUser = {
        id: "00000000-0000-0000-0000-000000000003",
        username: "elena.quality",
        displayName: "Elena Rossi",
        role: "Q",
        department: "quality",
        email: "elena@weartrail.internal",
        status: "active",
        scope: "department",
      };

      const reports = await getStaffOperationalReports(prisma, qualityUser);
      expect(reports).toBeDefined();
      expect(reports.columns).toEqual(["Open", "Passed", "Failed"]);
      expect(reports.counts.map((c) => c.label)).toEqual([
        "Inspections",
        "Passed",
        "Failed",
        "Open",
      ]);
      expect(reports.rows.length).toBe(3);
      expect(reports.rows[0]?.label).toBe("Incoming inspections");
      expect(reports.rows[1]?.label).toBe("Final inspections");
      expect(reports.rows[2]?.label).toBe("Reinspections");
    },
    30000,
  );

  it(
    "produces accounts and ledger commitment statistics for Administrator role",
    async () => {
      const adminUser: StaffUser = {
        id: "00000000-0000-0000-0000-000000000001",
        username: "ahmed.admin",
        displayName: "Ahmed Lead",
        role: "A",
        department: "receiving",
        email: "ahmed@weartrail.internal",
        status: "active",
        scope: "all",
      };

      const reports = await getStaffOperationalReports(prisma, adminUser);
      expect(reports).toBeDefined();
      expect(reports.columns).toEqual(["Count"]);
      expect(reports.counts.map((c) => c.label)).toEqual([
        "Staff accounts",
        "Suspended",
        "Commitments",
        "Audit events",
      ]);
      expect(reports.rows.map((r) => r.label)).toEqual([
        "Commitments pending",
        "Commitments submitted",
        "Commitments failed",
        "Commitments confirmed",
      ]);
    },
    30000,
  );
});

describe("Milestone 5: Immutable Audit Trail & Category Scoping", { timeout: 30000 }, () => {
  it(
    "strictly restricts audit categories for Quality Inspectors",
    async () => {
      const qualityUser: StaffUser = {
        id: "00000000-0000-0000-0000-000000000003",
        username: "elena.quality",
        displayName: "Elena Rossi",
        role: "Q",
        department: "quality",
        email: "elena@weartrail.internal",
        status: "active",
        scope: "department",
      };

      const events = await getStaffAuditTrail(prisma, qualityUser);
      expect(Array.isArray(events)).toBe(true);

      // Quality inspector must never see authentication, admin, or ledger events
      const forbiddenCategories = ["auth", "admin", "ledger", "settings"];
      for (const ev of events) {
        expect(forbiddenCategories).not.toContain(ev.category);
      }
    },
    30000,
  );

  it(
    "allows administrative and security event categories for Admin role",
    async () => {
      const adminUser: StaffUser = {
        id: "00000000-0000-0000-0000-000000000001",
        username: "ahmed.admin",
        displayName: "Ahmed Lead",
        role: "A",
        department: "receiving",
        email: "ahmed@weartrail.internal",
        status: "active",
        scope: "all",
      };

      const events = await getStaffAuditTrail(prisma, adminUser);
      expect(Array.isArray(events)).toBe(true);
      // Admin sees auth, admin, ledger, settings, workstation, rfid
      for (const ev of events) {
        expect(["auth", "admin", "ledger", "settings", "workstation", "rfid"]).toContain(
          ev.category,
        );
      }
    },
    30000,
  );
});

describe("Milestone 5: Express Staff Router HTTP Security", () => {
  it(
    "rejects unauthenticated requests to /api/staff/dashboard with 401 WT_ERR_UNAUTHORIZED",
    async () => {
      const app = createExpressApp();
      const server = app.listen(0);
      const port = (server.address() as AddressInfo).port;
      const baseUrl = `http://127.0.0.1:${port}`;
      try {
        const res = await fetch(`${baseUrl}/api/staff/dashboard`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error.code).toBe("WT_ERR_UNAUTHORIZED");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
    30000,
  );

  it(
    "loads staff directory list from database",
    async () => {
      const adminUser: StaffUser = {
        id: "00000000-0000-0000-0000-000000000001",
        username: "ahmed.admin",
        displayName: "Ahmed Lead",
        role: "A",
        department: "receiving",
        email: "ahmed@weartrail.internal",
        status: "active",
        scope: "all",
      };

      const users = await listStaffUsers(prisma, adminUser);
      expect(Array.isArray(users)).toBe(true);
    },
    30000,
  );
});
