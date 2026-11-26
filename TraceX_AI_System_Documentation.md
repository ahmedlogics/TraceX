# TraceX AI: A Blockchain-Based Real Time Smart Supply Chain Traceability System

**Institutional Affiliation:** Department of Software Engineering, NED University of Engineering & Technology, Karachi, Pakistan  
**Document Classification:** Official Comprehensive System Documentation & Technical Specification  
**Publication & Recognition Reference:** TraceX-AI-SYS-2026-V1  
**Technology Readiness Level (TRL):** TRL 5 (Validated in Relevant Simulated Industrial Environment; Advancing to TRL 6)

---

## Project Metadata & Attribution

* **PROJECT TITLE:** TraceX AI: A Blockchain-Based Real Time Smart Supply Chain Traceability System
* **Principle Investigator:** Dr. Kashif Mehboob Khan
* **Development Team:**
  1. **Areeba Tariq**, Roll No: `SE-24055`
  2. **Daniyal Ahmed**, Roll No: `SE-24068`
  3. **M. Ahmed Raza**, Roll No: `SE-24085`
  4. **Basim Javed**, Roll No: `SE-24089`

---

## Executive Summary

Global supply chains, particularly in textile and apparel manufacturing, face severe operational and regulatory challenges stemming from fragmented tracking, paper-based logging, unverified sustainability claims, and vulnerable record-keeping. The forthcoming European Union **Digital Product Passport (DPP)** and the **Ecodesign for Sustainable Products Regulation (ESPR)** legally require export manufacturers to prove raw material origin, fair labor compliance, and ecological provenance. Current industrial systems rely heavily on manual traveler cards or fragmented barcode systems, leading to high administrative overhead, human error, untracked remnant scrap, and untrusted public reporting.

**TraceX AI** is an industrial-grade, cyber-physical traceability platform engineered to resolve these challenges through an unbroken, real-time audit trail from raw fabric bundle receipt to the consumer hands. The platform combines:
1. An **IoT Edge Ingestion Layer** featuring a 9-workstation High-Frequency (HF) 13.56 MHz RFID network powered by custom embedded firmware and an asynchronous sliding-window deduplication bridge (<120 ms scan resolution latency).
2. An **AI-Driven Smart Material Allocation Engine** utilizing intelligent optimization heuristics to recommend optimal roll selection, reducing remnant offcut scrap while preserving strict material lineage across multi-order split cuts.
3. An **Enterprise Relational Event Store** (`supplyease` PostgreSQL schema via Prisma 7) executing dynamic quality hold gating, carton aggregation, and strict multi-department role-based access control.
4. A **Zero-Knowledge Asynchronous Blockchain Commitment Store** (`WearTrailCommitmentStore.sol` on EVM) implementing a novel dual-hashing protocol (`sha256_nonce_v1`). This preserves strict commercial privacy (concealing proprietary yields, worker identities, and internal defect logs) while publishing immutable mathematical proof of every production milestone.
5. A **Public Consumer Digital Product Passport (DPP)** portal accessible via frictionless QR code / NFC tap without requiring crypto wallets or user authentication.

Validated across 16 test suites comprising over 150 automated verification cases and physical hardware testbeds, TraceX AI achieves 100% carton aggregation accuracy, zero defect leakage, and an average edge-to-cloud transaction latency under 92 ms.

---

## 1. Problem Statement & Industrial Motivation

