# WearTrail Real Scan-Ingestion Pipeline & Domain Handler Handoff

**Author:** Member 1 (Platform & Integration Lead)  
**Branch:** `backend/live`  
**Target Audience:** Member 2 (Materials & Production), Member 3 (Quality & Fulfilment), Member 4 (Staff Access & Auth)  
**Status:** Live Endpoint Mounted, Pipeline Validated, 82 Tests Passing  

---

## 1. Executive Summary

Member 1 has delivered the live scan-ingestion foundation for WearTrail:
- **Live Endpoint:** `POST /api/rfid/scan` is mounted in Express ([src/server/app.ts](file:///C:/Users/mahme/Documents/supply chain project/WearTrail/src/server/app.ts)) with strict Zod validation ([src/server/rfid/schemas.ts](file:///C:/Users/mahme/Documents/supply chain project/WearTrail/src/server/rfid/schemas.ts)).
- **Hardware Device Authentication:** Validates pre-shared device secrets against PostgreSQL `supplyease.device_credentials` and `devices` using 32-byte SHA-256 digests.
- **Hardware Mapping & Session Resolution:** Validates active mapping versions in `device_mapping_versions`, resolves reader indices to stations in `device_reader_mappings`, and requires an active operator session in `reader_sessions`.
- **ActorContext Integration:** Derives the operator's `ActorContext` server-side from `reader_sessions` and `staff_users`, enforcing role/department permissions before any scan is processed.
- **Action Context Lifecycle:** Enforces single-use consumption, expiry, and station requirements (`final_qc` and `cutting` strictly require an action context).
- **Durable Database Idempotency:** Scoped to `(device_id, scan_id)` and `(device_id, boot_id, sequence)` with canonical request SHA-256 hashing. Identical retries return the recorded outcome idempotently; conflicting retries return `409 Conflict`.
- **Atomic Two-Phase Transaction Orchestration:** Passes the shared `PrismaTransactionClient` into registered domain handlers (`prepare` -> insert scan -> `process` -> consume context). Failures roll back business mutations while safely persisting rejected scan evidence.
- **Simulator Included:** Programmatic client ([src/server/rfid/simulator.ts](file:///C:/Users/mahme/Documents/supply chain project/WearTrail/src/server/rfid/simulator.ts)) and CLI tool ([scripts/simulate-scan.ts](file:///C:/Users/mahme/Documents/supply chain project/WearTrail/scripts/simulate-scan.ts)) to fire valid scan envelopes through the live pipeline.

---

## 2. Scan Ingestion Endpoint Specification

### `POST /api/rfid/scan`

#### Request Headers
| Header | Required | Format / Description |
|---|---|---|
| `Authorization` | Yes* | `Bearer <deviceSecret>` (or via `X-Device-Secret`) |
| `X-Device-Secret` | Yes* | Raw device secret matching `device_credentials.credential_digest` |
| `Content-Type` | Yes | `application/json` |

#### Request Body (`VersionedScanEnvelope` v1)
```json
{
  "version": "v1",
  "deviceId": "11111111-1111-4111-a111-111111111111",
  "scanId": "scan_uuid_or_unique_string",
  "bootId": "boot_uuid_or_identifier",
  "sequence": 42,
  "readerIndex": 5,
  "mappingVersion": 1,
  "tagUid": "E280116060000204",
  "actionContextId": "44444444-4444-4444-a444-444444444444",
  "deviceUptimeMs": 120500,
  "timestamp": "2026-11-19T22:00:00.000Z"
}
```

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "scanId": "scan_uuid_or_unique_string",
    "outcome": "accepted",
    "outcomeCode": "success",
    "outcomeMessage": "Scan accepted and processed",
    "stationCode": "final_qc",
    "subjectKind": "garment",
    "subjectId": "66666666-6666-4666-a666-666666666666",
    "subjectCode": "GAR-2026-001",
    "processedAt": "2026-11-19T22:00:01.123Z"
  },
  "meta": {
    "requestId": "req_uuid",
    "timestamp": "2026-11-19T22:00:01.124Z"
  }
}
```

#### Standard Error Codes
| Status | Error Code | Description |
|---|---|---|
| `400` | `WT_ERR_VALIDATION_FAILED` | Malformed envelope fields, missing required properties. |
| `400` | `WT_ERR_INACTIVE_MAPPING` | Device mapping version has not been activated or is retired. |
| `400` | `WT_ERR_UNMAPPED_READER` | The reported readerIndex has no mapping in `device_reader_mappings`. |
| `400` | `WT_ERR_NO_OPERATOR_SESSION` | No active operator session open for this station. |
| `400` | `WT_ERR_CONTEXT_REQUIRED` | Station requires action context (e.g. `final_qc`), but none reported. |
| `400` | `WT_ERR_CONTEXT_EXPIRED` | Action context `expires_at` has passed. |
| `400` | `WT_ERR_CONTEXT_ALREADY_CONSUMED`| Action context has already been used by a previous scan. |
| `401` | `WT_ERR_DEVICE_UNAUTHORIZED` | Missing device credential header. |
| `401` | `WT_ERR_INVALID_DEVICE_CREDENTIAL` | Secret digest not found in active `device_credentials`. |
| `403` | `WT_ERR_DEVICE_DISABLED` | Device has `enabled = false` in PostgreSQL. |
| `403` | `WT_ERR_DEVICE_IDENTITY_MISMATCH` | Claimed `deviceId` in envelope does not match credential. |
| `403` | `WT_ERR_OPERATOR_FORBIDDEN` | Operator role/department not authorized for station. |
| `409` | `WT_ERR_SCAN_CONFLICT` | Identity reuse: same `scanId` or `(bootId, sequence)` with different parameters. |
| `501` | `WT_ERR_HANDLER_UNAVAILABLE` | No `DomainScanHandler` registered for target `stationCode`. |

---

## 3. Domain Handler Contract for Members 2 and 3

Domain handlers must implement the shared interface [DomainScanHandler](file:///C:/Users/mahme/Documents/supply chain project/WearTrail/src/server/contracts/rfid.ts#L176) and register with `scanRoutingService`.

### Exact Imports
```ts
import type {
  DomainScanHandler,
  DomainScanContext,
  PreparedScanSubject,
  ScanOutcomeResult,
  VersionedScanEnvelope,
} from "@/server/contracts/rfid";
import type { PrismaTransactionClient } from "@/server/db/types";
import { scanRoutingService } from "@/server/rfid/scan-router";
```

### Handler Interface Definition
```ts
export interface DomainScanHandler<TResult = ScanOutcomeResult> {
  readonly stationCode: RfidStationCode;

  /**
   * Phase 1: Entity Preparation & Foreign Key Ordering
   * - Cutting Station (Enrollment): Creates `garments` row and `rfid_tag_bindings` row first,
   *   returning `isNewEnrollment: true` and `tagBindingId`.
   * - Final QA / Routine: Validates garment stage, verifies active binding, returns existing subject.
   */
  prepare(
    envelope: VersionedScanEnvelope,
    tx: PrismaTransactionClient,
    context?: DomainScanContext,
  ): Promise<PreparedScanSubject>;

  /**
   * Phase 2: Domain Mutations & Quality Records
   * - Cutting: Attaches roll consumption, source selection link.
   * - Final QA: Inserts inspection, updates disposition ('released' or 'held'), opens rework case on fail.
   * - Routine: Advances `current_stage` to 'stitching' or 'finishing'.
   */
  process(
    envelope: VersionedScanEnvelope,
    subject: PreparedScanSubject,
    tx: PrismaTransactionClient,
    context?: DomainScanContext,
  ): Promise<TResult>;
}
```

### Context Provided to Handlers (`DomainScanContext`)
Inside both `prepare` and `process`, handlers receive `context`:
- `context.actor`: The authenticated staff operator (`actorId`, `username`, `role`, `department`).
- `context.session`: Active reader session contract (`stationCode`, `operatorId`, `openedAt`).
- `context.actionContext`: The validated one-use action context, containing user-selected payload:
  - For QA: `qcOutcome` ('pass' | 'fail'), `checklistVersionId`, `answers`, `defectReason`, `notes`.
  - For Cutting: `cuttingJobId`, `cuttingInputId`, `sourceSelectionId`, `productionOrderId`.

### Handler Registration Pattern
Handlers should be registered during module initialization or startup:
```ts
// Example: Registering Member 2's Cutting Handler
scanRoutingService.registerHandler(cuttingScanHandler);

// Example: Registering Member 3's Final QA Handler
scanRoutingService.registerHandler(finalQcScanHandler);
```

---

## 4. Dependencies & Next Tasks by Member

### Task for Member 2 (Materials & Production)
1. **Implement `cuttingScanHandler`:**
   - In `prepare`: Create garment in `tx.garments` and create active tag binding in `tx.rfid_tag_bindings` (`unbound_at: null`). Return `PreparedScanSubject` with `isNewEnrollment: true` and `tagBindingId`.
   - In `process`: Link roll source selection to `cutting_source_selections` and attribute fabric consumption.
2. **Implement Routine Production Handler:**
   - For stations `stitching` and `finishing`, verify garment is at prior stage and update `tx.garments.current_stage`.

### Task for Member 3 (Quality & Fulfilment)
1. **Implement `finalQcScanHandler`:**
   - In `prepare`: Resolve garment bound to `envelope.tagUid` in `tx.rfid_tag_bindings`. Assert garment stage is `'finishing'` or `'final-qc'`.
   - In `process`: Read `context.actionContext.payload`. Insert `tx.inspections`. If `qcOutcome === 'pass'`, set disposition to `'released'`. If `'fail'`, atomically insert `tx.garment_holds` and `tx.rework_cases`.
2. **Enforce Independent Reinspection:**
   - If `qcScope === 'reinspection'`, query `tx.repair_records` and block if `actor.actorId === repair_record.performed_by`.

### Task for Member 4 (Staff Access & Client)
1. **Durable Session Persistence:**
   - Connect [src/server/auth/actor-context.ts](file:///C:/Users/mahme/Documents/supply chain project/WearTrail/src/server/auth/actor-context.ts) to query and insert `supplyease.staff_sessions` and `staff_users` in PostgreSQL rather than using an in-memory `Map`.
2. **HTTP Data Client (`src/lib/data/http-client.ts`):**
   - Provide an HTTP-backed implementation of `WearTrailClient` using `fetch()` against `/api/*` so the browser UI can leave mock mode.

---

## 5. Verification Commands

```bash
# Run the complete test suite (82 passing tests including all 25 scan pipeline tests)
npm test

# Run isolated type check
npx tsc --noEmit

# Test live database connectivity to Supabase
npm run db:check

# Run simulated scan via CLI against local Express server
npx tsx scripts/simulate-scan.ts --station=final_qc --uid=E280116060000204
```
