# WearTrail Minimal Ledger Prerequisites & Transactional Commitment Handoff

**Author:** Member 1 (Platform & Integration Lead)  
**Branch:** `backend/live`  
**Target Audience:** Member 4 (Staff Access, Public Verification & Ledger Sync), Member 2 & 3 (Domain Event Emitters)  
**Status:** Contract Deployment Verified in Database, Transactional Commitment Helpers Implemented, 94 Unit Tests Passing, 22 Blockchain Tests Passing  

---

## 1. Executive Summary

Member 1 has delivered the minimal ledger prerequisites for real factory transactions on the `backend/live` branch:
1. **Verified Deployment in PostgreSQL Database:**
   - Confirmed active deployment in PostgreSQL table `supplyease.ledger_deployments`.
   - Contract Address: `0x5FbDB2315678afecb367f032d93F642f64180aa3` on Chain ID `31337` (Local Hardhat Node).
   - Deployed code, deployment transaction receipt (`0x1c094d99ba4fa2e1f19944fb3f219269866ec39ca09abab50f358e8ef69a7819`), and protocol version `1` verified.
2. **Deterministic Commitment ID Calculation:**
   - Implemented `computeCommitmentId(scope, deploymentId, entityId)` producing deterministic 32-byte hexadecimal strings (0x-prefixed, 64 hex chars) matching `bytes32` in `WearTrailCommitmentStore.sol`.
3. **Transaction-Scoped Internal Commitment Helper (`createInternalCommitment`):**
   - Implements approved scheme `sha256_nonce_v1`.
   - Uses private, unpredictable 32-byte cryptographically secure nonce: `crypto.randomBytes(32)`.
   - Produces versioned canonical UTF-8 JSON bytes: `toCanonicalJson(payload)`.
   - Payload hash: `SHA256(nonce || canonicalBytes)`.
   - Atomic persistence to `supplyease.ledger_commitments` and `supplyease.ledger_outbox` using the caller's `PrismaTransactionClient`.
   - Enforces PostgreSQL check constraint `ledger_commitment_hash_scheme` and trigger `protect_new_private_commitment`.
   - Idempotent on identical retry; raises `409 WT_ERR_COMMITMENT_CONFLICT` if the same commitment ID is submitted with conflicting payload.
4. **Transaction-Scoped Public Commitment Helper (`createPublicCommitment`):**
   - Accepts Member 4's exact public payload version ID and SHA-256 hash.
   - Strictly enforces evidence separation: `internal_nonce` is `NULL` and `internal_payload_bytes` is `NULL`, scheme is `'sha256'`.
   - Atomically enqueues pending entry in `supplyease.ledger_outbox`.
   - Idempotent on identical retry; raises `409 WT_ERR_COMMITMENT_CONFLICT` on conflicting payload hash.
5. **No In-Transaction Blockchain RPCs:**
   - Zero RPC calls are made inside PostgreSQL transactions.
   - Network partitions or chain halts leave commitments cleanly enqueued as `'pending'` in `ledger_outbox` for the background worker to lease and broadcast.
6. **Isolated Verification Suite:**
   - 12 comprehensive unit tests in `src/test/ledger-commitments.test.ts` verifying deployment lookup, internal commitments, public commitments, separation of evidence, identical retries, conflicting payload rejection, and outbox service interface.

---

## 2. Verified Development Deployment in Database

The PostgreSQL table `supplyease.ledger_deployments` stores verified contract instances.

### Current Database Record
- **Deployment ID (`id`):** `7c41dac6-1687-4608-a9ce-bee3c57179f3`
- **Deployment Code (`code`):** `local-hardhat-20261119150320-1c094d99`
- **Chain ID (`chain_id`):** `31337`
- **Contract Address (`contract_address`):** `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- **Transaction Hash (`deployment_tx_hash`):** `0x1c094d99ba4fa2e1f19944fb3f219269866ec39ca09abab50f358e8ef69a7819`
- **Protocol Version (`protocol_version`):** `1`
- **Created At:** `2026-11-19T10:03:20.730Z`

### Deployment Tooling & Registration Command
If a local chain reset occurs or when deploying to testnet/production:
```bash
# 1. Compile and test the smart contract
npm run blockchain:test