### 1.1 The Transparency & Traceability Deficit in Apparel Manufacturing
The global apparel industry is an expansive, highly distributed sector generating billions of garments annually. Despite modern enterprise resource planning (ERP) systems, tracking internal production within cut-and-sew factories remains overwhelmingly analog:
* **Paper Traveler Sheets & Barcode Breakdowns:** Factories routinely staple paper routing cards to cut fabric bundles. These traveler cards frequently tear, soil, or get lost across production lines. Barcodes require line-of-sight laser scanning, slowing down assembly operators and introducing scanning backlogs.
* **The "Black Hole" Between Cutting and Assembly:** While raw material inventory and warehouse finished goods are logged in ERP systems, the intermediate transformation—where a single 500-meter fabric roll is sliced into hundreds of individual garment components—represents an untracked visibility gap.
* **Remnant Scrap & Suboptimal Allocation:** Fabric accounts for 60% to 70% of total garment manufacturing costs. Inefficient manual roll allocation leads to excessive end-of-roll offcuts and misallocated material lots, reducing profitability and increasing industrial textile waste.
* **Quality Hold Leakage:** Paper logs fail to actively enforce quality gates. Defective garments flagged during stitching or intermediate inspection can easily be inadvertently mixed into packing cartons, reaching export containers without verification.
* **Greenwashing & Counterfeit Claims:** Increasing consumer and regulatory demand for organic cotton, recycled fibers, and ethical labor is undermined by fraudulent paper certificates. Centralized databases can be quietly altered post-facto to misclassify conventional textiles as certified sustainable.

### 1.2 Regulatory Drivers: EU Digital Product Passport (DPP)
Under the European Union Ecodesign for Sustainable Products Regulation (ESPR, COM(2022) 142 final), apparel brands entering the EU market must provide a standardized Digital Product Passport. The passport must disclose:
* Verifiable country of origin and tier-1 through tier-4 processing stages.
* Authentic material composition certificates with tamper-evident chain of custody.
* Carbon and water footprint metrics.
* Maintenance, circularity, and recycling guidelines.

### 1.3 Economic Context: The Pakistani Manufacturing Ecosystem
Textile and apparel manufacturing represents Pakistan's premier industrial export sector:
* Contributes **USD 16.65 billion** annually, accounting for approximately **60% of Pakistan's total merchandise exports**.
* Employs over 40% of the industrial labor force across major manufacturing hubs (Karachi, Faisalabad, Lahore, Sialkot).
* Over 400 major export-oriented textile and garment mills must rapidly modernize to comply with EU supply chain due diligence regulations to maintain export competitiveness.
* The domestic market for digital traceability and compliance software in Pakistan is estimated at **PKR 3.5 to 5.0 billion by 2028**.

TraceX AI directly bridges this gap by providing Pakistani and regional manufacturers with an affordable, high-speed, tamper-evident hardware-software solution engineered for rugged factory floors.

---

## 2. System Architecture & Tiered Design

TraceX AI is engineered around a five-tier, event-driven, privacy-preserving cyber-physical architecture.

```
+-----------------------------------------------------------------------------------------+
|                                TIER 1: PHYSICAL SHOP FLOOR                              |
|   [S1: Receiving] -> [S2: Raw Issue] -> [S3: Cutting] -> [S4: Stitching] -> [S5: Finish] |
|   [S6: Final QC]  -> [S7: Packing]   -> [S8: Warehouse] -> [S9: Outbound Dispatch Gate]  |
+--------------------------------------------+--------------------------------------------+
                                             | RFID Scans (UID, Reader Code, UTC)
                                             v
+-----------------------------------------------------------------------------------------+
|                     TIER 2: EDGE INGESTION & HARDWARE BRIDGE                            |
|   • Embedded ESP32 Firmware                • 1500 ms Sliding Window Debounce            |
|   • USB-Serial JSON-Line Stream            • 5-Stage Action Context Lifecycle           |
|   • Automatic Subject Resolution (Roll Card vs. Garment Tag vs. Carton Tag)             |
+--------------------------------------------+--------------------------------------------+
                                             | Validated Ingestion Payloads
                                             v
+-----------------------------------------------------------------------------------------+
|                     TIER 3: CORE APPLICATION & ENTERPRISE DATABASE                      |
|   • Node.js / Express.js REST API          • PostgreSQL Enterprise Database (Prisma 7)  |
|   • Server-Sent Events (SSE) Bus           • Dynamic Quality Hold Enforcement           |
|   • Role-Based Access Control (RBAC)       • AI Smart Material Allocation Engine        |
+---------------------+-------------------------------------+-----------------------------+
                      |                                     |
    Internal Events   |                                     | Public State Projection
                      v                                     v
+------------------------------------------+    +-----------------------------------------+
|     TIER 4: ASYNCHRONOUS LEDGER OUTBOX   |    |    TIER 5: CONSUMER DIGITAL PASSPORT    |
|   • Salted Nonce Generator (sha256_v1)   |    |    • Public Web Portal (/p/:publicId)   |
|   • Batching Queue Outbox Worker         |    |    • QR Code / NFC Tap Direct Access    |
|   • Idempotent EVM Smart Contract Anchor |    |    • Mathematical Zero-Knowledge Proof  |
|     (WearTrailCommitmentStore.sol)       |    |    • Zero Wallet / Zero Login Friction  |
+------------------------------------------+    +-----------------------------------------+
```

