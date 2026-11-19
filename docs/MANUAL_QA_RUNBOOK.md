# WearTrail End-to-End Manual QA Runbook

**Document Version:** 1.0.0-live  
**Branch:** `backend/live`  
**Target Environment:** Local Development & Staging  
**Database:** Supabase Managed PostgreSQL (Schema: `supplyease`)  
**Blockchain:** Hardhat Local Development Node (Chain ID: 31337) / Sepolia  

---

## 1. Overview & Architecture Scope

WearTrail is an enterprise garment provenance and factory tracking platform integrating physical RFID stations, PostgreSQL transactional state machines, and immutable blockchain ledger commitments.

This runbook guides a QA engineer or developer through testing the live full-stack system:

```mermaid
flowchart LR
    A[Vite Web App :8080] -->|HTTP / JSON| B[Express API Server :4000]
    Sim[RFID Simulator CLI] -->|POST /api/rfid/scan| B
    B -->|Prisma Client| C[(PostgreSQL supplyease)]
    D[Ledger Outbox Worker] -->|Poll & Lease Jobs| C
    D -->|submitCommitment| E[Hardhat Blockchain :8545]
    Public[Shopper Browser] -->|GET /p/:publicId| A
```

### Components Under Test
1. **Frontend UI (`:8080`):** TanStack Router + React client with persistent authentication, staff station dashboards, and public journey viewer.
2. **Express API Server (`:4000`):** Authenticated REST pipeline with persistent `ActorContext` resolution, strict RBAC, and error envelopes.
3. **RFID Scan Pipeline:** Hardware reader authentication, operator station claiming, two-phase domain handlers, and idempotency deduplication.
4. **Ledger Outbox Worker:** Durable database job leasing, batching, nonce concurrency control, and zero-knowledge hash anchoring to Solidity smart contract.
5. **Public Provenance Journey:** Public allowlist filtering (strictly excluding staff names and internal defect notes) and truthful cryptographic proof verification.

---

## 2. Environment Variables & Configuration

Before running services, ensure your `.env` file at the repository root contains the following verified keys:

| Variable | Recommended Dev Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `4000` | Express API server HTTP port |
| `DATABASE_URL` | `postgresql://weartrail_api:***@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=supplyease&sslmode=require` | Runtime connection pool string |
| `MIGRATION_DATABASE_URL` | `postgresql://postgres:***@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=supplyease&sslmode=require` | Administrative connection string for schema/bootstrap |
| `VITE_API_BASE_URL` | `http://localhost:4000` | Target API URL used by the Vite web app |
| `BLOCKCHAIN_RPC_URL` | `http://127.0.0.1:8545` | Hardhat JSON-RPC node provider URL |
| `LEDGER_CONTRACT_ADDRESS` | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | Deployed `WearTrailCommitmentStore` contract address |
| `TEST_DEVICE_ID` | `11111111-1111-4111-a111-111111111111` | UUID of the simulated factory RFID reader bridge |
| `TEST_DEVICE_SECRET` | `wt_dev_secret_simulation_key_2026` | Pre-shared Bearer secret for hardware simulator |
| `INITIAL_ADMIN_PASSWORD` | `weartrail123!` | Standard password for all bootstrapped demo accounts |

---

## 3. Component Startup Sequence

Open separate terminal windows for each service and start them in the following order:

### Terminal 1: Local Blockchain Node
```bash
npm run blockchain:node
```
*Expected Output:* Hardhat node starts listening on `http://127.0.0.1:8545` with 20 pre-funded test accounts on Chain ID `31337`.

> [!NOTE]
> If you have reset the Hardhat node, deploy and register the contract once:
> ```bash
> npm run blockchain:deploy:local
> npm run blockchain:register
> ```

### Terminal 2: Database Connectivity & Seeding
Verify database reachability and bootstrap all 10 factory test roles and the RFID simulation bridge:
```bash
# 1. Verify PostgreSQL connection (must report 59 tables in supplyease)
npm run db:check

# 2. Provision all standard department staff accounts
npm run bootstrap:staff

# 3. Arm simulation device, station mappings, and operator sessions
npm run bootstrap:simulator
```