# 2. Deploy contract to local Hardhat node or Sepolia testnet
npm --prefix packages/blockchain run deploy:local

# 3. Register the deployment into PostgreSQL supplyease.ledger_deployments
npm --prefix packages/blockchain run register:deployment
```
The registration script validates:
- Chain ID matches the active RPC network.
- `eth_getCode(contractAddress)` contains valid bytecode (not an EOA).
- `eth_getTransactionReceipt(txHash)` confirms successful deployment.
- Inserts new record into `supplyease.ledger_deployments`.

---

## 3. Architecture & Commitment Schemes

### PostgreSQL Check Constraint & Trigger Compliance

The live database enforces constraint `ledger_commitment_hash_scheme`:
- **When `trace_event_id IS NOT NULL` (Internal Factory Commitment):**
  - `hash_scheme` MUST be `'sha256_nonce_v1'`.
  - `internal_nonce` MUST be exactly 32 bytes (`bytea`).
  - `internal_payload_bytes` MUST NOT be `NULL`.
  - Trigger `ledger_commitments_require_private_nonce` verifies:
    $$\text{payload\_sha256} = \text{SHA256}(\text{internal\_nonce} \parallel \text{internal\_payload\_bytes})$$
  - `public_payload_id` MUST be `NULL`.
- **When `public_payload_id IS NOT NULL` (Public Verification Commitment):**
  - `hash_scheme` MUST be `'sha256'`.
  - `internal_nonce` MUST be `NULL`.
  - `internal_payload_bytes` MUST be `NULL`.
  - `trace_event_id` MUST be `NULL`.
  - Foreign key `(public_payload_id, payload_sha256)` references `public_payload_versions(id, payload_sha256)`.

### Deterministic Commitment ID Formula
The on-chain `WearTrailCommitmentStore.sol` accepts `bytes32 commitmentId`.
To ensure deterministic, deduplicated, and collision-resistant commitment IDs across all events:
$$\text{commitmentId} = \text{SHA256}(\text{scope} \parallel \text{":"} \parallel \text{deploymentId} \parallel \text{":"} \parallel \text{entityId})$$
Formatted as a 32-byte hex string prefixed with `0x`.

---

## 4. Helper API Reference & Imports

All helpers are exported from `src/server/index.ts` and `src/server/ledger/index.ts`.

### Exact Imports
```ts
import {
  createInternalCommitment,
  createPublicCommitment,
  computeCommitmentId,
  getActiveLedgerDeployment,
  ledgerOutboxService,
  type CreateInternalCommitmentInput,
  type CreatePublicCommitmentInput,
  type InternalCommitmentResult,
  type PublicCommitmentResult,
  type ActiveDeploymentInfo,
} from '@/server';
// Alternatively from '@/server/ledger'
```

### A. `createInternalCommitment`

Creates a private internal commitment and enqueues an outbox record within an existing database transaction.

```ts
const result = await runInTransaction(async (tx) => {
  // 1. Perform domain mutations (e.g. cutting enrollment, QA inspection)
  // ...

  // 2. Persist internal commitment atomically
  const commitment = await createInternalCommitment({
    traceEventId: event.id,
    scope: 'trace_event',
    entityId: event.id,
    payload: {
      version: 1,
      eventType: 'cutting_bundle_enrolled',
      garmentId: garment.id,
      stationId: station.id,
      timestamp: event.createdAt,
    },
    // Optional deploymentId override (defaults to active deployment)
  }, tx);

  return { garment, commitment };
});
```

#### Parameters: `CreateInternalCommitmentInput`
| Parameter | Type | Required | Description |
|---|---|---|---|
| `traceEventId` | `string` (UUID) | Yes | Foreign key to `supplyease.trace_events.id`. |
| `scope` | `string` | Yes | Scope prefix (e.g. `'trace_event'`, `'garment'`). |
| `entityId` | `string` | Yes | Entity UUID for deterministic commitment ID. |
| `payload` | `Record<string, unknown>` | Yes | Payload object to serialize canonically. |
| `deploymentId` | `string` (UUID) | No | Target ledger deployment ID (defaults to active deployment). |

#### Returns: `Promise<InternalCommitmentResult>`
```ts
interface InternalCommitmentResult {
  commitmentId: string;       // bytes32 hex string with 0x prefix
  commitmentDbId: string;     // UUID primary key in ledger_commitments
  outboxId: string;           // UUID in ledger_outbox
  payloadSha256: string;      // 32-byte SHA-256 hash
  nonceHex: string;           // 32-byte secret hex string
  canonicalBytes: Uint8Array; // Versioned canonical UTF-8 bytes
  isNew: boolean;             // false if identical retry succeeded idempotently
}
```

---

### B. `createPublicCommitment`

Creates a public customer verification commitment and enqueues an outbox record within an existing database transaction.

```ts
const result = await runInTransaction(async (tx) => {
  // 1. Member 4 creates or resolves public payload version in DB
  // ...

  // 2. Persist public commitment atomically
  const commitment = await createPublicCommitment({
    publicPayloadId: publicVersion.id,
    scope: 'public_payload',
    entityId: publicVersion.id,
    payloadSha256: publicVersion.payload_sha256, // Must be 32-byte hex hash
  }, tx);

  return commitment;
});
```

#### Parameters: `CreatePublicCommitmentInput`
| Parameter | Type | Required | Description |
|---|---|---|---|
| `publicPayloadId` | `string` (UUID) | Yes | Foreign key to `supplyease.public_payload_versions.id`. |
| `scope` | `string` | Yes | Scope prefix (e.g. `'public_payload'`). |
| `entityId` | `string` | Yes | Entity UUID for deterministic commitment ID. |
| `payloadSha256` | `string` | Yes | 32-byte SHA-256 hash of canonical public payload. |
| `deploymentId` | `string` (UUID) | No | Target ledger deployment ID (defaults to active deployment). |

#### Returns: `Promise<PublicCommitmentResult>`
```ts
interface PublicCommitmentResult {
  commitmentId: string;       // bytes32 hex string with 0x prefix
  commitmentDbId: string;     // UUID primary key in ledger_commitments
  outboxId: string;           // UUID in ledger_outbox
  payloadSha256: string;      // 32-byte SHA-256 hash
  isNew: boolean;             // false if identical retry succeeded idempotently
}
```

---

### C. `ledgerOutboxService` (`ILedgerOutboxService`)

Standard service singleton for queuing commitments through the outbox interface.

```ts
await ledgerOutboxService.queueCommitment(
  {
    commitmentId: '0xabc...64chars',
    commitmentDbId: '11111111-1111-4111-a111-111111111111',
    deploymentId: '7c41dac6-1687-4608-a9ce-bee3c57179f3',
    payloadSha256: '0xdef...64chars',
    isPublic: false,
  },
  tx
);
```

---

## 5. Environment Variables & Configuration

The ledger subsystem relies on the following environment variables:

| Variable | Required | Description / Default |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase PostgreSQL transaction pooler URL (port 5432). |
| `LEDGER_DEPLOYMENT_ID` | Optional | Specific deployment UUID to bind commitments to. If omitted, uses `LEDGER_DEPLOYMENT_CODE` or the latest registered deployment. |
| `LEDGER_DEPLOYMENT_CODE` | Optional | Identifier code (e.g. `local-hardhat-20261119150320-1c094d99`). |
| `BLOCKCHAIN_RPC_URL` | No (Worker only)| JSON-RPC endpoint (e.g. `http://127.0.0.1:8545`). Used by the outbox worker, **not** during factory transactions. |
| `BLOCKCHAIN_WRITER_PRIVATE_KEY`| No (Worker only)| EOA private key authorized as writer on `WearTrailCommitmentStore.sol`. |