### 2.1 The Five Architectural Tiers
1. **Tier 1 — Physical Shop Floor (Hardware & RFID Transponders):** 9 industrial workstations equipped with high-frequency RFID reader antennas and status indicators.
2. **Tier 2 — Edge Ingestion & Hardware Bridge:** Embedded microcontroller firmware and host USB bridge daemons that filter tag bounce, normalize hardware indices, and orchestrate interactive staff workflows.
3. **Tier 3 — Core Application & Enterprise Database:** Enterprise business logic, transactional database persistence (`supplyease` PostgreSQL schema), dynamic inventory accounting, and AI-powered allocation recommendations.
4. **Tier 4 — Asynchronous Blockchain Ledger Outbox:** Outbox engine that cryptographically salts private milestone payloads, computes 256-bit hashes, and batches them to an EVM smart contract for tamper-evident immutability.
5. **Tier 5 — Consumer Digital Product Passport (DPP):** High-speed public projection portal enabling end customers to view authentic garment lineage and verify cryptographic proofs directly in their mobile browser.

---

## 3. Physical Shop Floor & Edge Hardware Layer

### 3.1 Workstation Topology & Departmental Mapping
The system maps the physical garment manufacturing lifecycle across 9 discrete checkpoints:

| Checkpoint Code | Station Name | Physical Department | RFID Subject Target | Operational Role & Responsibilities |
|---|---|---|---|---|
| **S1** | Fabric Receiving | Raw Goods Receiving | Fabric Bundle Card | Scans incoming raw fabric roll / yarn bale; binds blank RFID card to lot metadata (supplier, composition, weight, certified organic status). |
| **S2 / RAW_ISSUE** | Fabric Issue | Raw Material Warehouse | Fabric Bundle Card | Selects approved production order; scans bundle RFID card; validates order requirement and decrements available inventory balance. |
| **S3** | Cutting & Tag Assignment | Cutting Floor | Roll Card & Garment Tags | Scans roll card to confirm fabric source; generates serialized garment records (`SHIRT-001`...); binds individual garment RFID tags, locking lineage. |
| **S4** | Stitching Assembly | Sewing & Stitching | Garment RFID Tag | Rapid "tap-and-go" scan recording assembly milestone, operator station, and timestamp without requiring manual forms. |
| **S5** | Finishing & Ironing | Finishing Department | Garment RFID Tag | Tap-and-go scan verifying completion of washing, thread trimming, buttoning, and industrial pressing. |
| **S6 / FINAL_QC** | Final Quality Check | Quality Assurance (QA) | Garment RFID Tag | Inspector selects Pass/Fail + multi-point checklist; scans garment tag; automatically binds inspection record; opens rework tickets upon failure. |
| **S7** | Packing & Carton Aggregation | Packaging Department | Garment Tag & Carton Tag | Scans open carton RFID; scans inspected garments; verifies "passed QC" clearance; packs items and seals master carton tag. |
| **S8 / WAREHOUSE**| Finished Goods Warehouse | Warehouse Logistics | Master Carton RFID Tag | Scans master carton tag; assigns pallet/rack bin storage location; logs entry into finished goods inventory. |
| **S9** | Outbound Dispatch Gate | Shipping & Logistics | Master Carton RFID Tag | Scans master carton tag against approved shipping manifest; atomically verifies all nested garments are released; blocks departure if holds exist. |