### Terminal 3: Express API Server
```bash
npm run server:start
```
*Expected Output:*
```text
==================================================
 WearTrail Express API Server running on port 4000
 Environment: development
==================================================
```

### Terminal 4: Ledger Outbox Worker
```bash
npm run ledger:worker
```
*Expected Output:*
```text
[CONNECTED] Connected to blockchain network with Chain ID: 31337
[READY] Verified contract deployment and bytecode.
Starting worker polling loop.
```

### Terminal 5: Vite Web Frontend
```bash
npm run dev
```
*Expected Output:* Vite dev server available at `http://localhost:8080/`.

---

## 4. Test Accounts & Station Access Matrix

All test accounts share the standard prototype password: **`weartrail123!`**.  
On the login screen (`http://localhost:8080/staff/login`), you can click **"Demo: admin.demo"** to autofill credentials instantly.

| Username | Department | Domain Role | Permitted Stations / Actions |
| :--- | :--- | :--- | :--- |
| `admin.demo` | Receiving (Global) | **A** (Admin) | Global access, user management, device settings, full audit trail |
| `manager.demo` | All | **M** (Manager) | Cross-department operations oversight, reporting, order approval |
| `receiving.demo` | `receiving` | **O** (Materials) | Fabric roll receiving (`fabric_receiving`), raw stock movements |
| `rawstore.demo` | `raw_store` | **O** (Materials) | Fabric roll issue (`fabric_issue`) to cutting |
| `cutting.demo` | `cutting` | **P** (Production) | Cutting table source selection, garment RFID tag enrollment |
| `stitching.demo` | `stitching` | **P** (Production) | Sewing line routine production scans |
| `finishing.demo` | `finishing` | **P** (Production) | Garment assembly completion and care label tagging |
| `qc.demo` | `quality` | **Q** (Quality) | Quality inspection, defect grading, rework case assignment |
| `packing.demo` | `packing` | **L** (Logistics) | Garment folding, box packaging, package aggregation |
| `warehouse.demo` | `warehouse` | **L** (Logistics) | Finished goods inventory receiving, bin location storage |
| `dispatch.demo` | `dispatch` | **L** (Logistics) | Sales order picking, courier handover, bill of lading generation |

---

## 5. Hardware RFID Simulator Usage

The hardware simulator script (`scripts/simulate-scan.ts`) sends ISO/IEC 14443 compliant envelopes to `POST /api/rfid/scan`, exercising real device authentication, antenna mapping, and transactional domain handlers.

### Basic Command Syntax
```bash
npx tsx scripts/simulate-scan.ts --station=<station_code> --uid=<rfid_uid>
```

### Supported Tag Formats
- **4-byte UID (8 hex chars):** `04A1B2C3`
- **7-byte UID (14 hex chars):** `04A1B2C3D4E5F6`
- **10-byte UID (20 hex chars):** `04A1B2C3D4E5F6070809`

### Station Reader Mapping Quick-Reference
| Station Code | Antenna Index | Handled Entity | Required Prerequisite |
| :--- | :---: | :--- | :--- |
| `fabric_receiving` | `0` | Material Lot Card | Lot record exists in database |
| `fabric_issue` | `1` | Material Lot Card | Lot has available inventory |
| `cutting` | `2` | Garment Tag | Action context or cutting order |
| `stitching` | `3` | Garment Tag | Tag bound to garment in Cutting |
| `finishing` | `4` | Garment Tag | Stitching scan completed |
| `final_qc` | `5` | Garment Tag | Armed inspection action context |
| `packing` | `6` | Garment Tag | QA disposition is `PASS` or released |
| `warehouse` | `7` | Package Tag | Package sealed at packing |
| `dispatch` | `8` | Package Tag | Package in warehouse inventory |

---

## 6. End-to-End Walkthrough: Happy Path (Receiving to Dispatch)

Follow this end-to-end flow to manufacture a garment and publish its cryptographic proof.

