import { runInTransaction } from "../db/client";
import type { PrismaTransactionClient } from "../db/types";
import { ApiError } from "../middleware/responses";
import { toActorRef } from "../materials/materials-service";
import type { TaskDTO } from "./tasks-types";

export async function listTasks(
  actor?: unknown,
  filters?: {
    department?: string | undefined;
    status?: string | undefined;
    assigneeId?: string | undefined;
  },
  tx?: PrismaTransactionClient,
): Promise<TaskDTO[]> {
  return runInTransaction(async (db) => {
    const tasks = await db.work_tasks.findMany({
      where: {
        ...(filters?.department ? { department_code: filters.department } : {}),
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.assigneeId ? { assignee_id: filters.assigneeId } : {}),
      },
      include: {
        staff_users_work_tasks_assignee_idTostaff_users: true,
      },
      orderBy: { created_at: "desc" },
    });

    return tasks.map((t) => ({
      id: t.id,
      actionCode: t.action_code,
      departmentCode: t.department_code,
      checkpointCode: t.checkpoint_code,
      status: t.status,
      materialLotId: t.material_lot_id,
      garmentId: t.garment_id,
      productionOrderId: t.production_order_id,
      packageId: t.package_id,
      shipmentId: t.shipment_id,
      assigneeId: t.assignee_id,
      assigneeName:
        t.staff_users_work_tasks_assignee_idTostaff_users?.display_name ?? null,
      createdBy: t.created_by,
      createdAt: t.created_at.toISOString(),
      claimedAt: t.claimed_at ? t.claimed_at.toISOString() : null,
      completedAt: t.completed_at ? t.completed_at.toISOString() : null,
      revision: t.revision,
    }));
  }, tx);
}

export async function claimTask(
  taskId: string,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<{ taskId: string; status: TaskDTO["status"]; claimedAt: string }> {
  const actorRef = toActorRef(actor);
  return runInTransaction(async (db) => {
    const task = await db.work_tasks.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw ApiError.notFound(`Task '${taskId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    if (task.status !== "queued" && task.status !== "assigned") {
      throw ApiError.badRequest(
        `Task '${taskId}' cannot be claimed: status is '${task.status}'.`,
        { currentStatus: task.status },
        "WT_ERR_TASK_ALREADY_CLAIMED",
      );
    }

    let staffUserId = actorRef.id;
    const existingStaff = await db.staff_users.findUnique({
      where: { id: staffUserId },
    });
    if (!existingStaff) {
      const fallback = await db.staff_users.findFirst({
        where: { suspended_at: null },
      });
      staffUserId = fallback ? fallback.id : task.created_by;
    }

    const claimedAt = new Date();
    const updated = await db.work_tasks.update({
      where: { id: task.id },
      data: {
        status: "claimed",
        assignee_id: staffUserId,
        claimed_at: claimedAt,
        revision: { increment: 1 },
      },
    });

    return {
      taskId: updated.id,
      status: updated.status,
      claimedAt: claimedAt.toISOString(),
    };
  }, tx);
}

export async function assignTask(
  taskId: string,
  assigneeId: string,
  actor?: unknown,
  tx?: PrismaTransactionClient,
): Promise<{ taskId: string; assigneeId: string; status: TaskDTO["status"] }> {
  return runInTransaction(async (db) => {
    const task = await db.work_tasks.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw ApiError.notFound(`Task '${taskId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    const assignee = await db.staff_users.findUnique({
      where: { id: assigneeId },
    });
    if (!assignee) {
      throw ApiError.notFound(`Assignee staff user '${assigneeId}' not found.`, undefined, "WT_ERR_NOT_FOUND");
    }

    const updated = await db.work_tasks.update({
      where: { id: task.id },
      data: {
        status: "assigned",
        assignee_id: assignee.id,
        revision: { increment: 1 },
      },
    });

    return {
      taskId: updated.id,
      assigneeId: assignee.id,
      status: updated.status,
    };
  }, tx);
}