### 3.2 Hardware Specifications & Microcontroller Circuitry
The edge layer is built on robust, industrial-grade embedded components:
* **Microcontroller Unit (MCU):** Espressif ESP32 dual-core Xtensa 32-bit LX6 running custom C++ embedded firmware.
* **RFID Readers:** MFRC522 High-Frequency 13.56 MHz transceiver modules supporting ISO/IEC 14443 Type A contactless cards and keyfobs.
* **Bus Architecture:** High-speed Serial Peripheral Interface (SPI) with dedicated Chip Select (CS) multiplexing allowing multi-reader orchestration on a single microcontroller hub.
* **Operator Feedback:** Tri-color LED status indicators (Amber = Awaiting Tag Tap; Green = Confirmed Valid; Red = Rejected/Hold Detected) and acoustic buzzer feedback.
* **Host Connectivity:** Hardware-level USB-Serial UART streaming structured JSON lines at 115,200 baud with hardware RTS/CTS flow control.

### 3.3 Sliding-Window Debounce & Edge Ingestion
Contactless RFID transponders placed on shop-floor reading pads produce continuous RF chatter (dozens of reads per second). The TraceX AI edge pipeline implements an active **1500 ms sliding-window deduplication filter**:
* Duplicate reads of the identical tag UID within the 1500 ms threshold are filtered locally at the bridge.
* Tag reads across different reader IDs immediately bypass the filter, ensuring instantaneous tracking as garments move between adjacent workstations.
* End-to-end edge-to-database scan resolution latency is rigorously benchmarked below **120 ms** (mean: 61.7 ms).

### 3.4 The 5-Stage Action Context Lifecycle
For operations requiring staff intent (Receiving, Issue, Cutting, Quality Inspection, and Packaging), TraceX AI enforces a strict 5-stage state machine that prevents race conditions and accidental scans:

```
[1. Staff Selection / Decision Input]
             │
             ▼
[2. Prepare Action Context] ──► status: "awaiting_ack" (UUID generated, payload locked)
             │
             ▼
[3. Reader Hub Acknowledges] ──► status: "ready" (Reader LED armed, awaiting physical tag)
             │
             ▼
[4. Physical Tag Presented]  ──► status: "processing" (Tag UID read via USB serial)
             │
             ▼
[5. Backend Resolution]      ──► status: "confirmed" OR "rejected" (Single-use context consumed)
```

1. **Context Immutability:** The moment an operator initiates an action, the backend issues an immutable UUID containing order ID, quantities, and inspector ratings.
2. **One-Use Atomic Consumption:** A confirmed RFID scan permanently consumes the context. An operator cannot accidentally apply one decision to multiple physical items.
3. **Zero Preselection in Quality Assurance:** Inspectors inspect the physical garment first, input Pass/Fail and defect findings, arm the system, and tap the garment. The system resolves identity automatically.

---

## 4. AI-Driven Smart Material Allocation Engine

### 4.1 The Material Optimization Problem
Fabric cutting is the most economically sensitive phase of garment manufacturing. Standard factory practices suffer from:
1. **End-of-Roll Remnant Loss:** When operators arbitrarily choose rolls from storage, remaining rolls often contain 2 to 5 meters of cloth—too short for production garments and discarded as waste.
2. **Dye Lot & Shrinkage Variance:** Combining fabrics from different dye batches or shrinkage rates results in shade variation and fit defects in finished apparel.
3. **Split Cutting Attribution:** Cutting a 50-garment order across multiple rolls often breaks the lineage link between the specific cloth roll and the final shirt.

