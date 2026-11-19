# WearTrail

**Follow the journey behind what you wear.**

WearTrail traces individual garments through factory operations and gives shoppers a public product journey.
This repository is the **frontend scaffold** built on the Lovable TanStack Start starter: 26 routes, a shared staff
workspace, two anonymous product pages and a connected mock demo. All data is synthetic.

---

## Prototype Evolution: Nine-Reader RFID Architecture

This version upgrades WearTrail from the earlier 6-IR proximity presence prototype to a **nine-reader RFID prototype**.
Physical RFID cards identify physical fabric bundles and individual cut garments directly.
Physical stage, quality disposition, and ledger state remain strictly separate fields. A scan supplies identity and station evidence; staff selections supply decisions, quantities, and planning information.

### Station Topology & Checkpoint Mapping

| Pos | Station Name             | Stable Station Code | Sensor / Checkpoint ID | Department  | Scope / Responsibility                                                                                              |
| --- | ------------------------ | ------------------- | ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Fabric Receiving         | `fabric_receiving`  | `S1`                   | `receiving` | Binds fresh RFID card to received fabric lot (`assign_bundle_card`).                                                |
| 2   | Fabric Issue             | `fabric_issue`      | `RAW_ISSUE`            | `raw-store` | Selects approved order + qty, scans bundle card to issue fabric (`confirm_issue`).                                  |
| 3   | Cutting & Tag Assignment | `cutting`           | `S2`                   | `cutting`   | Confirms fabric source by bundle scan, then assigns fresh cards for each cut garment (`bind_garment_tag`).          |
| 4   | Stitching                | `stitching`         | `S3`                   | `stitching` | Routine scan advances garment stage without per-shirt form (`routineScan`).                                         |
| 5   | Finishing                | `finishing`         | `S4`                   | `finishing` | Routine scan advances garment stage without per-shirt form (`routineScan`).                                         |
| 6   | Final Quality Check      | `final_qc`          | `FINAL_QC`             | `quality`   | Inspector selects Pass/Fail + checklist, then scans garment card; identity is resolved automatically (`submit_qc`). |
| 7   | Packing                  | `packing`           | `S5`                   | `packing`   | Selects open package, scans garment card; verifies QC and stage before packing (`pack_garment`).                    |
| 8   | Finished Goods Warehouse | `warehouse`         | `WAREHOUSE`            | `warehouse` | Selects storage bin, scans garment card; confirms receipt into warehouse (`warehouse_receive`).                     |
| 9   | Dispatch                 | `dispatch`          | `S6`                   | `dispatch`  | Selects approved manifest, scans garments; departure confirmed only when all checks pass (`dispatch_garment`).      |

---

## Action Context & RFID Scan Lifecycle

For actions requiring staff input (Receiving, Issue, Cutting, QA, Logistics), WearTrail implements a strict 5-stage lifecycle:

```
[Staff Selection / Input]
         │
         ▼
[Prepare Action Context] ──► status: "awaiting_ack" (UUID generated, payload immutable)
         │
         ▼
[Reader Board Acknowledges] ──► status: "ready" (Reader LED armed, awaiting physical tag tap)
         │
         ▼
[Physical Tag Presented / Scanned] ──► status: "processing" (Tag UID read via USB serial)
         │
         ▼
[Backend Resolution & Dispatch] ──► status: "confirmed" OR "rejected" (One-use context consumed)
```

### Key Domain & Workflow Rules