---

## 6. Real Ledger Outbox Worker & Evidence Service (Member 1 Implementation)

Member 1 has delivered the production-ready outbox worker daemon and server-side evidence subsystem:

### A. Worker Daemon Implementation (`src/server/ledger/outbox-worker.ts`)
- **Durable Database-Backed Job Leasing:** Bounded batches (`batchSize: 10`, configurable) leased using atomic database transactions with lease tokens and expiration timestamps. Automatically recovers orphaned jobs after worker termination or restart.
- **Outside-Transaction Blockchain RPC:** All network calls to Ethereum RPC are performed outside PostgreSQL transactions. RPC outages leave work safely pending with exponential backoff without rolling back factory database mutations.
- **Privacy Enforcement:** Submits strictly opaque 32-byte commitment IDs and 32-byte payload SHA-256 hashes. Zero private nonces, internal defect notes, or worker identities are sent to the smart contract.
- **Signer Concurrency & Nonce Manager (`src/server/ledger/signer-nonce-manager.ts`):** Serializes transaction dispatches per signer account, prevents nonce collisions across concurrent operations, and resynchronizes with the pending transaction count upon network failure.
- **Uncertain Broadcast Reconciliation:** Checks `hasCommitment` and `getTransactionReceipt` on startup or crash recovery before resubmitting. Identical on-chain commitments succeed idempotently; conflicting hashes fail permanently with `WT_ERR_ONCHAIN_HASH_CONFLICT`.
- **Confirmation Policy:** Waits for configured block confirmations (default: 1). Only marks commitments confirmed when mined receipts succeed with `status === 1`.
- **Graceful Shutdown:** Handles `SIGINT` and `SIGTERM` signals, completing in-flight batches and safely releasing held leases.

