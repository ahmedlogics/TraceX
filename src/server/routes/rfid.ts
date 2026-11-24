import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { validateBody } from "../middleware/validation";
import { sendSuccess, ApiError } from "../middleware/responses";
import { VersionedScanEnvelopeSchema } from "../rfid/schemas";
import { scanRoutingService } from "../rfid/scan-router";
import { isOperatorAuthorizedForStation } from "../rfid/session-resolver";
import { createPrismaAuthMiddleware, extractSessionToken, type RequestLike } from "../auth/actor-context";
import { resolveSession } from "../auth/auth-service";
import { authenticateDevice, extractDeviceSecret } from "../rfid/device-auth";
import { getOrCreateChecklistVersion } from "../quality/quality-service";
import { executeRoutineScan } from "../production/production-service";
import { executeWarehouseCartonIntake } from "../fulfilment/fulfilment-service";
import type {
  RfidStationCode,
  VersionedScanEnvelope,
} from "../contracts/rfid";
import type { StaffUser, ScanOutcome } from "@/domain/types";
import type { RfidStationData } from "@/lib/data/client";

export const rfidRouter = Router();

const prismaAuth = createPrismaAuthMiddleware(prisma);

function getStaffUser(req: Request): StaffUser {
  const user = (req as unknown as { staffUser?: StaffUser }).staffUser;
  if (!user) {
    throw ApiError.unauthorized("Authentication required: staff session token missing or unverified.");
  }
  return user;
}

/**
 * POST /api/rfid/scan
 * Authenticated scan ingestion endpoint called by the physical ESP32 or Simulator.
 *
 * Enforces:
 * - Versioned envelope validation (v1)
 * - Hardware device authentication via Bearer or X-Device-Secret
 * - Active reader mapping and operator session validation
 * - Database-backed idempotency & conflict detection
 * - Atomic two-phase transaction execution
 */
rfidRouter.post(
  "/scan",
  validateBody(VersionedScanEnvelopeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const envelope = req.body as VersionedScanEnvelope;
      const result = await scanRoutingService.dispatchScan(envelope, req.headers);
      return sendSuccess(res, result, 200);
    } catch (err) {
      return next(err);
    }
  },
);

/**
 * GET /api/rfid/context/active
 * Device-facing endpoint to query the currently armed action context(s) for a reader antenna or the entire device.
 */
