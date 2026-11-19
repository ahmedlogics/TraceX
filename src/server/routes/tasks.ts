import { Router, type Request, type Response, type NextFunction } from "express";
import { listTasks, claimTask, assignTask } from "../tasks/tasks-service";
import { sendSuccess } from "../middleware/responses";
import { requireAuthenticatedActor } from "../contracts/actor";

export const tasksRouter = Router();

// GET /api/tasks — list work tasks
tasksRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const departmentParam = req.query["department"];
      const statusParam = req.query["status"];
      const assigneeIdParam = req.query["assigneeId"];
      const tasks = await listTasks(req.actor, {
        department: typeof departmentParam === "string" ? departmentParam : undefined,
        status: typeof statusParam === "string" ? statusParam : undefined,
        assigneeId: typeof assigneeIdParam === "string" ? assigneeIdParam : undefined,
      });
      sendSuccess(res, tasks);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/tasks/:id/claim — claim work task
tasksRouter.post(
  "/:id/claim",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params["id"] as string;
      const result = await claimTask(taskId, req.actor);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/tasks/:id/assign — assign work task
tasksRouter.post(
  "/:id/assign",
  requireAuthenticatedActor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params["id"] as string;
      const assigneeId = req.body.userId || req.body.assigneeId;
      const result = await assignTask(taskId, assigneeId, req.actor);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);
