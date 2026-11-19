import { describe, expect, it } from "vitest";
import {
  assertAuthorized,
  assertIndependentRepairReinspection,
  createActorContext,
  deriveStaffGrants,
  hasDepartment,
  hasGrant,
  hasRole,
} from "@/domain/actor";
import { canonicalizeValue, computeSha256Sync, toCanonicalJson } from "@/domain/canonical";
import {
  DEMO_DEFAULT_PASSWORD,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/domain/crypto-auth";
import { can, canAccessRoute } from "@/domain/permissions";
import type { DemoState, StaffUser } from "@/domain/types";
import * as E from "@/mock/engine";
import { createSeed } from "@/mock/fixtures";
import { buildCanonicalPublicPayload, projectJourney, projectProof } from "@/mock/projection";

const as = (s: DemoState, username: string): StaffUser =>
  s.users.find((u) => u.username === username)!;

describe("Member 4: Staff Access & Credential Lifecycle", () => {
  it("authenticates valid staff credentials and issues a session", () => {
    const s = createSeed();
    const result = E.authenticateStaff(s, "admin.demo", DEMO_DEFAULT_PASSWORD);

    expect(result.user.username).toBe("admin.demo");
    expect(result.sessionId).toBeDefined();
    expect(result.token).toMatch(/^tk_sess/);
    expect(
      s.sessions?.some((sess) => sess.id === result.sessionId && sess.status === "active"),
    ).toBe(true);
  });

  it("rejects invalid password and suspended staff accounts", () => {
    const s = createSeed();

    // Wrong password
    expect(() => E.authenticateStaff(s, "admin.demo", "wrongpassword123")).toThrow(
      /Invalid username or password/,
    );

    // Non-existent user
    expect(() => E.authenticateStaff(s, "ghost.user", DEMO_DEFAULT_PASSWORD)).toThrow(
      /Invalid username or password/,
    );

    // Suspended account
    const admin = as(s, "admin.demo");
    const stitchUser = as(s, "stitching.demo");
    E.setUserSuspended(s, admin, stitchUser.id, true);

    expect(() => E.authenticateStaff(s, "stitching.demo", DEMO_DEFAULT_PASSWORD)).toThrow(
      /suspended/,
    );
  });

  it("handles credential tokens across valid, expired, used, and unknown states", () => {
    const s = createSeed();

    expect(E.checkCredentialToken(s, "demo-valid-token")).toBe("valid");
    expect(E.checkCredentialToken(s, "demo-expired-token")).toBe("expired");
    expect(E.checkCredentialToken(s, "demo-used-token")).toBe("used");
    expect(E.checkCredentialToken(s, "non-existent-token")).toBe("unknown");

    // Cannot consume expired or used tokens
    expect(() =>
      E.consumeCredentialToken(s, "demo-expired-token", "NewSecurePassword123!"),
    ).toThrow(/expired/);
    expect(() => E.consumeCredentialToken(s, "demo-used-token", "NewSecurePassword123!")).toThrow(
      /already been used/,
    );
  });

  it("consumes a valid token, updates user password, and marks token as used", () => {
    const s = createSeed();
    const admin = as(s, "admin.demo");

    // Admin invites a new user
    const newUserId = E.inviteUser(s, admin, {
      username: "trainee.qa",
      displayName: "Trainee QA",
      role: "Q",
      department: "quality",
    });

    const newUser = s.users.find((u) => u.id === newUserId)!;
    expect(newUser.status).toBe("invited");

    // Find the invite token
    const tokenRecord = s.credentialTokens?.find(
      (t) => t.userId === newUserId && t.kind === "invite",
    );
    expect(tokenRecord).toBeDefined();
    expect(tokenRecord?.status).toBe("valid");

    // Consume the token with a new password
    const newPw = "SuperSecurePassword2026!";
    E.consumeCredentialToken(s, tokenRecord!.token, newPw);

    // Verify token is now marked used
    expect(tokenRecord.status).toBe("used");
    expect(tokenRecord.usedAt).toBeDefined();

    // Verify user is now active and can sign in with new password
    expect(newUser.status).toBe("active");
    const authResult = E.authenticateStaff(s, "trainee.qa", newPw);
    expect(authResult.user.id).toBe(newUserId);
  });

  it("changes password with current password verification and revokes other sessions", () => {
    const s = createSeed();
    const user = as(s, "manager.demo");

    // Authenticate and issue a session
    const sess = E.authenticateStaff(s, "manager.demo", DEMO_DEFAULT_PASSWORD);

    // Wrong current password
    expect(() =>
      E.changeStaffPassword(s, user, "wrong-current-pw", "NewValidPassword123!"),
    ).toThrow(/Current password is incorrect/);

    // Password too short (<10 chars)
    expect(() => E.changeStaffPassword(s, user, DEMO_DEFAULT_PASSWORD, "short")).toThrow(
      /at least 10 characters/,
    );

    // Successful password change
    const newPw = "BrandNewManagerPassword99!";
    E.changeStaffPassword(s, user, DEMO_DEFAULT_PASSWORD, newPw);

    // Old password fails
    expect(() => E.authenticateStaff(s, "manager.demo", DEMO_DEFAULT_PASSWORD)).toThrow(
      /Invalid username or password/,
    );

    // New password succeeds
    const authedNew = E.authenticateStaff(s, "manager.demo", newPw);
    expect(authedNew.user.id).toBe(user.id);

    // Revoke all other sessions
    E.signOutOtherSessions(s, user);
    const oldSess = s.sessions?.find((x) => x.id === sess.sessionId);
    expect(oldSess?.status).toBe("revoked");
  });
});

describe("Member 4: Role & Department Authorization Matrix", () => {
  it("enforces that manager/admin alone cannot perform shop-floor factory mutations", () => {
    const s = createSeed();
    const admin = as(s, "admin.demo");
    const manager = as(s, "manager.demo");

    // Admin grants
    const adminGrants = deriveStaffGrants(admin.role, admin.department);
    expect(adminGrants).toContain("admin:manage_users");
    expect(adminGrants).not.toContain("quality:inspect_final");
    expect(adminGrants).not.toContain("materials:receive_lot");

    // Manager grants
    const managerGrants = deriveStaffGrants(manager.role, manager.department);
    expect(managerGrants).toContain("orders:plan");
    expect(managerGrants).toContain("orders:approve");
    expect(managerGrants).not.toContain("cutting:confirm_source");
    expect(managerGrants).not.toContain("fulfilment:dispatch_shipment");

    // Can capability functions
    expect(can.receiveLot(admin)).toBe(false);
    expect(can.operateCutting(admin)).toBe(false);
    expect(can.operateFinishing(admin)).toBe(false);
    expect(can.packGarment(admin)).toBe(false);
    expect(can.confirmDeparture(admin)).toBe(false);

    expect(can.receiveLot(manager)).toBe(false);
    expect(can.operateCutting(manager)).toBe(false);
    expect(can.operateFinishing(manager)).toBe(false);
    expect(can.packGarment(manager)).toBe(false);
    expect(can.confirmDeparture(manager)).toBe(false);
  });

  it("enforces independent repair reinspection: repairer cannot self-approve their own repair", () => {
    const repairPerformerId = "u-stitching";
    const sameInspectorId = "u-stitching";
    const differentInspectorId = "u-quality";

    // Self-approval check fails
    expect(() => assertIndependentRepairReinspection(sameInspectorId, repairPerformerId)).toThrow(
      /Independent inspection violation/,
    );

    // Independent inspector passes
    expect(() =>
      assertIndependentRepairReinspection(differentInspectorId, repairPerformerId),
    ).not.toThrow();
  });
});

describe("Member 4: Canonical JSON & Deterministic SHA-256 Hashing", () => {
  it("produces deterministic canonical serialization regardless of object key order", () => {
    const objA = {
      productName: "Classic Shirt",
      version: 1,
      publicId: "WT-001",
      milestones: [{ key: "a", date: "2026-11-19" }],
    };

    const objB = {
      publicId: "WT-001",
      milestones: [{ date: "2026-11-19", key: "a" }],
      version: 1,
      productName: "Classic Shirt",
    };

    const canonicalA = toCanonicalJson(objA);
    const canonicalB = toCanonicalJson(objB);

    expect(canonicalA).toBe(canonicalB);
    expect(computeSha256Sync(canonicalA)).toBe(computeSha256Sync(canonicalB));
  });

  it("excludes undefined values during canonicalization", () => {
    const objWithUndef = { a: "hello", b: undefined, c: 42 };
    const objClean = { a: "hello", c: 42 };

    expect(toCanonicalJson(objWithUndef)).toBe(toCanonicalJson(objClean));
  });
});

describe("Member 4: Public Shopper Journey & Privacy Boundaries", () => {
  it("strictly excludes worker IDs, raw RFID UIDs, internal defect notes, and private nonces", () => {
    const s = createSeed();
    const journey = projectJourney(s, "shirt-001-demo")!;
    expect(journey).toBeDefined();

    const serialized = JSON.stringify(journey);

    // No raw RFID UIDs
    expect(serialized).not.toMatch(/04A7B8C9|04A1B2C3|04DAEBFC/);

    // No staff user IDs
    expect(serialized).not.toMatch(/u-admin|u-manager|u-quality|u-stitching|u-cutting/);

    // No private internal nonces or raw commitment hashes
    expect(serialized).not.toMatch(/sha256_nonce_v1/);

    // No supplier raw references
    expect(serialized).not.toMatch(/SUP-REF/);

    // Fabric lot milestone is explicitly labelled 'Fabric lot'
    const fabricMilestone = journey.milestones.find((m) => m.key === "fabric-sourced")!;
    expect(fabricMilestone).toBeDefined();
    expect(fabricMilestone.lotLevel).toBe(true);
    expect(fabricMilestone.department).toBe("Materials");
  });

  it("reflects active quality hold as 'Temporarily on hold' with a generalized notice", () => {
    const s = createSeed();
    const g2 = s.garments.find((g) => g.id === "SHIRT-002")!;

    // Place active hold on SHIRT-002
    g2.hold = {
      since: "2026-11-19T00:00:00Z",
      reason: "Open seam at left sleeve",
      inspectionId: "INSP-002",
    };

    const journey = projectJourney(s, "shirt-002-demo")!;
    expect(journey.status).toBe("Temporarily on hold");
    expect(journey.notice).toBeDefined();
    expect(journey.notice?.title).toMatch(/Quality review in progress/);

    // Internal defect reason must NEVER appear in public response
    expect(JSON.stringify(journey)).not.toMatch(/Open seam at left sleeve/);
  });

  it("returns null for unknown public product IDs", () => {
    const s = createSeed();
    expect(projectJourney(s, "unknown-garment-999")).toBeNull();
    expect(projectProof(s, "unknown-garment-999")).toBeNull();
  });

  it("generates matching technical proof with exact canonical payload hash", () => {
    const s = createSeed();
    const proof = projectProof(s, "shirt-001-demo")!;
    expect(proof).toBeDefined();

    expect(proof.payload.schema).toBe("weartrail.public-journey/v1");
    expect(proof.version).toBeGreaterThanOrEqual(1);
    expect(proof.journeyHash).toBeDefined();
    expect(proof.journeyHash.length).toBe(64);

    // Re-computing hash over proof payload canonical JSON must match proof.journeyHash
    const computedHash = computeSha256Sync(toCanonicalJson(proof.payload));
    expect(computedHash).toBe(proof.journeyHash);
  });
});