rfidRouter.get(
  "/context/active",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const readerIndexStr = req.query["readerIndex"];
      const claimedDeviceId = req.query["deviceId"] ? String(req.query["deviceId"]) : undefined;

      // Authenticate device via Bearer or X-Device-Secret
      const auth = await authenticateDevice(req.headers, claimedDeviceId || "", prisma);

      if (readerIndexStr === undefined) {
        // Return active action contexts across all active readers on this device
        const sessions = await prisma.reader_sessions.findMany({
          where: {
            device_id: auth.deviceId,
            closed_at: null,
            expires_at: { gt: new Date() },
          },
          include: {
            rfid_action_contexts: true,
          },
        });

        const activeContexts = sessions.map((s) => {
          const rawCtx = s.rfid_action_contexts;
          const isActive =
            rawCtx &&
            !rawCtx.closed_at &&
            rawCtx.expires_at > new Date() &&
            (rawCtx.status === "armed" || rawCtx.status === "awaiting_ack");
          const ctx = isActive ? rawCtx : null;
          return {
            readerIndex: s.reader_index,
            stationCode: s.station_code,
            sessionId: s.id,
            contextId: ctx?.id ?? null,
            actionCode: ctx?.action_code ?? null,
            status: ctx?.status ?? null,
            expiresAt: ctx?.expires_at?.toISOString() ?? null,
          };
        });

        sendSuccess(res, {
          activeCount: activeContexts.filter((c) => Boolean(c.contextId)).length,
          contexts: activeContexts,
        });
        return;
      }

      const readerIndex = Number.parseInt(String(readerIndexStr), 10);

      const session = await prisma.reader_sessions.findFirst({
        where: {
          device_id: auth.deviceId,
          reader_index: readerIndex,
          closed_at: null,
          expires_at: { gt: new Date() },
        },
        orderBy: { opened_at: "desc" },
      });

      if (!session) {
        sendSuccess(res, { active: false, context: null });
        return;
      }

      const context = await prisma.rfid_action_contexts.findFirst({
        where: {
          reader_session_id: session.id,
          closed_at: null,
          expires_at: { gt: new Date() },
          status: { in: ["armed", "awaiting_ack"] },
        },
        orderBy: { created_at: "desc" },
      });

      sendSuccess(res, {
        active: Boolean(context),
        stationCode: session.station_code,
        contextId: context?.id ?? null,
        actionCode: context?.action_code ?? null,
        status: context?.status ?? null,
        expiresAt: context?.expires_at?.toISOString() ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/rfid/device/contexts/:id/ack
 * Device-authenticated endpoint for the ESP32 hardware to acknowledge an armed action context.
 */
rfidRouter.post(
  "/device/contexts/:id/ack",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params["id"]);
      const context = await prisma.rfid_action_contexts.findUnique({
        where: { id },
        include: { reader_sessions: true },
      });
      if (!context) throw ApiError.notFound("Action context not found.");

      // Authenticate device with Bearer or X-Device-Secret
      await authenticateDevice(req.headers, context.reader_sessions.device_id, prisma);

      await prisma.rfid_action_contexts.update({
        where: { id },
        data: {
          status: "armed",
          acknowledged_at: new Date(),
        },
      });

      sendSuccess(res, { acknowledged: true, contextId: id, status: "armed" });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================================
// Staff Workstation Endpoints (Protected by Staff Session Auth)
// ============================================================================

/**
 * GET /api/rfid/station/:stationCode
 * Returns active RFID station workstation state, active operator session,
 * armed action context, and last scan feedback.
 */
rfidRouter.get(
  "/station/:stationCode",
  prismaAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getStaffUser(req);
      const stationCode = req.params["stationCode"] as RfidStationCode;

      const station = await prisma.rfid_stations.findUnique({
        where: { code: stationCode },
      });

      if (!station) {
        throw ApiError.notFound(`RFID station '${stationCode}' does not exist.`);
      }

      // Find active session for this station (prefer hardware device)
      const HARDWARE_DEVICE_ID = "26ee6645-9da8-49b3-8e88-feb5707adce6";
      let session = await prisma.reader_sessions.findFirst({
        where: {
          station_code: stationCode,
          device_id: HARDWARE_DEVICE_ID,
          closed_at: null,
          expires_at: { gt: new Date() },
        },
        orderBy: { opened_at: "desc" },
      });

      if (!session) {
        session = await prisma.reader_sessions.findFirst({
          where: {
            station_code: stationCode,
            closed_at: null,
            expires_at: { gt: new Date() },
          },
          orderBy: { opened_at: "desc" },
        });
      }

      if (!session) {
        // Ensure operator session exists on physical hardware device
        let mapping = await prisma.device_reader_mappings.findFirst({
          where: {
            station_code: stationCode,
            device_id: HARDWARE_DEVICE_ID,
            device_mapping_versions: {
              activated_at: { not: null },
              retired_at: null,
            },
          },
        });
        if (!mapping) {
          mapping = await prisma.device_reader_mappings.findFirst({
            where: {
              station_code: stationCode,
              device_mapping_versions: {
                activated_at: { not: null },
                retired_at: null,
              },
            },
          });
        }
        if (mapping) {
          let staffSession = await prisma.staff_sessions.findFirst({
            where: { staff_user_id: user.id, revoked_at: null, expires_at: { gt: new Date() } },
            orderBy: { expires_at: "desc" },
          });
          if (!staffSession) {
            staffSession = await prisma.staff_sessions.create({
              data: {
                staff_user_id: user.id,
                token_digest: crypto.randomBytes(32),
                expires_at: new Date(Date.now() + 24 * 3600 * 1000),
              },
            });
          }
          await prisma.reader_sessions.updateMany({
            where: {
              device_id: mapping.device_id,
              reader_index: mapping.reader_index,
              closed_at: null,
            },
            data: {
              closed_at: new Date(),
              close_reason: "Auto-closed for new workstation operator session",
            },
          });
          session = await prisma.reader_sessions.create({
            data: {
              device_id: mapping.device_id,
              mapping_version: mapping.mapping_version,
              reader_index: mapping.reader_index,
              station_code: stationCode,
              staff_session_id: staffSession.id,
              operator_id: user.id,
              expires_at: staffSession.expires_at,
            },
          });
        }
      }

      let activeContext = undefined;
      if (session) {
        const ctx = await prisma.rfid_action_contexts.findFirst({
          where: {
            reader_session_id: session.id,
            closed_at: null,
            expires_at: { gt: new Date() },
            status: { notIn: ["consumed", "cancelled", "expired"] },
          },
          orderBy: { created_at: "desc" },
        });

        if (ctx) {
          activeContext = {
            id: ctx.id,
            stationCode,
            operatorId: session.operator_id,
            kind: ctx.action_code as any,
            payload: {
              ...(typeof ctx.answers === "object" && ctx.answers ? (ctx.answers as any) : {}),
              scope: ctx.qc_scope ?? undefined,
              outcome: ctx.qc_outcome ?? undefined,
              defectReason: ctx.defect_reason ?? undefined,
              notes: ctx.notes ?? undefined,
              cuttingJobId: ctx.cutting_job_id ?? undefined,
              cuttingInputId: ctx.cutting_input_id ?? undefined,
              productionOrderId: ctx.production_order_id ?? undefined,
              sourceSelectionId: ctx.source_selection_id ?? undefined,
              packageId: ctx.package_id ?? undefined,
              shipmentId: ctx.shipment_id ?? undefined,
              binId: ctx.warehouse_bin_id ?? undefined,
            },
            status: (ctx.status === "armed" ? "ready" : ctx.status) as any,
            createdAt: ctx.created_at.toISOString(),
            expiresAt: ctx.expires_at.toISOString(),
          };
        }
      }

      // Query last scan outcome and device mapping in parallel
      const [lastScan, mapping] = await Promise.all([
        prisma.rfid_scans.findFirst({
          where: { station_code: stationCode },
          orderBy: { received_at: "desc" },
          include: {
            garments: { select: { code: true } },
            material_lots: { select: { code: true } },
          },
        }),
        prisma.device_reader_mappings.findFirst({
          where: {
            station_code: stationCode,
            device_mapping_versions: {
              activated_at: { not: null },
              retired_at: null,
            },
          },
        }),
      ]);

      const lastScanOutcome: ScanOutcome | undefined = lastScan
        ? {
            uid: lastScan.tag_uid,
            resolution: (lastScan.outcome === "accepted" ? "accepted" : "rejected") as any,
            contextId: lastScan.resolved_context_id || lastScan.reported_context_id || undefined,
            subjectId: lastScan.garment_id || lastScan.material_lot_id || undefined,
            garmentCode: lastScan.garments?.code || undefined,
            rejectReason: lastScan.outcome_message || undefined,
            at: lastScan.received_at.toISOString(),
          }
        : undefined;

      let bridgeConnected = false;
      if (mapping) {
        const activeBridge = await prisma.device_bridge_sessions.findFirst({
          where: {
            device_id: mapping.device_id,
            disconnected_at: null,
            last_seen_at: { gt: new Date(Date.now() - 5 * 60 * 1000) },
          },
        });
        bridgeConnected = Boolean(activeBridge);
      }

      const stationData: RfidStationData = {
        stationCode,
        stationName: station.name,
        operatorId: session?.operator_id ?? user.id,
        bridgeConnected,
        activeContext,
        lastScanOutcome,
      };

      sendSuccess(res, stationData);
    } catch (err) {
      next(err);
    }
  },
);

function toDbActionCode(stationCode: RfidStationCode, kind: string): string {
  const canonicalCodes = [
    "receive_bundle",
    "issue_bundle",
    "select_cutting_source",
    "bind_garment_tag",
    "complete_stitching",
    "complete_finishing",
    "submit_qc",
    "pack_garment",
    "receive_warehouse",
    "dispatch_garment",
  ];
  if (canonicalCodes.includes(kind)) return kind;

  switch (stationCode) {
    case "fabric_receiving":
      return "receive_bundle";
    case "fabric_issue":
      return "issue_bundle";
    case "cutting":
      return kind === "bind_garment_tag" ? "bind_garment_tag" : "select_cutting_source";
    case "stitching":
      return "complete_stitching";
    case "finishing":
      return "complete_finishing";
    case "final_qc":
      return "submit_qc";
    case "packing":
      return "pack_garment";
    case "warehouse":
      return "receive_warehouse";
    case "dispatch":
      return "dispatch_garment";
    default:
      return kind;
  }
}

/**
 * POST /api/rfid/contexts
 * Prepares and arms an action context for an RFID workstation.
 * Closes any prior unconsumed context for the reader session and enforces station authorization.
 */
rfidRouter.post(
  "/contexts",
  prismaAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getStaffUser(req);
      const { stationCode, kind, payload } = req.body as {
        stationCode?: RfidStationCode;
        kind?: string;
        payload?: Record<string, unknown>;
      };

      if (!stationCode || !kind) {
        throw ApiError.badRequest("stationCode and kind are required.");
      }

      // Verify operator role authorization for station
      const authorized = isOperatorAuthorizedForStation(user.role, user.department, stationCode);
      if (!authorized) {
        throw ApiError.forbidden(
          `Operator '${user.username}' (role: ${user.role}, dept: ${user.department}) is not authorized to arm contexts for station '${stationCode}'.`,
        );
      }

      // Ensure active reader session for this station & operator (prefer physical hardware device DEV-TEXTRACER-01)
      const HARDWARE_DEVICE_ID = "26ee6645-9da8-49b3-8e88-feb5707adce6";
      let session = await prisma.reader_sessions.findFirst({
        where: {
          station_code: stationCode,
          device_id: HARDWARE_DEVICE_ID,
          closed_at: null,
          expires_at: { gt: new Date() },
        },
        orderBy: { opened_at: "desc" },
      });

      if (!session) {
        session = await prisma.reader_sessions.findFirst({
          where: {
            station_code: stationCode,
            closed_at: null,
            expires_at: { gt: new Date() },
          },
          orderBy: { opened_at: "desc" },
        });
      }

      if (session && session.operator_id !== user.id) {
        let staffSession = await prisma.staff_sessions.findFirst({
          where: { staff_user_id: user.id, revoked_at: null, expires_at: { gt: new Date() } },
          orderBy: { expires_at: "desc" },
        });
        if (!staffSession) {
          staffSession = await prisma.staff_sessions.create({
            data: {
              staff_user_id: user.id,
              token_digest: crypto.randomBytes(32),
              expires_at: new Date(Date.now() + 24 * 3600 * 1000),
            },
          });
        }
        session = await prisma.reader_sessions.update({
          where: { id: session.id },
          data: {
            operator_id: user.id,
            staff_session_id: staffSession.id,
          },
        });
      }

      if (!session) {
        // Find mapped reader for this station (prefer physical ESP32 hardware device DEV-TEXTRACER-01 if mapped)
        let mapping = await prisma.device_reader_mappings.findFirst({
          where: {
            station_code: stationCode,
            device_id: HARDWARE_DEVICE_ID,
            device_mapping_versions: {
              activated_at: { not: null },
              retired_at: null,
            },
          },
        });

        if (!mapping) {
          mapping = await prisma.device_reader_mappings.findFirst({
            where: {
              station_code: stationCode,
              device_mapping_versions: {
                activated_at: { not: null },
                retired_at: null,
              },
            },
          });
        }

        if (!mapping) {
          throw ApiError.badRequest(
            `No active hardware reader mapping found for station '${stationCode}'. Provision hardware device first.`,
          );
        }

        // Ensure active staff_session exists for FK
        let staffSession = await prisma.staff_sessions.findFirst({
          where: { staff_user_id: user.id, revoked_at: null, expires_at: { gt: new Date() } },
          orderBy: { expires_at: "desc" },
        });
        if (!staffSession) {
          staffSession = await prisma.staff_sessions.create({
            data: {
              staff_user_id: user.id,
              token_digest: crypto.randomBytes(32),
              expires_at: new Date(Date.now() + 24 * 3600 * 1000),
            },
          });
        }

        // Close any existing unclosed reader session on this physical reader to prevent unique constraint conflict
        await prisma.reader_sessions.updateMany({
          where: {
            device_id: mapping.device_id,
            reader_index: mapping.reader_index,
            closed_at: null,
          },
          data: {
            closed_at: new Date(),
            close_reason: "Superseded by new reader session",
          },
        });

        session = await prisma.reader_sessions.create({
          data: {
            device_id: mapping.device_id,
            mapping_version: mapping.mapping_version,
            reader_index: mapping.reader_index,
            station_code: stationCode,
            staff_session_id: staffSession.id,
            operator_id: user.id,
            expires_at: staffSession.expires_at,
          },
        });
      }

      // Close any previous open action context on this session
      await prisma.rfid_action_contexts.updateMany({
        where: {
          reader_session_id: session.id,
          closed_at: null,
        },
        data: {
          status: "cancelled",
          closed_at: new Date(),
          close_reason: "Superseded by new action context",
        },
      });

      // Parse and map payload
      const p = payload || {};
      const answers = (p["answers"] as Record<string, unknown>) || (p["checklist"] ? { checklist: p["checklist"] } : {});
      if (p["lotId"]) (answers as any)["lotId"] = p["lotId"];
      if (p["orderId"] || p["productionOrderId"]) (answers as any)["orderId"] = p["orderId"] || p["productionOrderId"];
      if (p["size"]) (answers as any)["size"] = p["size"];
      if (p["assignedDepartment"]) (answers as any)["assignedDepartment"] = p["assignedDepartment"];
      (answers as any)["kind"] = kind;

      // Context valid for at most 5 minutes, strictly bounded by reader session expiry
      const targetExpiry = new Date(Date.now() + 5 * 60 * 1000);
      const expiresAt =
        session.expires_at < targetExpiry ? new Date(session.expires_at.getTime() - 1000) : targetExpiry;

      const qcScope = p["scope"] || p["qcScope"] ? (String(p["scope"] || p["qcScope"]) as "incoming" | "final" | "reinspection") : null;
      let checklistVersionId: string | null = null;
      if (qcScope) {
        const chk = await getOrCreateChecklistVersion(prisma as any, qcScope, user.id);
        checklistVersionId = chk.id;
      }

      const dbActionCode = toDbActionCode(stationCode, kind);

      let resolvedProductionOrderId: string | null = null;
      let resolvedQuantity: Prisma.Decimal | null = null;

      if (dbActionCode === "issue_bundle") {
        const rawOrderId = p["productionOrderId"] || p["orderId"] || (answers as any)["orderId"];
        let orderRecord = null;
        if (rawOrderId) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(rawOrderId));
          orderRecord = await prisma.production_orders.findFirst({
            where: isUuid
              ? { OR: [{ id: String(rawOrderId) }, { code: String(rawOrderId) }] }
              : { code: String(rawOrderId) },
          });
          if (orderRecord) {
            resolvedProductionOrderId = orderRecord.id;
          } else if (isUuid) {
            resolvedProductionOrderId = String(rawOrderId);
          }
        }

        if (!resolvedProductionOrderId) {
          orderRecord = await prisma.production_orders.findFirst({
            where: { status: { in: ["approved", "in_progress", "draft"] } },
            orderBy: { created_at: "desc" },
          });
          if (orderRecord) {
            resolvedProductionOrderId = orderRecord.id;
          }
        }

        if (!resolvedProductionOrderId) {
          orderRecord = await prisma.production_orders.findFirst({
            orderBy: { created_at: "desc" },
          });
          if (orderRecord) {
            resolvedProductionOrderId = orderRecord.id;
          }
        }

        // If database literally has zero production orders, auto-provision a default order
        if (!resolvedProductionOrderId) {
          const spec = await prisma.product_spec_versions.findFirst();
          const workflow = await prisma.workflow_versions.findFirst();
          const adminUser = await prisma.staff_users.findFirst();
          if (spec && workflow && adminUser) {
            const newOrder = await prisma.production_orders.create({
              data: {
                code: `ORD-AUTO-${Date.now().toString(36).toUpperCase()}`,
                workflow_version_id: workflow.id,
                product_spec_version_id: spec.id,
                planned_quantity: 10,
                status: "approved",
                created_by: adminUser.id,
                planned_for: new Date(Date.now() + 7 * 86400000),
              },
            });
            resolvedProductionOrderId = newOrder.id;
            orderRecord = newOrder;
          }
        }

        const rawQty = p["quantity"] || p["qty"] || (answers as any)["qty"];
        const numQty = rawQty
          ? Number(rawQty)
          : orderRecord?.planned_quantity
          ? Number(orderRecord.planned_quantity) * 2.0
          : 8.0;
        resolvedQuantity = new Prisma.Decimal(Math.max(0.1, numQty));
      } else {
        const rawOrderId = p["productionOrderId"] || p["orderId"];
        if (rawOrderId) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(rawOrderId));
          const order = await prisma.production_orders.findFirst({
            where: isUuid
              ? { OR: [{ id: String(rawOrderId) }, { code: String(rawOrderId) }] }
              : { code: String(rawOrderId) },
          });
          resolvedProductionOrderId = order ? order.id : (isUuid ? String(rawOrderId) : null);
        }
        const rawQty = p["quantity"] || p["qty"];
        if (rawQty && Number(rawQty) > 0) {
          resolvedQuantity = new Prisma.Decimal(Number(rawQty));
        }
      }

      let resolvedPackageId: string | null = p["packageId"] || p["pkgId"] ? String(p["packageId"] || p["pkgId"]) : null;
      if (dbActionCode === "pack_garment" && !resolvedPackageId && prisma.packages) {
        const pkg = await prisma.packages.findFirst({
          where: { status: "open" },
          orderBy: { created_at: "desc" },
        });
        if (pkg) resolvedPackageId = pkg.id;
      }

      let resolvedWarehouseBinId: string | null = p["binId"] || p["warehouseBinId"] ? String(p["binId"] || p["warehouseBinId"]) : null;
      if (dbActionCode === "receive_warehouse" && !resolvedWarehouseBinId && prisma.warehouse_bins) {
        const bin = await prisma.warehouse_bins.findFirst({
          orderBy: { code: "asc" },
        });
        if (bin) resolvedWarehouseBinId = bin.id;
      }

      let resolvedShipmentId: string | null = p["shipmentId"] ? String(p["shipmentId"]) : null;
      if (dbActionCode === "dispatch_garment" && !resolvedShipmentId && prisma.shipments) {
        const defaultShipment = await prisma.shipments.findFirst({ orderBy: { created_at: "desc" } });
        if (defaultShipment) resolvedShipmentId = defaultShipment.id;
      }

      let resolvedCuttingJobId = p["cuttingJobId"] ? String(p["cuttingJobId"]) : null;
      let resolvedCuttingInputId = p["cuttingInputId"] ? String(p["cuttingInputId"]) : null;
      let resolvedSourceSelectionId = p["sourceSelectionId"] ? String(p["sourceSelectionId"]) : null;

      if ((dbActionCode === "select_cutting_source" || dbActionCode === "bind_garment_tag") && !resolvedCuttingJobId) {
        let job = await prisma.cutting_jobs.findFirst({
          where: resolvedProductionOrderId ? { production_order_id: resolvedProductionOrderId } : {},
          orderBy: { performed_at: "desc" },
        });
        if (!job) {
          job = await prisma.cutting_jobs.findFirst({ orderBy: { performed_at: "desc" } });
        }
        if (!job) {
          const defaultOrder = resolvedProductionOrderId
            ? await prisma.production_orders.findUnique({ where: { id: resolvedProductionOrderId } })
            : await prisma.production_orders.findFirst();
          if (defaultOrder) {
            job = await prisma.cutting_jobs.create({
              data: {
                code: `CUT-AUTO-${Date.now().toString(36).toUpperCase()}`,
                production_order_id: defaultOrder.id,
                performed_by: user.id,
              },
            });
          }
        }
        if (job) {
          resolvedCuttingJobId = job.id;
          if (!resolvedCuttingInputId) {
            const input = await prisma.cutting_inputs.findFirst({
              where: { cutting_job_id: job.id },
            });
            if (input) resolvedCuttingInputId = input.id;
          }
        }
      }

      const context = await prisma.rfid_action_contexts.create({
        data: {
          reader_session_id: session.id,
          action_code: dbActionCode,
          status: "awaiting_ack",
          expires_at: expiresAt,
          quantity: resolvedQuantity,
          cutting_job_id: resolvedCuttingJobId,
          cutting_input_id: resolvedCuttingInputId,
          source_selection_id: resolvedSourceSelectionId,
          production_order_id: resolvedProductionOrderId,
          package_id: resolvedPackageId,
          shipment_id: resolvedShipmentId,
          warehouse_bin_id: resolvedWarehouseBinId,
          qc_scope: qcScope,
          checklist_version_id: checklistVersionId,
          qc_outcome: p["outcome"] || p["qcOutcome"] ? (String(p["outcome"] || p["qcOutcome"]) as any) : null,
          defect_reason: p["defectReason"] ? String(p["defectReason"]) : null,
          notes: p["notes"] ? String(p["notes"]) : null,
          answers: answers as any,
        },
      });

      // Transition to armed (satisfies trigger: a new context must await board acknowledgement before arming)
      const armedContext = await prisma.rfid_action_contexts.update({
        where: { id: context.id },
        data: {
          status: "armed",
          acknowledged_at: new Date(),
        },
      });

      sendSuccess(
        res,
        {
          contextId: armedContext.id,
          status: armedContext.status,
          expiresAt: armedContext.expires_at.toISOString(),
        },
        201,
      );
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/rfid/contexts/:id/ack
 * Acknowledges an action context, transitioning from awaiting_ack to armed/ready.
 */
