import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import {
  ApiError,
  sendSuccess,
  sendError,
  validateRequest,
  requestIdMiddleware,
  requireAuthenticatedActor,
  requireRole,
  requireDepartment,
  normalizeTagUid,
  PendingImplementationError,
  pendingLedgerOutboxService,
  runInTransaction,
  createExpressApp,
  type ActorContext,
  type PrismaTransactionClient,
} from "../server/index";

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    url: "/api/test",
    method: "GET",
    query: {},
    params: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): {
  res: Response;
  statusCode: number;
  jsonData: unknown;
  headers: Record<string, string>;
} {
  const state = {
    statusCode: 200,
    jsonData: undefined as unknown,
    headers: {} as Record<string, string>,
  };

  const res = {
    req: { id: "test-req-id" },
    status: vi.fn((code: number) => {
      state.statusCode = code;
      return res;
    }),
    json: vi.fn((data: unknown) => {
      state.jsonData = data;
      return res;
    }),
    setHeader: vi.fn((key: string, val: string) => {
      state.headers[key.toLowerCase()] = val;
      return res;
    }),
    getHeader: vi.fn((key: string) => {
      return state.headers[key.toLowerCase()];
    }),
  } as unknown as Response;

  return { res, ...state };
}

describe("Shared Express Foundation & Middleware", () => {
  describe("Request ID Middleware", () => {
    it("generates a new UUID when X-Request-Id header is missing", () => {
      const req = createMockReq();
      const { res } = createMockRes();
      let nextCalled = false;

      requestIdMiddleware(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.id).toBeDefined();
      expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", req.id);
    });

    it("preserves a valid incoming X-Request-Id header", () => {
      const incomingId = "custom-trace-uuid-12345";
      const req = createMockReq({
        headers: { "x-request-id": incomingId },
      });
      const { res } = createMockRes();

      requestIdMiddleware(req, res, () => {});

      expect(req.id).toBe(incomingId);
      expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", incomingId);
    });
  });

  describe("Standard Response Format", () => {
    it("formats success responses with requestId and timestamp metadata", () => {
      const { res } = createMockRes();
      const payload = { item: "garment-123", count: 5 };

      sendSuccess(res, payload, 201, { cached: false });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: payload,
          meta: expect.objectContaining({
            requestId: "test-req-id",
            cached: false,
          }),
        }),
      );
    });

    it("formats error responses with error code and sanitized details", () => {
      const { res } = createMockRes();
      const err = ApiError.notFound("Garment not found", { id: "G-999" }, "WT_ERR_GARMENT_NOT_FOUND");

      sendError(res, err);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            code: "WT_ERR_GARMENT_NOT_FOUND",
            message: "Garment not found",
            details: { id: "G-999" },
          },
          meta: expect.objectContaining({
            requestId: "test-req-id",
          }),
        }),
      );
    });
  });

  describe("Request Validation Middleware", () => {
    const TestSchema = z.object({
      orderId: z.string().min(3),
      quantity: z.number().int().positive(),
    });

    it("passes validated and parsed data to req.body", async () => {
      const middleware = validateRequest({ body: TestSchema });
      const req = createMockReq({
        body: { orderId: "ORD-123", quantity: 42 },
      });
      const { res } = createMockRes();
      let capturedError: unknown = null;

      await middleware(req, res, (err) => {
        capturedError = err;
      });

      expect(capturedError).toBeUndefined();
      expect(req.body).toEqual({ orderId: "ORD-123", quantity: 42 });
    });

    it("aborts with 400 Bad Request on invalid payload", async () => {
      const middleware = validateRequest({ body: TestSchema });
      const req = createMockReq({
        body: { orderId: "x", quantity: -5 },
      });
      const { res } = createMockRes();
      let capturedError: unknown = null;

      await middleware(req, res, (err) => {
        capturedError = err;
      });

      expect(capturedError).toBeInstanceOf(ApiError);
      const apiErr = capturedError as ApiError;
      expect(apiErr.statusCode).toBe(400);
      expect(apiErr.errorCode).toBe("WT_ERR_VALIDATION_FAILED");
    });
  });

  describe("Authentication & Authorization Guards", () => {
    it("denies unauthenticated requests with 401 WT_ERR_UNAUTHORIZED (no dev bypass)", () => {
      const req = createMockReq();
      const { res } = createMockRes();
      let capturedError: unknown = null;

      requireAuthenticatedActor(req, res, (err) => {
        capturedError = err;
      });

      expect(capturedError).toBeInstanceOf(ApiError);
      expect((capturedError as ApiError).statusCode).toBe(401);
      expect((capturedError as ApiError).errorCode).toBe("WT_ERR_UNAUTHORIZED");
    });

    it("allows authenticated actor and verifies role permissions", () => {
      const activeActor: ActorContext = {
        actorId: "user-123",
        username: "operator_sarah",
        displayName: "Sarah Chen",
        role: "materials",
        department: "receiving",
        authenticatedAt: new Date(),
      };

      const req = createMockReq({ actor: activeActor });
      const { res } = createMockRes();

      // materials role allowed
      let errorRoleAllowed: unknown = null;
      requireRole(["materials", "manager"])(req, res, (err) => {
        errorRoleAllowed = err;
      });
      expect(errorRoleAllowed).toBeUndefined();

      // quality role rejected
      let errorRoleDenied: unknown = null;
      requireRole(["quality", "admin"])(req, res, (err) => {
        errorRoleDenied = err;
      });
      expect(errorRoleDenied).toBeInstanceOf(ApiError);
      expect((errorRoleDenied as ApiError).statusCode).toBe(403);
      expect((errorRoleDenied as ApiError).errorCode).toBe("WT_ERR_FORBIDDEN");
    });

    it("verifies department alignment", () => {
      const activeActor: ActorContext = {
        actorId: "user-123",
        username: "operator_sarah",
        displayName: "Sarah Chen",
        role: "materials",
        department: "receiving",
        authenticatedAt: new Date(),
      };

      const req = createMockReq({ actor: activeActor });
      const { res } = createMockRes();

      let errAllowed: unknown = null;
      requireDepartment(["receiving", "raw-store"])(req, res, (err) => {
        errAllowed = err;
      });
      expect(errAllowed).toBeUndefined();

      let errDenied: unknown = null;
      requireDepartment(["cutting", "stitching"])(req, res, (err) => {
        errDenied = err;
      });
      expect(errDenied).toBeInstanceOf(ApiError);
      expect((errDenied as ApiError).statusCode).toBe(403);
      expect((errDenied as ApiError).errorCode).toBe("WT_ERR_DEPT_FORBIDDEN");
    });
  });

  describe("Contracts & Utility Verification", () => {
    it("normalizes tag UID to uppercase hex without delimiters", () => {
      expect(normalizeTagUid("e2:80:11:60:60:00:02:1a")).toBe("E28011606000021A");
      expect(normalizeTagUid(" e2 80 11 60 ")).toBe("E2801160");
      expect(normalizeTagUid("e2-80-11-60")).toBe("E2801160");
    });

    it("pending implementation stubs explicitly fail instead of silent no-ops", async () => {
      await expect(
        pendingLedgerOutboxService.queueCommitment(
          {
            scope: "event",
            payloadSha256: Buffer.from("test"),
          },
          {} as PrismaTransactionClient,
        ),
      ).rejects.toThrow(PendingImplementationError);
    });

    it("runInTransaction reuses existing transaction context", async () => {
      const mockTx = { isMockTx: true } as unknown as PrismaTransactionClient;
      let receivedTx: unknown = null;

      const result = await runInTransaction(
        async (tx) => {
          receivedTx = tx;
          return "success";
        },
        mockTx,
      );

      expect(result).toBe("success");
      expect(receivedTx).toBe(mockTx);
    });
  });

  describe("Express App Live HTTP Pipeline", () => {
    it("serves GET /healthz liveness probe with 200 OK and valid JSON structure", async () => {
      const app = createExpressApp();
      const server = app.listen(0);

      try {
        const address = server.address() as AddressInfo;
        const port = address.port;

        const response = await fetch(`http://127.0.0.1:${port}/healthz`);
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
          success: boolean;
          data: { status: string; uptimeSeconds: number };
          meta: { requestId: string };
        };

        expect(body.success).toBe(true);
        expect(body.data.status).toBe("ok");
        expect(typeof body.data.uptimeSeconds).toBe("number");
        expect(body.meta.requestId).toBeDefined();
        expect(response.headers.get("x-request-id")).toBe(body.meta.requestId);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("returns 404 WT_ERR_NOT_FOUND for non-existent routes", async () => {
      const app = createExpressApp();
      const server = app.listen(0);

      try {
        const address = server.address() as AddressInfo;
        const port = address.port;

        const response = await fetch(`http://127.0.0.1:${port}/api/non-existent-endpoint`);
        expect(response.status).toBe(404);

        const body = (await response.json()) as {
          success: boolean;
          error: { code: string; message: string };
        };

        expect(body.success).toBe(false);
        expect(body.error.code).toBe("WT_ERR_NOT_FOUND");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
