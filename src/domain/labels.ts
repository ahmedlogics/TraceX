import type { Department, Role, SensorId } from "./types";

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

export const sensorLabels: Record<SensorId, string> = {
  S1: "S1 · Receiving",
  S2: "S2 · Cutting",
  S3: "S3 · Stitching",
  S4: "S4 · Finishing / final QC presentation",
  S5: "S5 · Packing",
  S6: "S6 · Dispatch",
};

export const sensorIds: SensorId[] = ["S1", "S2", "S3", "S4", "S5", "S6"];
