import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
} from "@/server/auth/crypto";
import {
  extractSessionToken,
  createAuthMiddleware,
  requireRole,
  requireDepartment,
  requireGrant,
  type RequestLike,
  type ResponseLike,
} from "@/server/auth/actor-context";
import {
  mapPrismaRoleToDomain,
  mapPrismaDepartmentToDomain,
  toStaffUserDto,
} from "@/server/auth/auth-service";
import { ApiError, createHttpClient } from "@/lib/data/http-client";
import type { StaffUser } from "@/domain/types";

describe("Milestone 1: Password Cryptography & Session Tokens", () => {
  it("generates scrypt password hashes and verifies them securely", async () => {
    const password = "SecureStaffPassword123!";
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);

    // Verify correct password
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);

    // Reject incorrect password
    const invalid = await verifyPassword("WrongPassword123!", hash);
    expect(invalid).toBe(false);

    // Reject malformed hashes safely
    expect(await verifyPassword(password, "invalid_hash_string")).toBe(false);
    expect(await verifyPassword(password, "scrypt$too$short")).toBe(false);
  });

  it("generates unique 64-char hex session tokens and 32-byte SHA-256 digests", () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);

    const digest1 = hashSessionToken(token1);
    const digest2 = hashSessionToken(token1); // identical input

    expect(digest1).toBeInstanceOf(Buffer);
    expect(digest1.length).toBe(32);
    expect(digest1.equals(digest2)).toBe(true);
  });
});