### Phase 1: Fabric Roll Receiving & Stock Ingestion
1. Open browser to `http://localhost:8080/staff/login` and sign in as `receiving.demo` (`weartrail123!`).
2. Navigate to **Material Lots** (`/staff/material-lots`).
3. Click **"Receive New Lot"** and fill in:
   - **Supplier:** Select active supplier (e.g. *Organic Cotton Mills*)
   - **Material Type:** Cotton Twill
   - **Quantity:** 500 meters
   - **Roll Card UID:** `04E01122334455`
4. Submit the form. The lot appears in status `received`.
5. Simulate the physical reader dock scan:
   ```bash
   npx tsx scripts/simulate-scan.ts --station=fabric_receiving --uid=04E01122334455
   ```
   *Expected Result:* `Scan Result: COMPLETED (accepted: true, stationCode: "fabric_receiving")`.

---

### Phase 2: Production Order & Fabric Issue
1. Sign in as `manager.demo` and navigate to **Production Orders** (`/staff/production-orders`).
2. Click **"New Order"** and create:
   - **Product Specification:** Denim Jacket (Spec v1)
   - **Target Units:** 50
   - **Target Completion Date:** 7 days out
3. Click **"Approve Order"** to move it to `released`.
4. Switch to `rawstore.demo`. Under **Material Lots**, issue 120 meters of Lot `04E01122334455` to the approved Production Order.
5. Simulate fabric issue scan:
   ```bash
   npx tsx scripts/simulate-scan.ts --station=fabric_issue --uid=04E01122334455
   ```
   *Expected Result:* Stock deducted; Cutting department notified of allocated rolls.

---

### Phase 3: Cutting & Garment Tag Enrollment
1. Sign in as `cutting.demo`. Open **Workstation** (`/staff/workstation`).
2. Select the Cutting table. Associate a new blank RFID card `04A1B2C3D4E5F6` with Garment Unit `WT-GARMENT-001`.
3. Simulate Cutting completion scan:
   ```bash
   npx tsx scripts/simulate-scan.ts --station=cutting --uid=04A1B2C3D4E5F6
   ```
   *Expected Result:* Tag binding confirmed; Garment enters `cut` state; Trace event generated.

---

### Phase 4: Assembly Line (Stitching & Finishing)
1. Simulate stitching line pass:
   ```bash
   npx tsx scripts/simulate-scan.ts --station=stitching --uid=04A1B2C3D4E5F6
   ```
   *Expected Result:* Garment status advances to `stitched`.
2. Simulate finishing & care label station pass:
   ```bash
   npx tsx scripts/simulate-scan.ts --station=finishing --uid=04A1B2C3D4E5F6
   ```
   *Expected Result:* Garment status advances to `finished`. Ready for Quality Control.

---

### Phase 5: Final Quality Control Gate
1. Sign in as `qc.demo`. Navigate to **Quality Control** (`/staff/quality`).
2. Click **"Arm Inspection Station"** for Garment `WT-GARMENT-001`.
   - Inspection criteria: Dimension check $\rightarrow$ Pass, Stitch tension $\rightarrow$ Pass, Color consistency $\rightarrow$ Pass.
   - Selected Disposition: **PASS**.
   - Note the generated `Action Context ID` (or copy from the screen).
3. Simulate the physical QA gate scan with the action context:
   ```bash
   npx tsx scripts/simulate-scan.ts --station=final_qc --uid=04A1B2C3D4E5F6 --action-context=<COPIED_ACTION_CONTEXT_ID>
   ```
   *Expected Result:* Quality disposition recorded as `accepted`. Hold status remains clear (`false`).

---

### Phase 6: Packaging & Aggregation
1. Sign in as `packing.demo`. Navigate to **Fulfilment** (`/staff/fulfilment`).
2. Create Box Package `PKG-2026-001` with package tag `04C1C2C3C4C5C6`.
3. Simulate packaging scan:
   ```bash
   npx tsx scripts/simulate-scan.ts --station=packing --uid=04A1B2C3D4E5F6
   ```
   *Expected Result:* Garment `WT-GARMENT-001` is packed into `PKG-2026-001`. Status advances to `packed`.

---

