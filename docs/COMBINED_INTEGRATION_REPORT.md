# WearTrail Combined Backend Integration Report

**Date:** 20 November 2026  
**Auditor:** Member 1 (Platform & Integration Lead)  
**Branch:** `backend/live`  
**Test Suite Status:** 12 Test Files Passed (150 Tests Passing, 100% Success)  
**Smart Contract Status:** 22 Passing Hardhat Contract Tests  
**Database Status:** Connected to PostgreSQL (`supplyease` schema, 59 tables)  

---

## 1. Executive Summary

This report documents the successful merge, integration wiring, and automated verification of Member 2 (`origin/basim`) and Member 3 (`origin/daniyal`) into the authoritative `backend/live` baseline.

The combined backend now unites:
1. **Member 1 Foundation:** Production Express server foundation, RFID scan router & deduplication, transactional ledger commitments (`sha256_nonce_v1`), durable outbox worker with signer nonce management, and database connection pooling.
2. **Member 2 Persistence:** Materials receiving, supplier lots, stock accounting with atomic `available_accepted_quantity` tracking, production order approval, fabric issuing, cutting enrollment with roll attribution, and routine production scans (Stitching & Finishing).
3. **Member 3 Persistence:** Lot-level incoming QC, result-first card-second final QC evaluation, quality holds and rework cases, independent reinspection enforcement, fulfilment gating, warehouse binning, and dispatch departure gate.

The entire combined lifecycle was validated end-to-end through `src/test/combined-domain-workflow.test.ts`.

---

## 2. Merged Commits & Recovery References

Before executing any merges, a local recovery reference branch was created to ensure zero data loss.

| Branch / Reference | Commit SHA | Description |
|---|---|---|
| **Recovery Branch** | `447975608f502a871ccf07c59bf857c1303a82f4` | `backup/backend-live-pre-merge-m2-m3` created at initial `backend/live` HEAD |
| **Pre-merge `backend/live`** | `447975608f502a871ccf07c59bf857c1303a82f4` | Base with scan ingestion pipeline & ledger outbox worker |
| **Member 2 (`origin/basim`)** | `5332e28b5bd4f5e55322e9d1faff8347fe6b30e3` | Materials, production, tasks, and Stations 1-5 scan handlers |
| **Member 3 (`origin/daniyal`)** | `05f378e3330fe6970f4d4cbe3c06bb89236c5cce` | Incoming QC, Final QC, rework, fulfilment, and Stations 6-9 scan handlers |
| **Combined Merge Commit** | `7b7e12d` | Harmonized Express router mounting and scan handler registration |

---

## 3. Merge Conflict Resolutions

During the merge of Member 3 into the combined Member 1 + Member 2 baseline, a conflict arose in `src/server/app.ts`:

- **Conflicting Region:** Both branches imported and mounted their respective routers and scan handler registrations.
- **Resolution Strategy:**
  1. Mounted all 6 route namespaces in `src/server/app.ts`:
     - `/api/materials` (Materials Router)
     - `/api/production` (Production Router)
     - `/api/tasks` (Tasks Router)
     - `/api/quality` (Quality Router)
     - `/api/fulfilment` (Fulfilment Router)
     - `/api/rfid` (Authenticated RFID Ingestion Router)
  2. Registered all 9 station domain handlers:
     - Member 2: `registerMember2ScanHandlers()` (Stations 1 through 5: `fabric_receiving`, `fabric_issue`, `cutting`, `stitching`, `finishing`)
     - Member 3: `registerMember3ScanHandlers()` (Stations 6 through 9: `final_qc`, `packing`, `warehouse`, `dispatch`)
  3. Created `src/server/rfid/quality-fulfilment-handlers.ts` to implement the transactional `DomainScanHandler` interface for Member 3 stations, ensuring all scan events trigger audit trace records and transaction-scoped ledger outbox commitments (`sha256_nonce_v1`).
  4. Exported all scan handlers cleanly in `src/server/index.ts`.

---

## 4. Tested End-to-End Domain Workflow

Automated integration suite `src/test/combined-domain-workflow.test.ts` verified the complete combined domain workflow:

```
[Fabric Receiving: 20m]
         │
         ▼
[Incoming QC: Pass 20m] ────────► available_accepted_quantity = 20m
         │
         ├───────────────────────────────────────────────┐
         ▼                                               ▼
[Issue 8m to Order 1]                          [Issue 6m to Order 2]
         │                                               │
         └─────────────► 6m Unallocated ◄────────────────┘
                               │
               (Attempting 10m issue fails: WT_ERR_INSUFFICIENT_STOCK)
                               │
                               ▼
            [Cutting Enrollment: Garment A & Garment B]
                    (Roll attribution preserved)
                               │
                               ▼
             [Stitching (Station 4) -> 'stitched']
                               │
                               ▼
             [Finishing (Station 5) -> 'finished']
                               │
                               ▼
        [Final QA (Station 6) - Result-First Card-Second]
               │                               │
               ▼ (PASS)                        ▼ (FAIL: collar defect)
         [Garment B]                     [Garment A]
     disposition: 'released'          disposition: 'held'
               │                      garment_holds: opened
               │                      rework_cases: opened
               │                               │
               ▼                               ▼
       [Packing Station 7]            [Packing Station 7]
           (ACCEPTED)                     (BLOCKED: WT_ERR_FULFILMENT_BLOCKED)
               │                               │
               ▼                               ▼
       stage: 'packed'            [Rework Assigned to Tech Ali]
                                               │
                                               ▼
                                  [Repair Recorded by Tech Ali]
                                    (Hold is NOT released)
                                               │
                                               ▼
                                  [Reinspection by Tech Ali]
                                    (REJECTED: WT_ERR_INDEPENDENT_QC)
                                               │
                                               ▼
                                  [Reinspection by Inspector 2]
                                    (PASSED: disposition -> 'released')
                                    (Hold released & rework closed)
                                               │
                                               ▼
                                  [Packing Station 7: Garment A]
                                    (ACCEPTED -> stage: 'packed')
                                               │
               ┌───────────────────────────────┘
               ▼
       [Warehouse Station 8]
               │
               ▼
       [Departure Gate Station 9]
          - Any active hold on garment blocks shipment (WT_ERR_DISPATCH_HOLD_ACTIVE)
          - Cleared garments pass departure gate (DISPATCH_ACCEPTED)
```

### Verified Test Cases:
1. **Material Receipt & Stock Balance:** Received 20m fabric lot in `quarantined` state (`available_accepted_quantity = 0`). Incoming QC passed 20m, moving lot into available stock (`available_accepted_quantity = 20m`).
2. **Order Allocation:** Approved Order 1 and Order 2. Issued 8m to Order 1 and 6m to Order 2. Verified exactly 6m remain unallocated. Verified attempting to issue 10m fails with `WT_ERR_INSUFFICIENT_STOCK`.
3. **Cutting Enrollment & Roll Attribution:** Enrolled Garments A & B from issued fabric roll with `CuttingScanHandler`. Verified lineage linking garments to the material lot through cutting inputs. Verified duplicate card scan is rejected with active binding conflict.
4. **Routine Production Progress:** Progressed Garments A & B through Station 4 (Stitching) and Station 5 (Finishing). Stages advanced to `'stitched'` and `'finished'`.
5. **Final QA Result-First Card-Second:** Armed QA action contexts. Passed Garment B (disposition becomes `'released'`). Failed Garment A with collar seam defect (disposition becomes `'held'`, `garment_holds` opened, `rework_cases` opened).
6. **Fulfilment Gating:** Garment A scan at Packing rejected (`WT_ERR_FULFILMENT_BLOCKED`). Garment B scan accepted; stage advances to `'packed'`.
7. **Rework & Repair Action:** Assigned rework case to Technician Ali. Recorded repair notes. Verified hold is NOT automatically released; disposition remains `'held'`.
8. **Independent Reinspection Rule:** Technician Ali (repair author) attempting reinspection was strictly rejected (`WT_ERR_INDEPENDENT_QC`). Independent Inspector 2 reinspected and passed Garment A. Hold released, rework closed, disposition updated to `'released'`.
9. **Packing Released Garment:** Garment A scanned at Packing station; successfully accepted and stage advanced to `'packed'`.
10. **Warehouse Movement & Dispatch Departure Gate:** Scanned garments through warehouse storage. Verified that attempting to dispatch a shipment with a held garment is blocked (`WT_ERR_DISPATCH_HOLD_ACTIVE`). Cleared garments pass departure gate (`DISPATCH_ACCEPTED`).
11. **Atomic Transaction Rollback:** Confirmed that an error encountered midway through a transactional operation leaves zero orphan records in `material_stock_movements`, `garments`, `trace_events`, or `ledger_outbox`.
12. **Ledger Outbox Worker Batch Processing:** Verified all domain mutations enqueue outbox records with scheme `sha256_nonce_v1` using private 32-byte nonces. Verified worker leases batches, submits opaque hashes to contract via `SignerNonceManager`, confirms transactions, and reconciles receipts.
13. **Express Route Authorization:** Verified that all mounted `/api/*` mutation routes strictly deny unauthenticated requests with `401 WT_ERR_UNAUTHORIZED` without development bypasses.

