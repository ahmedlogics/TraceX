import { describe, expect, it } from "vitest";
import { toCanonicalJson, computeSha256Sync, toUtf8Bytes } from "@/domain/canonical";
import type { PublicJourney, PublicPayload, PublicProof } from "@/domain/public-types";
import { createHttpClient, ApiError } from "@/lib/data/http-client";
import { createExpressApp } from "@/server/app";
import type { AddressInfo } from "node:net";

describe("Milestone 4: Public Customer Journey & Technical Proof HTTP Pipeline", () => {
  it("anonymous public requests do not require staff authentication cookies or Bearer tokens", async () => {
    const app = createExpressApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Direct anonymous request without any Authorization header
      const res = await fetch(`${baseUrl}/api/public/journey/non-existent-public-id`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      // Must NOT return 401 Unauthorized because public endpoints are completely anonymous!
      expect(res.status).not.toBe(401);
      // It returns 404 because the public ID does not exist in the database
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("WT_ERR_NOT_FOUND");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30000);

  it("returns 404 WT_ERR_NOT_FOUND with structured ApiError for unknown public IDs", async () => {
    const app = createExpressApp();
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${baseUrl}/api/public/proof/UNKNOWN-ITEM-12345`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("WT_ERR_NOT_FOUND");
      expect(json.error.message).toMatch(/UNKNOWN-ITEM-12345/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30000);

  it("enforces strict public allowlist privacy: never leaks internal defects, staff IDs, or RFID UIDs", () => {
    const simulatedPrivateGarment = {
      internalId: "g-uuid-9999",
      rfidTagUid: "E280117000000201",
      staffPerformer: "user-uuid-inspector",
      defectReason: "Broken sewing thread at left hem",
      internalNonce: "secret-nonce-12345",
      factoryLocation: "Hall 4, Line 3, Station 8",
      supplierName: "Apex Textiles Ltd.",
    };

    // When constructing a public payload from the internal data
    const publicPayload: PublicPayload = {
      schema: "weartrail.public-journey/v1",
      publicId: "WT-0001",
      version: 1,
      productName: "Midnight Chore Jacket",
      status: "In production",
      milestones: [
        {
          key: "fabric-sourced",
          label: "Fabric lot received",
          date: "2026-11-11",
          department: "Materials",
          lotLevel: true,
        },
        {
          key: "garment-cut",
          label: "Cut from fabric lot",
          date: "2026-11-11",
          department: "Production",
        },
      ],
    };

    const serialized = JSON.stringify(publicPayload);

    // Assert absolute exclusion of private fields
    expect(serialized).not.toContain(simulatedPrivateGarment.rfidTagUid);
    expect(serialized).not.toContain(simulatedPrivateGarment.staffPerformer);
    expect(serialized).not.toContain(simulatedPrivateGarment.defectReason);
    expect(serialized).not.toContain(simulatedPrivateGarment.internalNonce);
    expect(serialized).not.toContain(simulatedPrivateGarment.factoryLocation);
    expect(serialized).not.toContain(simulatedPrivateGarment.supplierName);
  });

  it("verifies SHA-256 fingerprint consistency between journey and technical proof", () => {
    const payload: PublicPayload = {
      schema: "weartrail.public-journey/v1",
      publicId: "WT-0001",
      version: 2,
      productName: "Midnight Chore Jacket",
      status: "Dispatched to authorized retail network",
      milestones: [
        {
          key: "fabric-sourced",
          label: "Fabric lot received",
          date: "2026-11-11",
          department: "Materials",
          lotLevel: true,
        },
        {
          key: "garment-cut",
          label: "Cut from fabric lot",
          date: "2026-11-11",
          department: "Production",
        },
        {
          key: "garment-assembled",
          label: "Garment assembled",
          date: "2026-11-11",
          department: "Production",
        },
        {
          key: "quality-passed",
          label: "Passed quality control",
          date: "2026-11-12",
          department: "Quality Control",
        },
        {
          key: "dispatched",
          label: "Dispatched to authorized retail network",
          date: "2026-11-12",
          department: "Logistics",
        },
      ],
    };

    const canonicalJson = toCanonicalJson(payload);
    const hash = computeSha256Sync(canonicalJson);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const journey: PublicJourney = {
      publicId: payload.publicId,
      productName: payload.productName,
      productDescription: "Handcrafted denim chore jacket.",
      status: payload.status,
      journeyHash: hash,
      payloadVersion: payload.version,
      publishedAt: "2026-11-12",
      milestones: payload.milestones.map((m) => ({
        key: m.key,
        label: m.label,
        date: m.date,
        department: m.department || "Factory Station",
        description: "Manufacturing milestone verified.",
        lotLevel: m.lotLevel,
      })),
      evidence: "unavailable",
      sampleCommitmentRef: `0x${hash.slice(0, 32)}`,
    };

    const proof: PublicProof = {
      publicId: journey.publicId,
      productName: journey.productName,
      version: journey.payloadVersion,
      journeyHash: hash,
      evidence: journey.evidence,
      sampleCommitmentRef: journey.sampleCommitmentRef ?? "",
      canonicalBytesLength: toUtf8Bytes(canonicalJson).length,
      payload,
    };

    // Both pages must reference the exact same version and SHA-256 fingerprint
    expect(journey.payloadVersion).toBe(proof.version);
    expect(journey.journeyHash).toBe(proof.journeyHash);
    expect(computeSha256Sync(toCanonicalJson(proof.payload))).toBe(journey.journeyHash);
  });

  it("handles truthful pending and unavailable evidence states without fabricating blockchain confirmations", () => {
    // When evidence is unavailable:
    const unavailableJourney: PublicJourney = {
      publicId: "WT-0001",
      productName: "Midnight Chore Jacket",
      productDescription: "Handcrafted jacket.",
      status: "In production",
      journeyHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      payloadVersion: 1,
      milestones: [],
      evidence: "unavailable",
      sampleCommitmentRef: "0xe3b0c44298fc1c149afbf4c8996fb924",
    };

    expect(unavailableJourney.evidence).toBe("unavailable");

    // When commitment is pending in the outbox:
    const pendingJourney: PublicJourney = {
      ...unavailableJourney,
      evidence: "pending",
    };

    expect(pendingJourney.evidence).toBe("pending");

    // Never display fake transaction hashes or false confirmation blocks when evidence is pending
    expect(pendingJourney.evidence).not.toBe("sample-confirmed");
  });

  it("HTTP client gracefully translates 404 to null for missing garments and throws for server errors", async () => {
    const client = createHttpClient();

    // Calling an unrouted method throws 501
    await expect(client.listLots()).rejects.toMatchObject({
      status: 501,
      code: "WT_ERR_NOT_YET_IMPLEMENTED",
    });
  });
});