### Phase 7: Warehouse & Dispatch
1. Simulate warehouse receiving of the box:
   ```bash
   npx tsx scripts/simulate-scan.ts --station=warehouse --uid=04C1C2C3C4C5C6
   ```
2. Sign in as `dispatch.demo`. Navigate to **Shipments** (`/staff/shipments`).
3. Assign `PKG-2026-001` to Outbound Shipment `SHP-001` (Carrier: DHL Express).
4. Simulate final dispatch dock scan:
   ```bash
   npx tsx scripts/simulate-scan.ts --station=dispatch --uid=04C1C2C3C4C5C6
   ```
   *Expected Result:* Garment status is `dispatched`. Public payload version is finalized and queued for blockchain anchoring.

---

## 7. Failure & Edge-Case Testing Scenarios

Run these test cases to verify the system's defensive guards, database constraints, and integrity rules.

### Test Case F1: Scan Unbound / Unknown Card
**Procedure:** Scan a random, unregistered RFID tag at the stitching station:
```bash
npx tsx scripts/simulate-scan.ts --station=stitching --uid=04F9E8D7C6B5A4
```
*Expected Result:*
- HTTP Status: `400 Bad Request`
- Error Code: `WT_ERR_UNKNOWN_CARD`
- Message: `Card 04F9E8D7C6B5A4 is not actively bound to a garment.`
- Database Verification: A rejection record is inserted in `supplyease.rfid_scans` with `outcome = 'rejected'` without mutating any garment state.

---

### Test Case F2: Duplicate Scan Idempotency
**Procedure:** Send the identical scan envelope twice in rapid succession:
```bash
# First scan
npx tsx scripts/simulate-scan.ts --station=stitching --uid=04A1B2C3D4E5F6

# Second scan (same tag and parameters)
npx tsx scripts/simulate-scan.ts --station=stitching --uid=04A1B2C3D4E5F6
```
*Expected Result:*
- The second scan responds with `HTTP 200 OK`.
- `outcome.details.idempotent: true`.
- No duplicate audit events or double-increments are recorded in `supplyease.trace_events`.

---

### Test Case F3: QA Defect & Hold Gate
**Procedure:**
1. In the QA panel, select a garment and report a major seam defect: Disposition **FAIL_REWORK**.
2. Submit the inspection.
*Expected Result:*
- Garment `quality_disposition` is set to `failed`.
- A hold record is opened in `supplyease.garment_holds` (`kind = 'quality'`).
- A rework task is added to `/staff/rework`.

---

### Test Case F4: Packaging Gate Blocks Defective / Held Garments
**Procedure:**
Attempt to pack the defective garment into a box before it is repaired and released:
```bash
npx tsx scripts/simulate-scan.ts --station=packing --uid=<DEFECTIVE_GARMENT_TAG>
```
*Expected Result:*
- HTTP Status: `400 Bad Request`
- Error Code: `WT_ERR_HOLD_ACTIVE` or `WT_ERR_QUALITY_DISPOSITION`
- Message: `Garment has an active hold or has not passed final QA.`
- The garment is strictly blocked from packaging.

---

### Test Case F5: Independent Re-inspection Enforcement
**Procedure:**
1. Have technician `stitching.demo` repair the garment and log the repair in `/staff/rework`.
2. Attempt to approve and release the hold using `stitching.demo`'s account.
*Expected Result:*
- API rejects with `403 Forbidden` (`WT_ERR_INDEPENDENT_QC`).
- Message: *The technician who performed the repair cannot inspect and release their own work.*
3. Switch account to `qc.demo` (independent certified inspector) and approve the re-inspection.
- Release succeeds, hold is cleared (`released_at` populated), and garment becomes eligible for packaging.

---

## 8. Verifying the Blockchain Ledger Outbox

### Step 1: Inspect Queued Commitments in Database
Open a terminal or PostgreSQL client and query the outbox queue:
```sql
SELECT id, commitment_id, payload_sha256, status, retry_count 
FROM supplyease.ledger_outbox 
ORDER BY created_at DESC LIMIT 5;
```
- Status begins as `pending` with lease fields `NULL`.