1. **Context Immutability & One-Use Consumption:** A context is a server/mock-adapter-generated UUID with an immutable payload and expiry. A confirmed scan consumes it once. Changing a decision cancels the old context and creates a fresh one.
2. **QA Without Preselecting Garments:** Inspectors physically evaluate the shirt, select Pass or Fail, fill the checklist, and prepare the decision. The subsequent card scan identifies the garment automatically and attaches the pending result.
3. **Cutting Fabric Source Retention:** The operator selects an approved order and issued fabric lot, then scans the bundle card to confirm the source. This confirmed source remains active across multiple garment tag assignments until explicitly changed or cancelled.
4. **Routine Production (Stitching & Finishing):** Operates under an authorized reader session without requiring a per-shirt form. The card scan identifies the garment, validates expected stage, and advances the garment.
5. **Durable Scan Feedback:** Feedback is persistently rendered in the station shell and station panels (including rejection reasons such as active hold, wrong stage, duplicate card, or over-allocation), not merely in transient toasts.

---

## Seed Scenario: Coherent Multi-Order Fabric Allocation

The mock state initializes with version `DEMO_STATE_VERSION = 5` and a realistic multi-order fabric allocation:

- **Fabric Bundle `FAB-001`:** 20 m of accepted _Cotton poplin_, assigned RFID card `04A1B2C3`.
- **Production Order `ORDER-001` (Classic Poplin Shirt, planned qty 4):** Issued 8 m (`ISS-001`).
- **Production Order `ORDER-002` (Cotton Trouser, planned qty 2):** Issued 6 m (`ISS-002`).
- **Remaining Stock:** `20 m - 8 m - 6 m = 6 m` available balance.
- **Garments:**
  - `SHIRT-001`: Cut from `ISS-001`, assembled, QC passed, and dispatched (public demo). Card: `04A7B8C9`.
  - `SHIRT-002`: Cut from `ISS-001`, assembled, awaiting Final QC. Card: `04DAEBFC`.
  - `TROUSER-001`: Cut from `ISS-002`, currently in Finishing. Card: `04001122`.

---

## Commands & Verification

```bash
npm install              # install dependencies
npm run build            # production build with Vite + Nitro (client & server)
npm run test             # vitest (12 unit and end-to-end integration tests)
npm run lint             # eslint validation across codebase
npm run format           # prettier formatting
npm run dev              # local dev server on http://localhost:8080
npm run db:check         # test database connectivity using DATABASE_URL in .env
npm run db:validate      # validate prisma schema and config
npm run db:generate      # generate prisma client (no DB credentials required)
npm run db:pull          # introspect Supabase supplyease schema (requires MIGRATION_DATABASE_URL)
```

### Verification Checks Performed

- **TypeScript (`tsc --noEmit`):** Passed with 0 errors across all feature views, domain types, client adapters, server database modules, and mock engine.
- **Unit & Workflow Tests (`vitest run`):** 12 tests passed (including access rules, SHIRT-002 lifecycle, station-by-station RFID validation, over-allocation prevention, and hold isolation).
- **ESLint (`eslint src`):** Passed with 0 errors.
- **Vite Production Build (`vite build`):** Client bundles and Nitro server workers built successfully with Prisma strictly isolated on the server.

---

## Database & Server-Only Prisma 7 Foundation

WearTrail uses **Prisma 7 (`7.10.1`)** with `@prisma/adapter-pg` driver adapter, configured to target the private **`supplyease`** PostgreSQL schema.

### Local Environment Configuration

1. Copy `.env.example` to `.env` (which is strictly ignored by Git):
   ```bash
   cp .env.example .env
   ```
2. Populate the connection strings in `.env`:
   - `DATABASE_URL`: Runtime connection string using the restricted `weartrail_api` role. On IPv4 networks (e.g. local Express server), use the Supabase Session Pooler on port **5432** (not transaction pooler 6543):
     ```env
     DATABASE_URL="postgresql://weartrail_api.[project-ref]:[password]@[pooler-host]:5432/postgres?schema=supplyease&sslmode=require"
     ```
   - `MIGRATION_DATABASE_URL`: Lead-only administrative connection string using `postgres` (database owner) for CLI introspection and migrations:
     ```env
     MIGRATION_DATABASE_URL="postgresql://postgres.[project-ref]:[password]@[pooler-host]:5432/postgres?schema=supplyease&sslmode=require"
     ```