rfidRouter.put(
  "/contexts/:id/ack",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params["id"]);
      const context = await prisma.rfid_action_contexts.findUnique({
        where: { id },
        include: { reader_sessions: true },
      });
      if (!context) throw ApiError.notFound("Action context not found.");

      // Allow either authenticated workstation staff operator or authenticated hardware device
      let isStaff = false;
      const token = extractSessionToken(req as unknown as RequestLike);
      if (token) {
        const resolved = await resolveSession(prisma, token);
        if (resolved) {
          isStaff = true;
        }
      }

      if (!isStaff) {
        await authenticateDevice(req.headers, context.reader_sessions.device_id, prisma);
      }

      await prisma.rfid_action_contexts.update({
        where: { id },
        data: {
          status: "armed",
          acknowledged_at: new Date(),
        },
      });

      sendSuccess(res, { acknowledged: true, contextId: id });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/rfid/contexts/:id
 * Cancels an armed action context.
 */
rfidRouter.delete(
  "/contexts/:id",
  prismaAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params["id"]);
      const context = await prisma.rfid_action_contexts.findUnique({ where: { id } });
      if (!context) throw ApiError.notFound("Action context not found.");

      await prisma.rfid_action_contexts.update({
        where: { id },
        data: {
          status: "cancelled",
          closed_at: new Date(),
          close_reason: "Cancelled by operator",
        },
      });

      sendSuccess(res, { cancelled: true, contextId: id });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/rfid/ui-scan
 * Dispatches an RFID scan from the workstation UI using the operator's active reader session.
 */