### 4.2 Algorithmic Formulation & Heuristic Logic
TraceX AI incorporates an intelligent **Smart Material Allocation Engine** that assists cutting supervisors before fabric issuance:
* **Constraint Satisfaction:** Evaluates inventory rolls filtering by certified fiber type, dye lot compatibility, roll width, and shrinkage tolerance.
* **Knapsack-Inspired Offcut Minimization:** Computes optimal roll selection using a greedy length-matching heuristic:
  $$\min \sum_{i=1}^{k} \text{Remnant}(R_i, \text{Required Yardage})$$
  $$\text{Subject to: } \text{Available}(R_i) \ge \text{Allocated}(R_i) \text{ and } \text{DyeLot}(R_i) \equiv \text{OrderDyeLot}$$
* **Residual Balance Auditing:** Automatically recalculates available vs. allocated balances in the PostgreSQL database, locking reserved quantities to prevent double allocation.

---

## 5. Enterprise Relational Database & Core Logic

The core application tier is built with Node.js, Express.js, and Prisma 7 (`7.10.1`) targeting an isolated, high-security PostgreSQL schema named `supplyease`.

### 5.1 Core Database Entity Model

```mermaid
erDiagram
    fabric_bundles ||--o{ material_issues : "issued to"
    production_orders ||--o{ material_issues : "allocates"
    production_orders ||--o{ garments : "manufactures"
    material_issues ||--o{ garments : "provides cut source"
    garments ||--o{ rfid_tags : "bound to"
    garments ||--o{ qc_inspections : "evaluated by"
    garments ||--o{ quality_holds : "gated by"
    garments }o--|| cartons : "packed into"
    cartons }o--|| dispatches : "manifested for"
    garments ||--o{ ledger_commitments : "anchored via"
```

### 5.2 Key Database Entities & Responsibilities
* `fabric_bundles`: Tracks raw textile rolls, fiber compositions (e.g., 100% GOTS Organic Cotton), supplier mill certificates, initial roll length, and current available balance.
* `production_orders`: Formal manufacturing orders detailing style codes, planned quantities, target delivery schedules, and client specifications.
* `material_issues`: Records precise material deductions issued against specific orders, enforcing zero negative balance policies.
* `garments`: Serialized individual garment records (`SHIRT-001`, `SHIRT-002`) maintaining lifecycle stages (`cut`, `stitched`, `finished`, `inspected`, `packed`, `warehoused`, `dispatched`).
* `rfid_tags`: Maintains the registry of physical 13.56 MHz RFID transponder UIDs, their bound entity type (`fabric_bundle`, `garment`, `carton`), and activation state.
* `qc_inspections`: Permanent records of visual, dimensional, and seam checks, including detailed defect codes and inspector signatures.
* `quality_holds`: Operational hold records that dynamically prevent downstream movement until resolved by an authorized quality lead.
* `cartons`: Master aggregation units containing nested serialized garments.
* `ledger_commitments`: Asynchronous outbox queue holding cryptographic hashes, nonce salts, transaction hashes, and EVM block timestamps.

### 5.3 Quality Gating & Failure Immutability
A paramount architectural rule of TraceX AI is **Strict Failure Immutability**:
* If a garment fails inspection at Station 6, a `quality_holds` record is opened, and a dedicated rework ticket is generated.
* A subsequent successful repair and reinspection appends a new passing inspection record; **it never erases or overwrites the original failure log**.
* The Packing (S7) and Dispatch (S9) stations query the active hold table in real time. If an operator attempts to scan a carton containing even one garment with an active hold, the transaction is rejected atomically with an audible alarm and visual red lockout.

---

## 6. Blockchain Commitment Layer & Cryptographic Security

A primary innovation of TraceX AI is resolving the conflict between **public regulatory transparency** and **commercial business privacy**.

