/**
 * Synthetic seed data for the connected demo. No real people, suppliers or locations.
 * Built inside a function (never at module scope) so each reset gets a fresh copy.
 */
import type { ChecklistItem, DemoState, StaffUser } from "@/domain/types";

export const DEMO_STATE_VERSION = 3;

const user = (
  id: string,
  username: string,
  displayName: string,
  role: StaffUser["role"],
  department: StaffUser["department"],
  scope: string,
): StaffUser => ({
  id,
  username,
  displayName,
  role,
  department,
  email: `${username}@weartrail.example`,
  status: "active",
  scope,
});

export function finalChecklist(): ChecklistItem[] {
  return [
    { id: "c1", label: "Seams straight and secure", checked: false },
    { id: "c2", label: "Buttons and buttonholes aligned", checked: false },
    { id: "c3", label: "Measurements within tolerance", checked: false },
    { id: "c4", label: "No stains, holes or loose threads", checked: false },
    { id: "c5", label: "Care and size label present", checked: false },
  ];
}

export function incomingChecklist(): ChecklistItem[] {
  return [
    { id: "i1", label: "Lot paperwork matches delivery", checked: false },
    { id: "i2", label: "Shade within approved range", checked: false },
    { id: "i3", label: "Width and weight within spec", checked: false },
    { id: "i4", label: "Four-point defect check acceptable", checked: false },
  ];
}

const allChecked = (items: ChecklistItem[]) => items.map((i) => ({ ...i, checked: true }));