### Step 2: Observe Worker Batch Processing
In the Terminal running `npm run ledger:worker`, observe:
```text
[WORKER] Leased 1 commitment jobs. Batch lease token: b6a9...
[BROADCAST] Submitting commitment 0x4e2a... to contract 0x5FbDB...
[CONFIRMED] Transaction included in block #14! Receipt status: 1
[RECONCILED] Commitment recorded on-chain. Outbox updated to 'confirmed'.
```

### Step 3: Verify Idempotent Blockchain Re-submission
If the worker restarts during a broadcast, it re-queries the smart contract. The contract checks `hasCommitment(id)`:
- Identical ID + identical hash: contract returns cleanly without revert.
- Matching existing on-chain data: worker reconciles job as `confirmed`.

---

## 9. Verifying Public Provenance & Privacy Rules

### Public Journey View
1. Open your browser to: `http://localhost:8080/p/WT-DEMO-001`
2. **Verify Public Allowlist:**
   - [x] Product name, style, and organic materials list are visible.
   - [x] High-level milestone journey (e.g. *Fabric Received*, *Assembly Completed*, *Quality Inspected*, *Shipped*) is displayed.
   - [ ] **STRICT PRIVACY CHECK:** Ensure **NO** internal staff names (e.g. *Alice Operator*), staff UUIDs, internal rejection codes, or defect descriptions appear in the DOM or API response (`/api/public/journey/WT-DEMO-001`).

### Cryptographic Technical Proof View
1. Navigate to: `http://localhost:8080/p/WT-DEMO-001/proof`
2. **Verify Cryptographic Elements:**
   - **Canonical Payload JSON:** Formatted according to RFC 8785 canonical sort order.
   - **Payload Hash:** Valid SHA-256 hex string matching the payload.
   - **Contract Address:** Displays `0x5FbDB2315678afecb367f032d93F642f64180aa3`.
   - **Notarization Status:**
     - If worker has anchored: Displays **"Confirmed On-Chain"** with block number and transaction hash.
     - If worker has not yet run: Truthfully displays **"Pending On-Chain Anchor"** (never a simulated or fake confirmation).

---

## 10. Worker Interruption & Recovery Procedure

To verify worker resilience against sudden crashes or power loss:

1. Stop the worker process in Terminal 4 with `Ctrl+C` while jobs are pending.
2. Note that pending jobs in `supplyease.ledger_outbox` retain their lease expiration timestamp (`leased_until`).
3. Wait 60 seconds (lease duration expiry).
4. Restart the worker:
   ```bash
   npm run ledger:worker
   ```
5. **Expected Result:** The worker automatically reclaims expired leases, re-evaluates pending transactions, and resumes broadcasting without losing state or skipping records.

---

## 11. Known Limitations & Notes for Manual QA

1. **Local Hardhat Network Reset:** If you restart `npm run blockchain:node`, memory is cleared. Always run `npm run blockchain:deploy:local` followed by `npm run blockchain:register` after restarting the Hardhat node to ensure the registered deployment in Supabase matches the fresh chain.
2. **Hardware Serial Reader:** When testing with physical USB hardware readers, configure the bridge daemon with `TEST_DEVICE_SECRET` in `.env.bridge` to match the provisioned simulation bridge.
3. **Session Expiry:** Bootstrapped workstation sessions expire after 48 hours. If scan simulator returns `WT_ERR_NO_OPERATOR_SESSION`, simply re-run `npm run bootstrap:simulator` to refresh operator leases.

---

## 12. Verification Checklist Before Release

- [ ] `npm test`: 15/15 test files passing (177 tests).
- [ ] `npm --prefix packages/blockchain run test`: 22/22 contract tests passing.
- [ ] `npx tsc --noEmit`: 0 TypeScript compilation errors.
- [ ] `npm run build`: Nitro / Vite production client and server bundles build cleanly.
- [ ] `npm run db:check`: 59 tables verified in `supplyease`.
- [ ] All 10 test role logins verified via web UI.
- [ ] Simulated scan execution verified across all 9 factory stations.
- [ ] Ledger outbox worker confirmed submitting to Hardhat node.
- [ ] Public customer journey and cryptographic proof verified for privacy and truthfulness.