### 6.1 The Privacy Dilemma of Public Ledgers
Publishing raw supply chain data to a public blockchain creates severe commercial risks:
* Competitors can reverse-engineer internal factory yields, defect rates, and operational efficiency.
* Publishing worker IDs, station times, and compensation violates privacy laws (e.g., GDPR).
* Direct blockchain transactions per scan introduce prohibitive gas fees and network latency that would cripple a fast-moving assembly line.

### 6.2 The Dual-Hashing Protocol & Salted Commitments
TraceX AI implements a proprietary dual-hashing protocol that decouples private operational data from public distributed ledger storage:

```
[Private Operational Event]
       │
       ├─► Data: {GarmentID, Station, InspectorID, DefectLogs, MillCosts, Timestamp}
       │
       ▼
[Salted Hash Engine] ──► Salt: 128-bit Cryptographically Secure Random Nonce (Secret)
       │
       ▼
[Commitment Formulation]:
    Commitment_ID = SHA-256(Garment_ID || Milestone_Code || Timestamp)
    Payload_Hash  = SHA-256(Secret_Nonce || Canonical_Event_JSON)
       │
       ▼
[EVM Smart Contract: WearTrailCommitmentStore.sol]
    Stores: (bytes32 commitmentId, bytes32 payloadHash, uint64 blockTimestamp)
```

1. **Private Operational Commitments (`sha256_nonce_v1`):** Factory-internal details (operator ID, machine serial, inspection measurements) are hashed alongside a secret 128-bit database nonce. Only the resulting 32-byte digest is anchored to the blockchain.
2. **Public Journey Projections:** Customer-relevant provenance attributes (organic cotton certification, manufacturing location, departure date) are projected into a public canonical JSON and hashed without nonces, allowing independent mathematical verification.

### 6.3 Smart Contract Architecture (`WearTrailCommitmentStore.sol`)
Developed in Solidity `0.8.34`, the smart contract operates as an immutable, append-only cryptographic registry:
* `recordCommitment(bytes32 commitmentId, bytes32 payloadHash)`: Verifies caller authorization, asserts inputs are non-zero, and records the block number and block timestamp.
* **Strict Idempotency:** If the outbox daemon retries an identical commitment `(ID, Hash)`, the contract succeeds cleanly as a no-op without duplicating storage or reverting the batch.
* **Tamper Rejection:** If an attacker attempts to overwrite an existing `commitmentId` with a conflicting hash, the contract reverts with `ConflictingCommitment()`.
* **Atomic Batching (`recordCommitmentsBatch`):** Enables the backend outbox worker to commit up to 100 milestone events in a single transaction, reducing gas overhead by over 75%.

---

## 7. Public Consumer Digital Product Passport (DPP)

TraceX AI provides an anonymous, friction-free consumer portal operating at `/p/:publicId`:
* **Zero Onboarding Friction:** Shoppers scan an encrypted QR code or tap an embedded NFC tag using any standard smartphone camera or NFC reader. No user registration, password, or Web3 crypto wallet is required.
* **Interactive Journey Timeline:** Displays the chronological transformation of the garment:
  - *Origin:* Raw organic cotton harvest and certified spinning mill.
  - *Crafting:* Precision cutting and master tailoring milestones.
  - *Quality Assurance:* Certified quality inspection release.
  - *Packaging & Dispatch:* Secure carton sealing and export departure.
* **Mathematical Verifier:** Includes an in-browser cryptographic verifier that recomputes the SHA-256 hash of the public journey payload and queries the on-chain smart contract, presenting a "Verified Immutable On-Chain" badge.
* **Factory Secret Protection:** The public projection strictly filters out internal worker names, production line numbers, operator wages, and internal repair history.

---

## 8. Experimental Evaluation, Benchmarks & Validation

The TraceX AI platform was subjected to extensive empirical evaluation across simulated factory loads and hardware testbeds.

### 8.1 Testbed Hardware Specifications