export function createSeed(): DemoState {
  return {
    version: DEMO_STATE_VERSION,
    users: [
      user("u-admin", "admin.demo", "Avery Admin", "A", "technical-admin", "Technical administration"),
      user("u-manager", "manager.demo", "Morgan Manager", "M", "planning", "Factory planning and supervision"),
      user("u-receiving", "receiving.demo", "Riley Receiving", "O", "receiving", "Receiving"),
      user("u-rawstore", "rawstore.demo", "Rowan Rawstore", "O", "raw-store", "Raw material issue"),
      user("u-cutting", "cutting.demo", "Casey Cutting", "P", "cutting", "Cutting department"),
      user("u-stitching", "stitching.demo", "Sam Stitching", "P", "stitching", "Stitching department"),
      user("u-finishing", "finishing.demo", "Frankie Finishing", "P", "finishing", "Finishing department"),
      user("u-quality", "quality.demo", "Quinn Quality", "Q", "quality", "Incoming inspection, final inspection and reinspection"),
      user("u-packing", "packing.demo", "Parker Packing", "L", "packing", "Packing department"),
      user("u-warehouse", "warehouse.demo", "Wren Warehouse", "L", "warehouse", "Finished-goods warehouse"),
      user("u-dispatch", "dispatch.demo", "Drew Dispatch", "L", "dispatch", "Dispatch department"),
    ],
    lots: [
      {
        id: "FAB-001",
        material: "Cotton poplin, white, 140 cm",
        supplierRef: "SUP-REF-014 (synthetic)",
        receivedQty: 120,
        balanceQty: 115.8,
        unit: "m",
        receivedAt: "2026-10-02T08:40:00Z",
        receivedBy: "u-receiving",
        status: "accepted",
        incomingInspectionId: "INSP-001",
      },
      {
        id: "FAB-002",
        material: "Cotton oxford, light blue, 145 cm",
        supplierRef: "SUP-REF-022 (synthetic)",
        receivedQty: 80,
        balanceQty: 80,
        unit: "m",
        receivedAt: "2026-11-10T09:15:00Z",
        receivedBy: "u-receiving",
        status: "awaiting-inspection",
        incomingInspectionId: "INSP-004",
      },
    ],
    issues: [
      { id: "ISS-001", lotId: "FAB-001", orderId: "ORDER-001", qty: 4.2, at: "2026-10-06T07:30:00Z", by: "u-rawstore" },
    ],
    orders: [
      {
        id: "ORDER-001",
        product: "Classic poplin shirt",
        styleCode: "WT-SH-100",
        plannedQty: 2,
        status: "in-progress",
        dueDate: "2026-11-20",
        plannedBy: "u-manager",
      },
      {
        id: "ORDER-002",
        product: "Oxford button-down shirt",
        styleCode: "WT-SH-210",
        plannedQty: 4,
        status: "planned",
        dueDate: "2026-12-04",
        plannedBy: "u-manager",
      },
    ],
    cuttingOutputs: [
      { id: "CUT-001", orderId: "ORDER-001", lotId: "FAB-001", issueId: "ISS-001", panelSetLabel: "PS-001-A", fabricUsed: 2.1, garmentId: "SHIRT-001", at: "2026-10-07T10:00:00Z", by: "u-cutting" },
      { id: "CUT-002", orderId: "ORDER-001", lotId: "FAB-001", issueId: "ISS-001", panelSetLabel: "PS-001-B", fabricUsed: 2.1, garmentId: "SHIRT-002", at: "2026-10-28T10:20:00Z", by: "u-cutting" },
    ],
    garments: [
      {
        id: "SHIRT-001",
        orderId: "ORDER-001",
        publicId: "shirt-001-demo",
        productName: "Classic poplin shirt — white, M",
        size: "M",
        cuttingOutputId: "CUT-001",
        stage: "dispatched",
        disposition: "passed",
        hold: null,
        packageId: "PKG-001",
        shipmentId: "SHP-001",
      },
      {
        id: "SHIRT-002",
        orderId: "ORDER-001",
        publicId: "shirt-002-demo",
        productName: "Classic poplin shirt — white, L",
        size: "L",
        cuttingOutputId: "CUT-002",
        stage: "final-qc",
        disposition: "awaiting-inspection",
        hold: null,
        shipmentId: "SHP-002",
      },
    ],
    garmentEvents: [
      { id: "GE-001", garmentId: "SHIRT-001", at: "2026-10-07T10:00:00Z", label: "Cut from FAB-001", detail: "Panel set PS-001-A", actorId: "u-cutting", department: "cutting" },
      { id: "GE-002", garmentId: "SHIRT-001", at: "2026-10-09T13:00:00Z", label: "Stitching completed", actorId: "u-stitching", department: "stitching" },
      { id: "GE-003", garmentId: "SHIRT-001", at: "2026-10-10T11:30:00Z", label: "Finishing completed", actorId: "u-finishing", department: "finishing" },
      { id: "GE-004", garmentId: "SHIRT-001", at: "2026-10-11T09:10:00Z", label: "Final inspection passed", detail: "INSP-000", actorId: "u-quality", department: "quality" },
      { id: "GE-005", garmentId: "SHIRT-001", at: "2026-10-12T08:00:00Z", label: "Packed into PKG-001", actorId: "u-packing", department: "packing" },
      { id: "GE-006", garmentId: "SHIRT-001", at: "2026-10-12T15:00:00Z", label: "Received into finished stock", actorId: "u-warehouse", department: "warehouse" },
      { id: "GE-007", garmentId: "SHIRT-001", at: "2026-10-14T07:45:00Z", label: "Dispatched on SHP-001", actorId: "u-dispatch", department: "dispatch" },
      { id: "GE-010", garmentId: "SHIRT-002", at: "2026-10-28T10:20:00Z", label: "Cut from FAB-001", detail: "Panel set PS-001-B", actorId: "u-cutting", department: "cutting" },
      { id: "GE-011", garmentId: "SHIRT-002", at: "2026-11-04T14:00:00Z", label: "Stitching completed", actorId: "u-stitching", department: "stitching" },
      { id: "GE-012", garmentId: "SHIRT-002", at: "2026-11-09T12:10:00Z", label: "Finishing completed", actorId: "u-finishing", department: "finishing" },
    ],
    inspections: [
      {
        id: "INSP-001", kind: "incoming", subjectType: "lot", subjectId: "FAB-001", status: "passed",
        assigneeId: "u-quality", checklist: allChecked(incomingChecklist()), notes: "Lot accepted for production.",
        submittedAt: "2026-10-03T10:00:00Z", submittedBy: "u-quality", createdAt: "2026-10-02T09:00:00Z",
      },
      {
        id: "INSP-000", kind: "final", subjectType: "garment", subjectId: "SHIRT-001", status: "passed",
        assigneeId: "u-quality", checklist: allChecked(finalChecklist()), notes: "All checks passed.",
        submittedAt: "2026-10-11T09:10:00Z", submittedBy: "u-quality", createdAt: "2026-10-10T12:00:00Z",
      },
      {
        id: "INSP-002", kind: "final", subjectType: "garment", subjectId: "SHIRT-002", status: "open",
        assigneeId: "u-quality", checklist: finalChecklist(), notes: "", createdAt: "2026-11-09T12:15:00Z",
      },
      {
        id: "INSP-004", kind: "incoming", subjectType: "lot", subjectId: "FAB-002", status: "open",
        assigneeId: "u-quality", checklist: incomingChecklist(), notes: "", createdAt: "2026-11-10T09:30:00Z",
      },
    ],
    rework: [],
    tasks: [
      { id: "T-101", kind: "final-qc-presentation", title: "Present SHIRT-002 for final QC", department: "quality", subjectType: "garment", subjectId: "SHIRT-002", checkpoint: "S4", status: "claimed", assigneeId: "u-quality", createdAt: "2026-11-09T12:15:00Z" },
      { id: "T-102", kind: "incoming-qc", title: "Incoming inspection for FAB-002", department: "quality", subjectType: "lot", subjectId: "FAB-002", status: "open", createdAt: "2026-11-10T09:30:00Z" },
      { id: "T-103", kind: "receive-lot", title: "Scan FAB-002 delivery at receiving", department: "receiving", subjectType: "lot", subjectId: "FAB-002", checkpoint: "S1", status: "open", createdAt: "2026-11-10T09:15:00Z" },
      { id: "T-104", kind: "issue-material", title: "Issue fabric for ORDER-002 once FAB-002 is accepted", department: "raw-store", subjectType: "order", subjectId: "ORDER-002", status: "open", createdAt: "2026-11-10T10:00:00Z" },
      { id: "T-105", kind: "cut", title: "Cut panel sets for ORDER-002", department: "cutting", subjectType: "order", subjectId: "ORDER-002", checkpoint: "S2", status: "open", createdAt: "2026-11-10T10:05:00Z" },
      { id: "T-106", kind: "dispatch", title: "Dispatch SHP-002 at dock", department: "dispatch", subjectType: "shipment", subjectId: "SHP-002", checkpoint: "S6", status: "open", createdAt: "2026-11-11T08:00:00Z" },
      { id: "T-107", kind: "allocate", title: "Allocate stock to SHP-002", department: "warehouse", subjectType: "shipment", subjectId: "SHP-002", status: "open", createdAt: "2026-11-11T08:00:00Z" },
    ],
    packages: [
      { id: "PKG-001", garmentIds: ["SHIRT-001"], status: "sealed", packedBy: "u-packing", createdAt: "2026-10-12T08:00:00Z" },
    ],
    shipments: [
      {
        id: "SHP-001", destination: "Authorized retail network — North region", carrier: "Regional carrier (synthetic)",
        status: "departed", garmentIds: ["SHIRT-001"], allocatedGarmentIds: ["SHIRT-001"], plannedBy: "u-manager",
        plannedDate: "2026-10-14", departedAt: "2026-10-14T07:45:00Z", departedBy: "u-dispatch",
      },
      {
        id: "SHP-002", destination: "Authorized retail network — South region", carrier: "Regional carrier (synthetic)",
        status: "draft", garmentIds: ["SHIRT-002"], allocatedGarmentIds: [], plannedBy: "u-manager", plannedDate: "2026-11-18",
      },
    ],
    ledger: [
      { id: "LC-001", subjectType: "lot", subjectId: "FAB-001", milestone: "Lot received and accepted", status: "confirmed", digest: "0x6f1c…a29e", createdAt: "2026-10-03T10:05:00Z", updatedAt: "2026-10-03T10:20:00Z", attempts: 1 },
      { id: "LC-002", subjectType: "order", subjectId: "ORDER-001", milestone: "Cutting outputs recorded", status: "submitted", digest: "0x91ab…07c4", createdAt: "2026-10-28T10:30:00Z", updatedAt: "2026-10-28T10:31:00Z", attempts: 1 },
      { id: "LC-003", subjectType: "garment", subjectId: "SHIRT-001", milestone: "Dispatched to authorized retail network", status: "confirmed", digest: "0x3d07…b51f", createdAt: "2026-10-14T08:00:00Z", updatedAt: "2026-10-14T08:20:00Z", attempts: 1 },
      { id: "LC-004", subjectType: "lot", subjectId: "FAB-002", milestone: "Lot received", status: "failed", digest: "0xc4e2…9910", createdAt: "2026-11-10T09:20:00Z", updatedAt: "2026-11-10T09:25:00Z", attempts: 1, lastError: "Mock network timeout" },
      { id: "LC-005", subjectType: "shipment", subjectId: "SHP-001", milestone: "Shipment departed", status: "pending", digest: "0x88f0…12aa", createdAt: "2026-10-14T08:00:00Z", updatedAt: "2026-10-14T08:00:00Z", attempts: 0 },
    ],
    audit: [
      { id: "AU-001", at: "2026-10-02T08:40:00Z", actorId: "u-receiving", category: "materials", event: "Lot received", subjectType: "lot", subjectId: "FAB-001", detail: "120 m received" },
      { id: "AU-002", at: "2026-10-03T10:00:00Z", actorId: "u-quality", category: "quality", event: "Incoming inspection passed", subjectType: "inspection", subjectId: "INSP-001" },
      { id: "AU-003", at: "2026-10-06T07:30:00Z", actorId: "u-rawstore", category: "materials", event: "Material issued", subjectType: "lot", subjectId: "FAB-001", detail: "4.2 m to ORDER-001" },
      { id: "AU-004", at: "2026-10-07T10:00:00Z", actorId: "u-cutting", category: "production", event: "Cutting output recorded", subjectType: "garment", subjectId: "SHIRT-001" },
      { id: "AU-005", at: "2026-10-11T09:10:00Z", actorId: "u-quality", category: "quality", event: "Final inspection passed", subjectType: "garment", subjectId: "SHIRT-001" },
      { id: "AU-006", at: "2026-10-14T07:45:00Z", actorId: "u-dispatch", category: "logistics", event: "Shipment departed", subjectType: "shipment", subjectId: "SHP-001" },
      { id: "AU-007", at: "2026-10-28T10:20:00Z", actorId: "u-cutting", category: "production", event: "Cutting output recorded", subjectType: "garment", subjectId: "SHIRT-002" },
      { id: "AU-008", at: "2026-11-09T12:10:00Z", actorId: "u-finishing", category: "production", event: "Finishing completed", subjectType: "garment", subjectId: "SHIRT-002" },
      { id: "AU-009", at: "2026-11-10T09:15:00Z", actorId: "u-receiving", category: "materials", event: "Lot received", subjectType: "lot", subjectId: "FAB-002", detail: "80 m received" },
      { id: "AU-010", at: "2026-11-10T09:25:00Z", actorId: "u-admin", category: "ledger", event: "Commitment failed", subjectType: "ledger", subjectId: "LC-004", detail: "Mock network timeout" },
      { id: "AU-011", at: "2026-11-11T08:00:00Z", actorId: "u-manager", category: "logistics", event: "Shipment drafted", subjectType: "shipment", subjectId: "SHP-002" },
    ],
    settings: {
      device: { boardId: "ESP32-WT-01 (demo)", firmware: "0.4.2-demo", status: "online" },
      checkpoints: [
        { sensor: "S1", label: "Receiving dock", department: "receiving", enabled: true },
        { sensor: "S2", label: "Cutting table", department: "cutting", enabled: true },
        { sensor: "S3", label: "Stitching line", department: "stitching", enabled: true },
        { sensor: "S4", label: "Finishing / final QC presentation", department: "quality", enabled: true },
        { sensor: "S5", label: "Packing bench", department: "packing", enabled: true },
        { sensor: "S6", label: "Dispatch dock", department: "dispatch", enabled: true },
      ],
      business: {
        defaultCarrier: "Regional carrier (synthetic)",
        reinspectionRequiredAfterRework: true,
        publicJourneyEnabled: true,
        shipmentCutoff: "16:00",
      },
    },
    workstations: {},
    counters: { task: 200, inspection: 10, rework: 0, package: 1, shipment: 2, ledger: 5, audit: 11, event: 20, lot: 2, issue: 1, order: 2, cut: 2 },
  };
}