describe("Milestone 1: Express ActorContext & Authorization Guards", () => {
  it("extracts session token from Bearer header or cookie", () => {
    const reqWithBearer: RequestLike = {
      headers: { authorization: "Bearer my-secret-session-token-123" },
    };
    expect(extractSessionToken(reqWithBearer)).toBe("my-secret-session-token-123");

    const reqWithCookie: RequestLike = {
      headers: { cookie: "other=1; weartrail_session=my-cookie-session-456; test=2" },
    };
    expect(extractSessionToken(reqWithCookie)).toBe("my-cookie-session-456");

    const reqEmpty: RequestLike = { headers: {} };
    expect(extractSessionToken(reqEmpty)).toBeNull();
  });

  it("auth middleware rejects requests without session token (401)", async () => {
    const authMw = createAuthMiddleware(
      async () => null,
      async () => null,
    );

    const req: RequestLike = { headers: {} };
    let statusCode = 0;
    let jsonResponse: unknown;

    const res: ResponseLike = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        jsonResponse = body;
        return this;
      },
    };

    let nextCalled = false;
    await authMw(req, res, () => {
      nextCalled = true;
    });

    expect(statusCode).toBe(401);
    expect(jsonResponse).toEqual({
      error: "UNAUTHORIZED",
      message: "Authentication required. No session token provided.",
    });
    expect(nextCalled).toBe(false);
  });

  it("auth middleware rejects expired sessions (401) and suspended users (403)", async () => {
    const dummyUser: StaffUser = {
      id: "u-test-01",
      username: "marcus.vance",
      displayName: "Marcus Vance",
      role: "P",
      department: "stitching",
      email: "marcus@weartrail.internal",
      status: "active",
      scope: "production:stitching",
    };

    // Test expired session
    const expiredAuthMw = createAuthMiddleware(
      async () => dummyUser,
      async () => ({
        session: {
          id: "sess-01",
          userId: dummyUser.id,
          tokenHash: "abc",
          createdAt: new Date(Date.now() - 48 * 3600 * 1000),
          expiresAt: new Date(Date.now() - 1000), // Expired 1s ago
          revokedAt: null,
          lastActiveAt: new Date(),
        },
        user: dummyUser,
      }),
    );

    let status = 0;
    const res: ResponseLike = {
      status(c) {
        status = c;
        return this;
      },
      json() {
        return this;
      },
    };

    await expiredAuthMw({ headers: { authorization: "Bearer valid-token" } }, res, () => {});
    expect(status).toBe(401);

    // Test suspended user
    const suspendedUser: StaffUser = { ...dummyUser, status: "suspended" };
    const suspendedAuthMw = createAuthMiddleware(
      async () => suspendedUser,
      async () => ({
        session: {
          id: "sess-02",
          userId: suspendedUser.id,
          tokenHash: "abc",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600 * 1000),
          revokedAt: null,
          lastActiveAt: new Date(),
        },
        user: suspendedUser,
      }),
    );

    await suspendedAuthMw({ headers: { authorization: "Bearer valid-token" } }, res, () => {});
    expect(status).toBe(403);
  });

  it("auth middleware attaches authoritative ActorContext upon valid session", async () => {
    const validUser: StaffUser = {
      id: "u-qa-01",
      username: "elena.rossi",
      displayName: "Elena Rossi",
      role: "Q",
      department: "quality",
      email: "elena@weartrail.internal",
      status: "active",
      scope: "quality",
    };

    const authMw = createAuthMiddleware(
      async () => validUser,
      async () => ({
        session: {
          id: "sess-valid-01",
          userId: validUser.id,
          tokenHash: "digest-bytes",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600 * 1000),
          revokedAt: null,
          lastActiveAt: new Date(),
        },
        user: validUser,
      }),
    );

    const req: RequestLike = { headers: { authorization: "Bearer valid-token" } };
    let nextCalled = false;
    const res: ResponseLike = {
      status() {
        return this;
      },
      json() {
        return this;
      },
    };

    await authMw(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.actor).toBeDefined();
    expect(req.actor?.username).toBe("elena.rossi");
    expect(req.actor?.role).toBe("Q");
    expect(req.actor?.department).toBe("quality");
    expect(req.actor?.grants).toContain("quality:inspect_final");
  });

  it("guards enforce role, department and capability grants correctly", () => {
    const dummyReq: RequestLike = {
      headers: {},
      actor: {
        userId: "u-01",
        username: "drew.logistics",
        displayName: "Drew Dispatch",
        email: "drew@weartrail.internal",
        role: "L",
        department: "dispatch",
        status: "active",
        scope: "logistics:dispatch",
        sessionId: "sess-01",
        grants: ["fulfilment:dispatch_shipment", "reports:view"],
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      },
    };

    let status = 0;
    const res: ResponseLike = {
      status(c) {
        status = c;
        return this;
      },
      json() {
        return this;
      },
    };

    // Role check: L allowed, A denied
    let nextCalled = false;
    requireRole("L")(dummyReq, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);

    nextCalled = false;
    requireRole("A")(dummyReq, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(status).toBe(403);

    // Department check: dispatch allowed, quality denied
    nextCalled = false;
    requireDepartment("dispatch")(dummyReq, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);

    nextCalled = false;
    requireDepartment("quality")(dummyReq, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(status).toBe(403);

    // Grant check: fulfilment:dispatch_shipment allowed, admin:manage_users denied
    nextCalled = false;
    requireGrant("fulfilment:dispatch_shipment")(dummyReq, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);

    nextCalled = false;
    requireGrant("admin:manage_users")(dummyReq, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(status).toBe(403);
  });
});

describe("Milestone 1: Shared HTTP Client & Typed Error Protocol", () => {
  it("ApiError contains status, code and message", () => {
    const err = new ApiError(401, "WT_ERR_INVALID_CREDENTIALS", "Invalid password provided.");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(401);
    expect(err.code).toBe("WT_ERR_INVALID_CREDENTIALS");
    expect(err.message).toBe("Invalid password provided.");
  });

  it("unimplemented domain operations throw explicit 501 ApiError and never fall back to mock", async () => {
    const client = createHttpClient();

    // Attempting an unrouted factory operation must fail with 501
    await expect(client.listOrders()).rejects.toThrowError(ApiError);
    await expect(client.listOrders()).rejects.toMatchObject({
      status: 501,
      code: "WT_ERR_NOT_YET_IMPLEMENTED",
    });

    await expect(client.listLots()).rejects.toMatchObject({
      status: 501,
      code: "WT_ERR_NOT_YET_IMPLEMENTED",
    });
  });
});

describe("Milestone 1: Database Staff User Mapping", () => {
  it("maps Prisma role and department enums to domain types accurately", () => {
    expect(mapPrismaRoleToDomain("admin")).toBe("A");
    expect(mapPrismaRoleToDomain("manager")).toBe("M");
    expect(mapPrismaRoleToDomain("materials")).toBe("O");
    expect(mapPrismaRoleToDomain("production")).toBe("P");
    expect(mapPrismaRoleToDomain("quality")).toBe("Q");
    expect(mapPrismaRoleToDomain("logistics")).toBe("L");

    expect(mapPrismaDepartmentToDomain("raw_store")).toBe("raw-store");
    expect(mapPrismaDepartmentToDomain("technical_admin")).toBe("receiving");
    expect(mapPrismaDepartmentToDomain("cutting")).toBe("cutting");
  });

  it("converts Prisma staff user records to StaffUser DTOs", () => {
    const userDto = toStaffUserDto(
      {
        id: "u-001",
        username: "marcus.vance",
        display_name: "Marcus Vance",
        suspended_at: null,
      },
      [{ role: "production", department_code: "cutting" }],
    );

    expect(userDto.id).toBe("u-001");
    expect(userDto.username).toBe("marcus.vance");
    expect(userDto.displayName).toBe("Marcus Vance");
    expect(userDto.role).toBe("P");
    expect(userDto.department).toBe("cutting");
    expect(userDto.status).toBe("active");
  });
});