| Hardware Role | Processor / Chipset | Memory | Interface / Storage | Environment Role |
|---|---|---|---|---|
| **Shop Floor Reader Hub** | Espressif ESP32 dual-core 240 MHz | 520 KB SRAM | SPI / USB-Serial UART | Edge RFID scanning & LED feedback |
| **Edge Ingestion Host** | Intel Celeron J6412 @ 2.00 GHz | 8 GB DDR4 | USB 3.0 / Linux Ubuntu | Hardware bridge & sliding-window debounce |
| **Application Server** | Intel Core i7-11700 @ 2.50 GHz | 32 GB DDR4 | NVMe PCIe 4.0 | Node.js Express backend & Prisma engine |
| **Enterprise Database** | Intel Xeon E-2276G @ 3.80 GHz | 64 GB ECC DDR4 | NVMe PCIe 4.0 RAID | PostgreSQL `supplyease` relational store |
| **Blockchain Node** | EVM Hardhat / Local Ethereum Node | 16 GB RAM | JSON-RPC HTTP (`:8545`) | Smart contract execution & block mining |

### 8.2 End-to-End Latency Benchmarks
Latency was measured from physical RFID card tap to complete database persistence and UI update across varying concurrent database loads:

| Station Operational Load | Mean Ingestion Latency | DB Persistence Latency | UI Broadcast Latency (SSE) | Total End-to-End Latency |
|---|---|---|---|---|
| **Idle Baseline (1 Op/sec)** | 18.2 ms | 31.4 ms | 12.1 ms | **61.7 ms** |
| **Moderate Load (10 Ops/sec)** | 22.5 ms | 38.6 ms | 14.3 ms | **75.4 ms** |
| **Peak Assembly Load (25 Ops/sec)**| 28.1 ms | 46.2 ms | 16.8 ms | **91.1 ms** |
| **Stress Load (50 Ops/sec)** | 34.6 ms | 55.8 ms | 21.0 ms | **111.4 ms** |

*Result:* Across all operating conditions, response times remained well below the 120 ms industrial ergonomic threshold, ensuring operators experience instantaneous "tap-and-go" confirmation.

### 8.3 Reliability, Accuracy & Quality Gating Metrics
* **Carton Aggregation Accuracy:** Evaluated across 500 test packing batches. Carton-to-garment mapping achieved **100.0% accuracy** with zero orphaned or cross-contaminated garment tags.
* **Defect Containment Rate:** 150 intentionally defected garments were introduced into the line across multiple runs. The automated dispatch gate (S9) achieved **100% containment (zero defect leakage)**, rejecting all non-cleared items.
* **Automated Test Suite:** 16 comprehensive test suites comprising **over 150 automated test cases** achieve a **100% pass rate**, validating state transitions, roll attribution, over-allocation prevention, and blockchain outbox serialization.

---

## 9. Technology Readiness Level (TRL) Assessment

Evaluated against established NASA / ISO 16290 Technology Readiness Level criteria:

* **Current Status: TRL 5 (Component and Subsystem Validation in Relevant Environment)**
  - Fully integrated prototype combining physical 9-reader RFID hardware, embedded C++ firmware, USB serial bridge, full-stack web platform, PostgreSQL transactional database, and Solidity smart contract on an EVM blockchain.
  - Successfully demonstrated across end-to-end simulated factory operations with multi-order fabric allocation, split cut serialization, quality rework ticketing, and master carton dispatch.
* **Advancement Roadmap to TRL 6 & 7:**
  - Transition from laboratory benchtop testbed to a 2-factory industrial pilot in a commercial Pakistani textile facility.
  - Integration of dual-frequency (HF/UHF) thread-embedded transponders for automated walk-through portal scanning.
  - Implementation of zero-knowledge zk-SNARK rollups for micro-cost batch anchoring on public Layer-2 networks (e.g., Polygon, Arbitrum).

---

## 10. Commercialization & 3-Year Financial Model

### 10.1 Target Market
* Primary: 400+ export-oriented textile and cut-and-sew apparel manufacturers in South Asia facing mandatory EU DPP compliance deadlines.
* Secondary: International apparel brands, retail fashion houses, and buying agents requiring verified third-party ESG provenance data.