---

## 5. Remaining Member 4 Dependencies

Member 4 (Staff Access, Shared UI & Public Journey) is currently completing their scope. The remaining integration points required from Member 4 are:

1. **Persistent Staff Session Storage:**
   - Server auth middleware in `src/server/auth/actor-context.ts` uses an in-memory session map.
   - Member 4 must connect session tokens to PostgreSQL table `supplyease.staff_sessions` with token hash verification, expiry checks, and revocation support.
2. **Live HTTP Client (`WearTrailClient`):**
   - The React frontend in `src/lib/data/provider.tsx` currently defaults to `createMockClient`.
   - Member 4 must deliver `src/lib/data/http-client.ts` implementing `WearTrailClient` via `fetch()` calls to the Express backend (`/api/*`), including credentials/cookies.
3. **Public Journey Projection Service:**
   - Public shopper endpoints `/p/:publicId` and `/p/:publicId/proof` must query published public customer evidence from PostgreSQL table `supplyease.public_payloads` rather than browser mock state.
4. **Staff Authentication Views:**
   - Login and PIN verification views must POST credentials to `/api/auth/login` to establish authenticated sessions.

---

## 6. Blockers Before Live Browser Workflow

Before end users can execute live workflows entirely within the browser against PostgreSQL:

1. **Browser Auth Seam:** The UI cannot make live authenticated mutation requests because the login endpoint and session cookie setter are pending Member 4's persistent session implementation.
2. **Client Provider Swap:** `src/lib/data/provider.tsx` must be toggled from `createMockClient` to the real `HttpWearTrailClient` once Member 4 publishes it.
3. **Hardware USB Bridge:** Physical RFID card scans at factory stations require running the USB serial forwarder daemon (`scripts/usb-serial-bridge.ts` or `packages/bridge/`) to read USB COM ports and POST to `/api/rfid/scan`. (Hardware simulation via `simulateScan` / test suites is currently fully functional).

---

## 7. Verification Summary

| Suite / Component | Tests Passed | Status | Details |
|---|---|---|---|
| `combined-domain-workflow.test.ts` | 4 / 4 | **PASSED** | Multi-domain lifecycle, rollback, outbox worker, route auth |
| `materials-persistence.test.ts` | 19 / 19 | **PASSED** | Materials receiving, stock balance, cutting, routine production |
| `quality-fulfilment-persistence.test.ts` | 22 / 22 | **PASSED** | Incoming QC, Final QC, rework, independent inspector, packaging |
| `ledger-worker.test.ts` | 11 / 11 | **PASSED** | Outbox worker leasing, signer nonces, crash recovery, receipt check |
| `ledger-commitments.test.ts` | 12 / 12 | **PASSED** | sha256_nonce_v1, private/public commitment separation, outbox queue |
| `scan-ingestion.test.ts` | 25 / 25 | **PASSED** | Envelope validation, device auth, idempotency, scan routing |
| `server-foundation.test.ts` | 14 / 14 | **PASSED** | Express middleware, CORS, bounds, /healthz, /ready, errors |
| `workflow.test.ts` | 11 / 11 | **PASSED** | Domain workflow rules and state transitions |
| `access-public.test.ts` | 13 / 13 | **PASSED** | Access control rules and public shopper view constraints |
| `materials-production.test.ts` | 9 / 9 | **PASSED** | Materials and production domain models |
| `quality-fulfilment.test.ts` | 9 / 9 | **PASSED** | Quality and fulfilment domain models |
| `app-routing.test.tsx` | 1 / 1 | **PASSED** | TanStack Router route tree structure |
| **Total Vitest Tests** | **150 / 150** | **PASSED** | **100% Pass Rate Across All 12 Test Files** |
| **Hardhat Blockchain Tests** | **22 / 22** | **PASSED** | **100% Pass Rate Across WearTrailCommitmentStore** |
