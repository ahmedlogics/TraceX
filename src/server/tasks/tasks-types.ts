import type { task_status } from "@prisma/client";

export type TaskStatus = task_status;

export interface TaskDTO {
  id: string;
  actionCode: string;
  departmentCode: string;
  checkpointCode?: string | null | undefined;
  status: TaskStatus;
  materialLotId?: string | null | undefined;
  garmentId?: string | null | undefined;
  productionOrderId?: string | null | undefined;
  packageId?: string | null | undefined;
  shipmentId?: string | null | undefined;
  assigneeId?: string | null | undefined;
  assigneeName?: string | null | undefined;
  createdBy: string;
  createdAt: string;
  claimedAt?: string | null | undefined;
  completedAt?: string | null | undefined;
  revision: number;
}