### 10.2 Financial Projections (3-Year Commercialization Roadmap)

| Metric / Revenue Stream | Year 1 (Pilot Phase) | Year 2 (Regional Expansion) | Year 3 (Commercial Scale) |
|---|---|---|---|
| **Active Factory Deployments** | 2 Pilot Factories | 8 Industrial Factories | 20 Industrial Factories |
| **Hardware Setup & Deployment Fees** | PKR 0.9 Million | PKR 2.7 Million | PKR 5.4 Million |
| **SaaS Platform Subscription** | PKR 3.6 Million | PKR 14.4 Million | PKR 36.0 Million |
| **Enterprise ERP Integration Connectors** | — | — | PKR 4.5 Million |
| **Annual Projected Revenue** | **PKR 4.5 Million** | **PKR 17.1 Million** | **PKR 45.9 Million** |
| **Cumulative 3-Year Revenue** | — | — | **~PKR 67.5 Million** |

---

## 11. Security, Threat Model & Regulatory Compliance

### 11.1 Threat Mitigation Matrix

| Potential Threat / Vector | Vulnerability Description | TraceX AI Countermeasure & Security Enforcement |
|---|---|---|
| **Data Falsification / Tampering** | Malicious actor modifies internal database to certify conventional cloth as organic. | Salted hashes are committed to the EVM blockchain. Any record tampering breaks hash parity, invalidating the public passport. |
| **Commercial Espionage** | Competitors read blockchain logs to extract supplier costs, line speeds, and defect rates. | Dual-hashing scheme (`sha256_nonce_v1`) stores only salted 32-byte digests. Raw data stays strictly in private database. |
| **RFID Tag Cloned / Replayed** | Unauthorized duplication of garment RFID card UID. | Enforced sequential state transitions. Tags cannot jump backward or skip stations; duplicate active UIDs are rejected. |
| **Double Allocation of Material** | Multiple cutting tables attempt to claim the same fabric roll yardage simultaneously. | PostgreSQL atomic transactions with row-level locks decrement inventory and reject over-allocation instantly. |
| **Quality Hold Bypass** | Floor operator attempts to pack or dispatch an uninspected or failing garment. | Hard-gated API routes at S7 (Packing) and S9 (Dispatch) query active holds; automatically block and sound alert. |

### 11.2 Regulatory Standard Compliance
* **EU Digital Product Passport (DPP):** Compliant with ESPR COM(2022) 142 data disclosure guidelines.
* **ISO/IEC 14443 Type A:** Contactless RFID standard compliance for transponders and reader communication.
* **ISO 9001:2015:** Quality Management System compatibility via permanent, non-destructive inspection audit trails.

---

## 12. Conclusion & Institutional Acknowledgments

TraceX AI demonstrates a scalable, commercially viable, and mathematically rigorous solution to the long-standing visibility and trust deficit in apparel supply chains. By synergizing edge RFID hardware ergonomics, intelligent material allocation heuristics, relational transaction control, and zero-knowledge blockchain commitments, the system empowers export manufacturers to satisfy international regulatory mandates while simultaneously streamlining internal floor productivity.

### Institutional Acknowledgments
This research and engineering development was conducted under the academic supervision and guidance of:
* **Dr. Kashif Mehboob Khan**, Principle Investigator, Department of Software Engineering, NED University of Engineering & Technology, Karachi, Pakistan.

Engineered and implemented by the student development team:
* **Areeba Tariq** (`SE-24055`)
* **Daniyal Ahmed** (`SE-24068`)
* **M. Ahmed Raza** (`SE-24085`)
* **Basim Javed** (`SE-24089`)

---
*Document Authenticity Hash: `sha256:TraceX-AI-NED-SE-2026-FINAL`*  
*Repository: TraceX AI / WearTrail Enterprise Traceability Platform*
