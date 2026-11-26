import { describe, expect, it } from "vitest";
import { getNavGroups, navGroups } from "@/app/nav-items";
import { canAccessRoute } from "@/domain/permissions";
import type { StaffUser } from "@/domain/types";

describe("Staff Navigation Items", () => {
  const rawStoreUser: StaffUser = {
    id: "u-rawstore",
    username: "rawstore.demo",
    displayName: "Rowan Rawstore",
    role: "O",
    department: "raw-store",
    email: "rawstore@example.com",
    scope: "station:fabric_issue",
    status: "active",
  };

  const managerUser: StaffUser = {
    id: "u-mgr",
    username: "manager.demo",
    displayName: "Mina Manager",
    role: "M",
    department: "cutting",
    email: "manager@example.com",
    scope: "*",
    status: "active",
  };

  it("places production orders below workstation for rawstore.demo", () => {
    const groups = getNavGroups(rawStoreUser);
    const workGroup = groups.find((g) => g.label === "Work");
    expect(workGroup).toBeDefined();

    const keys = workGroup!.items.map((i) => i.key);
    expect(keys).toEqual(["home", "workstation", "productionOrders"]);

    const workstationIndex = keys.indexOf("workstation");
    const productionOrdersIndex = keys.indexOf("productionOrders");
    expect(productionOrdersIndex).toBeGreaterThan(workstationIndex);
  });

  it("places production orders below workstation for any raw-store department staff", () => {
    const customRawStoreStaff: StaffUser = {
      ...rawStoreUser,
      username: "john.store",
      department: "raw-store",
    };
    const groups = getNavGroups(customRawStoreStaff);
    const workGroup = groups.find((g) => g.label === "Work");
    const keys = workGroup!.items.map((i) => i.key);
    expect(keys).toEqual(["home", "workstation", "productionOrders"]);
  });

  it("retains standard order (production orders above workstation) for other users and defaults", () => {
    const managerGroups = getNavGroups(managerUser);
    const workGroupManager = managerGroups.find((g) => g.label === "Work");
    expect(workGroupManager!.items.map((i) => i.key)).toEqual([
      "home",
      "productionOrders",
      "workstation",
    ]);

    const defaultGroups = getNavGroups(null);
    expect(defaultGroups).toEqual(navGroups);
  });

  it("filters accessible items properly in the modified order for rawstore.demo", () => {
    const groups = getNavGroups(rawStoreUser);
    const workItems = groups
      .find((g) => g.label === "Work")!
      .items.filter((i) => canAccessRoute(rawStoreUser, i.key));

    expect(workItems.map((i) => i.label)).toEqual([
      "Home",
      "Workstation",
      "Production orders",
    ]);
  });

  it("removes home for finishing.demo", () => {
    const finishingUser: StaffUser = {
      id: "u-finishing",
      username: "finishing.demo",
      displayName: "Finishing Specialist",
      role: "production",
      department: "finishing",
      email: "finishing@example.com",
      scope: "station:finishing",
      status: "active",
    };
    const groups = getNavGroups(finishingUser);
    const workGroup = groups.find((g) => g.label === "Work");
    expect(workGroup).toBeDefined();
    expect(workGroup!.items.some((i) => i.key === "home")).toBe(false);
    expect(workGroup!.items.some((i) => i.key === "workstation")).toBe(true);
  });
});