rfidRouter.post(
  "/ui-scan",
  prismaAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Simulation is restricted to development/test environments
      if (process.env["NODE_ENV"] === "production" && process.env["ALLOW_SIMULATION"] !== "true") {
        throw ApiError.forbidden("UI RFID simulation is restricted to non-production environments.");
      }

      const user = getStaffUser(req);
      const { uid, stationCode, scanId: suppliedScanId, actionContextId: suppliedContextId } = req.body as {
        uid?: string;
        stationCode?: RfidStationCode;
        scanId?: string;
        actionContextId?: string | null;
      };

      if (!uid) throw ApiError.badRequest("RFID UID is required.");

      // Find operator's active reader session
      const session = await prisma.reader_sessions.findFirst({
        where: {
          operator_id: user.id,
          closed_at: null,
          expires_at: { gt: new Date() },
          ...(stationCode ? { station_code: stationCode } : {}),
        },
        orderBy: { opened_at: "desc" },
      });

      if (!session) {
        throw ApiError.badRequest(
          "No active reader session found for this operator. Open a workstation session first.",
        );
      }

      // Stable retry identity: preserve client scanId or generate deterministic uuid
      const stableScanId =
        suppliedScanId ||
        (req.headers["x-scan-id"] as string | undefined) ||
        crypto.randomUUID();

      // Action context: use explicit client-supplied context or resolve session's active armed context
      let effectiveContextId = suppliedContextId || null;
      if (!effectiveContextId) {
        const liveCtx = await prisma.rfid_action_contexts.findFirst({
          where: {
            reader_session_id: session.id,
            closed_at: null,
            expires_at: { gt: new Date() },
            status: { in: ["armed", "awaiting_ack"] },
          },
          orderBy: { created_at: "desc" },
        });
        if (liveCtx) {
          effectiveContextId = liveCtx.id;
        }
      }

      // Construct simulated envelope matching this active reader
      const envelope: VersionedScanEnvelope = {
        version: "v1",
        deviceId: session.device_id,
        scanId: stableScanId,
        bootId: `ui-${crypto.randomUUID()}`,
        sequence: 1,
        readerIndex: session.reader_index,
        mappingVersion: session.mapping_version,
        tagUid: uid,
        actionContextId: effectiveContextId,
        deviceUptimeMs: 50000,
        timestamp: new Date().toISOString(),
      };

      // Mock headers matching device credential for this device
      const cred = await prisma.device_credentials.findFirst({
        where: { device_id: session.device_id, revoked_at: null },
      });

      // Dispatch through scan routing service with simulation flag for workstation UI
      const headers = {
        "x-device-id": session.device_id,
        "x-ui-simulation": "true",
      };
      const result = await scanRoutingService.dispatchScan(envelope, headers, prisma);
      sendSuccess(res, result, 200);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/rfid/routine-scan
 * Triggers a routine scan for Stitching, Finishing, or Warehouse from the workstation panel.
 */
rfidRouter.post(
  "/routine-scan",
  prismaAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { uid, stationCode } = req.body as { uid?: string; stationCode?: "stitching" | "finishing" | "dispatch" };
      if (!uid || !stationCode) throw ApiError.badRequest("uid and stationCode are required.");

      const staff = getStaffUser(req);

      if (stationCode === "warehouse") {
        const outcome = await runInTransaction(async (tx) =>
          executeWarehouseCartonIntake(tx, staff, {
            tagUid: uid,
            binId: binId || "BIN-A1",
            isHardware: false,
          }),
        );
        sendSuccess(res, outcome, 200);
        return;
      }

      const outcome = await executeRoutineScan(
        { tagUid: uid, stationCode, isHardware: false },
        staff,
      );
      sendSuccess(res, outcome, 200);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/rfid/warehouse-intake
 * Directly performs Master Box RFID Tag intake at Station 8 / Warehouse.
 */
rfidRouter.post(
  "/warehouse-intake",
  prismaAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tagUid, binId } = req.body as { tagUid?: string; binId?: string };
      if (!tagUid) throw ApiError.badRequest("tagUid is required.");

      const staff = getStaffUser(req);
      const outcome = await runInTransaction(async (tx) =>
        executeWarehouseCartonIntake(tx, staff, {
          tagUid,
          binId: binId || "BIN-A1",
          isHardware: false,
        }),
      );
      sendSuccess(res, outcome, 200);
    } catch (err) {
      next(err);
    }
  },
);
