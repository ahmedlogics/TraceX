import { describe, expect, it, beforeEach, vi } from "vitest";
import { getDataMode, setDataMode } from "@/lib/data/provider";

describe("Data Mode Switching", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("prioritizes localStorage user selection over environment default", () => {
    // When user explicitly selected mock in localStorage
    localStorage.setItem("weartrail.data_mode", "mock");
    expect(getDataMode()).toBe("mock");

    // When user explicitly selected live in localStorage
    localStorage.setItem("weartrail.data_mode", "live");
    expect(getDataMode()).toBe("live");
  });

  it("stores data mode to localStorage in setDataMode", () => {
    const originalLocation = window.location;
    delete (window as any).location;
    window.location = { ...originalLocation, reload: vi.fn(), pathname: "/" } as any;

    setDataMode("mock");
    expect(localStorage.getItem("weartrail.data_mode")).toBe("mock");
    expect(window.location.reload).toHaveBeenCalled();

    setDataMode("live");
    expect(localStorage.getItem("weartrail.data_mode")).toBe("live");

    (window as any).location = originalLocation;
  });

  it("always forces live mode on public product journey routes", () => {
    // Even if localStorage is set to mock
    localStorage.setItem("weartrail.data_mode", "mock");

    const originalLocation = window.location;
    delete (window as any).location;
    window.location = { ...originalLocation, pathname: "/p/garment-123" } as any;

    expect(getDataMode()).toBe("live");

    (window as any).location = originalLocation;
  });
});