### B. Daemon Startup Command & Environment Variables
Run the worker daemon:
```bash
# Start the outbox worker daemon
npm run ledger:worker
# Alternatively
npx tsx scripts/ledger-worker.ts
```

#### Required Environment Variables
| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | - | PostgreSQL connection URL with `supplyease` schema. |
| `LEDGER_RPC_URL` | Optional | `http://127.0.0.1:8545` | Ethereum JSON-RPC provider endpoint. |
| `LEDGER_SIGNER_KEY` | Optional | Local Hardhat #0 key | 0x-prefixed 32-byte private key for authorized writer. |
| `LEDGER_DEPLOYMENT_ID`| Optional | Latest in DB | Specific deployment UUID to bind commitments to. |
| `CONFIRMATION_BLOCKS` | Optional | `1` | Number of mined blocks required before confirming. |
| `WORKER_POLL_INTERVAL_MS`| Optional | `2000` | Polling interval in milliseconds. |
| `WORKER_BATCH_SIZE` | Optional | `10` | Maximum number of jobs leased per cycle. |
| `LEASE_DURATION_SECONDS` | Optional | `60` | Lease timeout duration in seconds before recovery. |

### C. Server-Side Evidence & Diagnostics Service (`src/server/ledger/evidence-service.ts`)
Exposes dedicated methods for operational monitoring and Member 4's consumer:
- `ledgerEvidenceService.getCommitmentEvidence(id, { allowPrivate })`: Full evidence for staff audit; strictly strips private fields unless explicitly permitted.
- `ledgerEvidenceService.getPublicJourneyEvidence(publicPayloadId)`: Dedicated public evidence lookup for Member 4's `/p/:publicId.proof` view. Strictly returns on-chain commitment ID, payload SHA-256, contract address, chain ID, transaction hash, block number, and confirmation timestamp. Zero private nonces or internal defect details are exposed.
- `ledgerEvidenceService.getLedgerDiagnostics()`: Aggregate outbox status counts (`pending`, `submitted`, `confirmed`, `failed`, `activeLeases`) for monitoring dashboards.

### D. Remaining Integration Dependencies
1. **Member 4 Public Proof View Integration:** Connect [src/features/public/PublicProofView.tsx](file:///C:/Users/mahme/Documents/supply chain project/WearTrail/src/features/public/PublicProofView.tsx) to query `ledgerEvidenceService.getPublicJourneyEvidence()` via Express endpoint or client method.
2. **Member 2 & 3 Domain Handlers:** Continue implementing domain handlers that invoke `createInternalCommitment` inside their transaction scope.
