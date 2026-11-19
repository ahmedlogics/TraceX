# WearTrail Blockchain Foundation (`@weartrail/blockchain`)

This isolated package implements the minimal local blockchain commitment anchor for WearTrail's supply chain provenance architecture (Milestone 4 Foundation).

---

## 1. Overview & Privacy Architecture

The smart contract `WearTrailCommitmentStore` acts as an append-only, tamper-evident cryptographic anchor on an EVM-compatible ledger (local Hardhat network in development).

### Privacy & Data Boundaries
To preserve commercial confidentiality and comply with system rules:
- **Zero Factory Details**: Worker identities, station internal codes, repair reasons, and internal notes are **never** passed to or stored on the contract.
- **Zero Garment/RFID Mappings**: Physical card UIDs (`rfid_tags.uid`) and internal database keys are decoupled from contract interactions.
- **Dual Hashing Alignment**:
  1. *Private Operational Commitments*: Anchored using `sha256_nonce_v1` (`SHA-256(secret_nonce || payload)`). The secret 32-byte nonce stays strictly inside the backend database.
  2. *Public Journey Commitments*: Anchored using standard `sha256` computed over canonical UTF-8 bytes of allowlisted customer journey projections.
- **Opaque Contract Storage**: The contract only accepts and stores:
  - `commitmentId`: 32-byte opaque identifier (`bytes32`, matching `ledger_commitments.commitment_id`).
  - `payloadHash`: 32-byte cryptographic hash (`bytes32`, matching `ledger_commitments.payload_sha256`).

---

## 2. Toolchain & Environment Verification

- **Node.js**: Verified on Node.js `v22.23.1` (requires `>=20.0.0`).
- **Hardhat**: Pinned to Hardhat `3.22.0` with `@nomicfoundation/hardhat-toolbox-mocha-ethers@4.0.0` and `@nomicfoundation/hardhat-ethers@4.2.2`.
- **Solidity**: Pinned to `0.8.34` (evm target: `osaka` / optimizer runs: 200).
- **TypeScript & Ethers**: Pinned to `ethers@6.17.0`, `typescript@6.0.3`, `chai@6.3.0`, `mocha@12.0.3`.

---

## 3. Smart Contract Specifications: `WearTrailCommitmentStore.sol`

### State & Access Control
- `owner`: Contract administrator / deployer address.
- `authorizedWriters`: Mapping allowing authorized backend workers (e.g. outbox daemons) to write commitments.
- `setAuthorizedWriter(address writer, bool authorized)`: Manage authorized writer keys (onlyOwner).
- `transferOwnership(address newOwner)`: Transfer administrative ownership (onlyOwner).

### Append-Only & Idempotency Rules
- `recordCommitment(bytes32 commitmentId, bytes32 payloadHash)`:
  - **New Record**: Stores hash, block number, block timestamp. Emits `CommitmentRecorded` event. Returns `true`.
  - **Identical Retry (Same ID + Same Hash)**: Succeeds cleanly without state mutation (idempotent no-op). Returns `false`.
  - **Conflicting Write (Same ID + Different Hash)**: Reverts immediately with `ConflictingCommitment(commitmentId, existingHash, submittedHash)`.
  - **Unauthorized Caller**: Reverts with `Unauthorized()`.
  - **Empty Inputs (`bytes32(0)`)**: Reverts with `EmptyCommitmentId()` or `EmptyPayloadHash()`.
- `recordCommitmentsBatch(bytes32[] commitmentIds, bytes32[] payloadHashes)`: Atomic batch execution enforcing the same rules.

### Retrieval Methods
- `hasCommitment(bytes32 commitmentId) external view returns (bool)`: Boolean check for existence.
- `getCommitment(bytes32 commitmentId) external view returns (bytes32 payloadHash, uint64 blockNumber, uint64 blockTimestamp)`: Returns stored hash and timestamp/block details; reverts with `CommitmentNotFound` if absent.
- `getCommitmentHash(bytes32 commitmentId) external view returns (bytes32)`: Returns stored payload hash; reverts with `CommitmentNotFound` if absent.

---

## 4. Exact Command Reference

All commands can be executed either from the project root or from `packages/blockchain/`.

### 4.1 Running Contract Tests (22 automated Mocha/Ethers tests)
From project root:
```bash
npm run blockchain:test
```
Or from `packages/blockchain`:
```bash
npm test
```

### 4.2 Starting Local Hardhat Node
From project root:
```bash
npm run blockchain:node
```
Or from `packages/blockchain`:
```bash
npm run node
```
This launches a persistent local JSON-RPC node at `http://127.0.0.1:8545/` (Chain ID: `31337`).

### 4.3 Deploying Contract to Running Local Node
From project root:
```bash
npm run blockchain:deploy:local
```
Or from `packages/blockchain`:
```bash
npm run deploy:local
```
The deployment script automatically:
1. Connects to `http://127.0.0.1:8545/` and deploys `WearTrailCommitmentStore`.
2. Verifies deployment receipt (status, contract address, deployment transaction hash, gas used).
3. Verifies deployed bytecode is non-empty on-chain.
4. Performs a live write/read round trip + idempotency check against the running node.
5. Saves genuine deployment metadata to `deployments/local-deployment-latest.json` and a timestamped file.
6. Outputs the explicit registration command and raw SQL for the lead.

### 4.4 Registering Deployment in Database (`ledger_deployments`)
From project root:
```bash
# Dry run (displays parameterized SQL and bytea literals without DB execution)
npm run blockchain:register -- --dry-run

# Live registration using DATABASE_URL or MIGRATION_DATABASE_URL from .env
npm run blockchain:register
```
Or from `packages/blockchain`:
```bash
npm run register:deployment -- --dry-run
npm run register:deployment
```

---

## 5. Handling Chain Resets & Database Schema Alignment

### Database Schema Compatibility
The database schema (`supplyease.ledger_deployments`) enforces:
```sql
CREATE TABLE supplyease.ledger_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  chain_id numeric(78, 0) NOT NULL CHECK (chain_id > 0),
  network_name text NOT NULL,
  contract_address bytea NOT NULL CHECK (octet_length(contract_address) = 20),
  deployment_tx_hash bytea NOT NULL CHECK (octet_length(deployment_tx_hash) = 32),
  protocol_version integer NOT NULL CHECK (protocol_version > 0),
  registered_at timestamptz NOT NULL DEFAULT now()
);
```

### Chain Reset Discrimination
When the local Hardhat node process restarts, the chain resets to block 0. The deployer account (Account 0) deploys with nonce 0, producing the repeated contract address `0x5FbDB2315678afecb367f032d93F642f64180aa3` on chain `31337`.

To prevent database unique constraint collisions on `code` and maintain auditability across chain restarts:
- Every deployment generates a distinct, non-colliding `code`:
  `local-hardhat-<YYYYMMDDHHmmss>-<shortTxHash>` (e.g. `local-hardhat-20261119150143-1c094d99`).
- Every deployment generates a unique instance UUID for `id`.
- The lead can inspect and distinguish deployments from different local runs in `supplyease.ledger_deployments`.

---

## 6. Security & Secret Management

- **No Secrets in Repo**: `.env` and `.env.*` are strictly ignored by `.gitignore`.
- **Local Keys Only**: The default Hardhat private key (`0xac09...`) is strictly for local development and test automation. Never use on public testnets or production.
- **Server-Side Exclusivity**: Signing keys are never exposed in browser or client code.
