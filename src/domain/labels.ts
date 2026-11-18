import type { Department, RfidStationCode, Role, SensorId } from "./types";

export const roleLabels: Record<Role, string> = {
  A: "Administrator",
  M: "Supply-chain manager",
  O: "Materials",
  P: "Production",
  Q: "Quality inspector",
  L: "Logistics",
};

export const departmentLabels: Record<Department, string> = {
  "technical-admin": "Technical administration",
  planning: "Planning & supervision",
  receiving: "Receiving",
  "raw-store": "Raw material store",
  cutting: "Cutting",
  stitching: "Stitching",
  finishing: "Finishing",
  quality: "Quality",
  packing: "Packing",
  warehouse: "Finished-goods warehouse",
  dispatch: "Dispatch",
};

/** Nine RFID stations — workflow order, not firmware reader indices. */
export const rfidStationLabels: Record<RfidStationCode, string> = {
  fabric_receiving: "Fabric Receiving",
  fabric_issue: "Fabric Issue",
  cutting: "Cutting & Tag Assignment",
  stitching: "Stitching",
  finishing: "Finishing",
  final_qc: "Final Quality Check",
  packing: "Packing",
  warehouse: "Finished Goods Warehouse",
  dispatch: "Dispatch",
};

export const rfidStationCodes: RfidStationCode[] = [
  "fabric_receiving",
  "fabric_issue",
  "cutting",
  "stitching",
  "finishing",
  "final_qc",
  "packing",
  "warehouse",
  "dispatch",
];

/** Checkpoint sensor IDs — nine RFID + legacy IR kept for compatibility. */
export const sensorLabels: Record<SensorId, string> = {
  S1: "S1 · Fabric Receiving",
  RAW_ISSUE: "RAW_ISSUE · Fabric Issue",
  S2: "S2 · Cutting & Tag Assignment",
  S3: "S3 · Stitching",
  S4: "S4 · Finishing",
  FINAL_QC: "FINAL_QC · Final Quality Check",
  S5: "S5 · Packing",
  WAREHOUSE: "WAREHOUSE · Finished Goods Warehouse",
  S6: "S6 · Dispatch",
};

export const sensorIds: SensorId[] = [
  "S1",
  "RAW_ISSUE",
  "S2",
  "S3",
  "S4",
  "FINAL_QC",
  "S5",
  "WAREHOUSE",
  "S6",
];

/** Station code → checkpoint sensor ID mapping. */
export const stationCheckpoint: Record<RfidStationCode, SensorId> = {
  fabric_receiving: "S1",
  fabric_issue: "RAW_ISSUE",
  cutting: "S2",
  stitching: "S3",
  finishing: "S4",
  final_qc: "FINAL_QC",
  packing: "S5",
  warehouse: "WAREHOUSE",
  dispatch: "S6",
};

/** Station code → department mapping. */
export const stationDepartment: Record<RfidStationCode, Department> = {
  fabric_receiving: "receiving",
  fabric_issue: "raw-store",
  cutting: "cutting",
  stitching: "stitching",
  finishing: "finishing",
  final_qc: "quality",
  packing: "packing",
  warehouse: "warehouse",
  dispatch: "dispatch",
};