### Provisioning the Restricted Runtime Role (`weartrail_api`)

If the restricted `weartrail_api` role has not yet been provisioned in your Supabase project:

1. Open your Supabase project $\rightarrow$ **SQL Editor**.
2. Run the role creation and permission grants:
   ```sql
   -- 1. Create restricted runtime login
   CREATE ROLE weartrail_api WITH LOGIN PASSWORD 'YOUR_STRONG_PASSWORD_HERE';

   -- 2. Grant schema usage and table privileges in supplyease
   GRANT USAGE ON SCHEMA supplyease TO weartrail_api;
   GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA supplyease TO weartrail_api;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA supplyease TO weartrail_api;
   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA supplyease TO weartrail_api;

   -- 3. Set default search path
   ALTER ROLE weartrail_api SET search_path TO supplyease, public;
   ```
3. Use the chosen password in `DATABASE_URL` in your ignored `.env`.

### Testing Connectivity

Run the non-destructive server-side connectivity check:

```bash
npm run db:check
```

This queries session metadata and counts tables in `supplyease` without reading business records or printing connection credentials.

---

## Integration Seams & Backend Architecture

The frontend is completely decoupled from database credentials, firmware, and USB hardware:

1. **Data Boundary (`WearTrailClient` in `src/lib/data/client.ts`):**
   - All feature views interact exclusively through the typed `WearTrailClient` interface.
   - `getRfidStationData(stationCode)`: Returns reader session, active action context, cutting source selection, and last scan outcome.
   - `prepareActionContext(stationCode, kind, payload)`: Prepares an immutable action context.
   - `acknowledgeContext(contextId)`: Transitions context from `awaiting_ack` to `ready`.
   - `cancelContext(contextId)`: Safely cancels a pending context.
   - `resolveRfidScan(uid)`: Resolves an RFID scan against the active context.
   - `routineScan(uid, stationCode)`: Performs routine garment stage advancement.
2. **Mock vs. Express Client:**
   - In prototype mode, `createMockClient()` (`src/mock/mock-client.ts`) runs purely in-browser state with localStorage persistence.
   - For backend integration, implement `WearTrailClient` using `fetch()` endpoints pointing to the Express server (`POST /rfid/contexts`, `PUT /rfid/contexts/:id/ack`, `POST /rfid/scan`, etc.).
3. **USB Serial Hardware Bridge:**
   - In production, the physical ESP32 reader hub connects via USB serial to the host running the Express backend.
   - The Express server authenticates device credentials, broadcasts real-time tag tap events over Server-Sent Events (SSE), and maps measured reader indices (bench verified) to logical station codes.
   - In the frontend mock, bridge health is explicitly displayed as **Disconnected (Simulated)** to clearly differentiate synthetic emulation from live hardware.

---

## Four-Member Antigravity Handoff Boundaries

1. **Member 1: Hardware & USB Bridge:**
   - Owns firmware reader indices on the 9-reader hub, serial protocol formatting (JSON lines over USB), and physical calibration against `src/domain/types.ts` `RfidStationMapping`.
2. **Member 2: Express API & Server-Sent Events (SSE):**
   - Implements REST endpoints corresponding to `WearTrailClient`, manages PostgreSQL transactions conforming to `WearTrail_Complete_Schema.sql`, and broadcasts serial reader events to connected clients.
3. **Member 3: Frontend Feature Views & Workstation Shell (Completed):**
   - Refactored `WorkstationView` with shared `StationShell` and dedicated feature panels (`ReceivingPanel`, `IssuePanel`, `CuttingPanel`, `RoutinePanel`, `QAPanel`, `LogisticsPanel`).
   - Integrated RFID card metadata into Materials, Orders, Garments, Quality, and Settings views.
4. **Member 4: Shopper Journey & Ledger Proofs:**
   - Maintains shopper-facing projection in `src/mock/projection.ts` and `/p/:publicId` views, ensuring internal defect notes and factory secrets are strictly excluded from public display.
