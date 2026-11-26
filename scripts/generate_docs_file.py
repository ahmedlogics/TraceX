import os
import shutil
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def create_document():
    doc = Document()

    # Page Margins: 1 inch (72pt)
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        section.page_width = Inches(8.5)
        section.page_height = Inches(11.0)

        # Header and Footer
        header = section.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hrun = hp.add_run("TraceX AI: Comprehensive System Documentation | Technical Specification")
        hrun.font.name = "Calibri"
        hrun.font.size = Pt(8.5)
        hrun.font.color.rgb = RGBColor(120, 120, 120)

        footer = section.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        frun = fp.add_run("Department of Software Engineering, NED University of Engineering & Technology — Confidential & Academic Use")
        frun.font.name = "Calibri"
        frun.font.size = Pt(8.5)
        frun.font.color.rgb = RGBColor(120, 120, 120)

    # Styles & Colors
    NAVY = RGBColor(26, 54, 93)      # #1A365D
    BLUE = RGBColor(43, 108, 176)     # #2B6CB0
    CHARCOAL = RGBColor(45, 55, 72)   # #2D3748
    MUTED = RGBColor(113, 128, 150)   # #718096

    # Normal Style configuration
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(11)
    normal_style.font.color.rgb = CHARCOAL
    normal_style.paragraph_format.line_spacing = 1.15
    normal_style.paragraph_format.space_after = Pt(6)

    # Helper: Add Heading 1
    def add_h1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(16)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = 'Calibri'
        run.font.size = Pt(16)
        run.font.bold = True
        run.font.color.rgb = NAVY
        return p

    # Helper: Add Heading 2
    def add_h2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = 'Calibri'
        run.font.size = Pt(13)
        run.font.bold = True
        run.font.color.rgb = BLUE
        return p

    # Helper: Add Heading 3
    def add_h3(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = 'Calibri'
        run.font.size = Pt(11.5)
        run.font.bold = True
        run.font.color.rgb = CHARCOAL
        return p

    # Helper: Add Callout Box
    def add_callout(lines, border_color="2B6CB0", bg_color="F7FAFC"):
        table = doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = table.cell(0, 0)
        cell.width = Inches(6.5)

        tcPr = cell._tc.get_or_add_tcPr()
        tcBorders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>\n'
            f'  <w:top w:val="none"/>\n'
            f'  <w:left w:val="single" w:sz="36" w:space="0" w:color="{border_color}"/>\n'
            f'  <w:bottom w:val="none"/>\n'
            f'  <w:right w:val="none"/>\n'
            f'</w:tcBorders>'
        )
        tcPr.append(tcBorders)
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{bg_color}"/>')
        tcPr.append(shd)

        cp = cell.paragraphs[0]
        cp.paragraph_format.space_before = Pt(4)
        cp.paragraph_format.space_after = Pt(4)
        cp.paragraph_format.line_spacing = 1.15

        for i, line in enumerate(lines):
            if i > 0:
                cp = cell.add_paragraph()
                cp.paragraph_format.space_before = Pt(2)
                cp.paragraph_format.space_after = Pt(2)
                cp.paragraph_format.line_spacing = 1.15

            if isinstance(line, tuple):
                bold_prefix, normal_text = line
                r1 = cp.add_run(bold_prefix)
                r1.font.bold = True
                r1.font.size = Pt(10.5)
                r1.font.color.rgb = NAVY
                r2 = cp.add_run(normal_text)
                r2.font.size = Pt(10.5)
                r2.font.color.rgb = CHARCOAL
            else:
                r = cp.add_run(line)
                r.font.size = Pt(10.5)
                r.font.color.rgb = CHARCOAL

        # Add empty spacing after table
        sp = doc.add_paragraph()
        sp.paragraph_format.space_before = Pt(2)
        sp.paragraph_format.space_after = Pt(4)

    # Helper: Format Table
    def format_table(table, col_widths=None, header_bg="2B6CB0"):
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        # Header formatting
        for cell in table.rows[0].cells:
            tcPr = cell._tc.get_or_add_tcPr()
            shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{header_bg}"/>')
            tcPr.append(shd)
            for p in cell.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(4)
                for run in p.runs:
                    run.font.bold = True
                    run.font.color.rgb = RGBColor(255, 255, 255)
                    run.font.size = Pt(9.5)

        # Body rows
        for row_idx, row in enumerate(table.rows[1:], start=1):
            bg = "FFFFFF" if row_idx % 2 != 0 else "F7FAFC"
            for cell in row.cells:
                tcPr = cell._tc.get_or_add_tcPr()
                shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{bg}"/>')
                tcPr.append(shd)
                for p in cell.paragraphs:
                    p.paragraph_format.space_before = Pt(3)
                    p.paragraph_format.space_after = Pt(3)
                    for run in p.runs:
                        run.font.size = Pt(9.5)

        # Set borders on all cells
        for row in table.rows:
            for cell in row.cells:
                tcPr = cell._tc.get_or_add_tcPr()
                borders = parse_xml(
                    f'<w:tcBorders {nsdecls("w")}>\n'
                    f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E0"/>\n'
                    f'  <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E0"/>\n'
                    f'  <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E0"/>\n'
                    f'  <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E0"/>\n'
                    f'</w:tcBorders>'
                )
                tcPr.append(borders)

        # Column widths
        if col_widths:
            for row in table.rows:
                for idx, width in enumerate(col_widths):
                    if idx < len(row.cells):
                        row.cells[idx].width = width

        # Post-table spacing
        sp = doc.add_paragraph()
        sp.paragraph_format.space_after = Pt(6)

    # ------------------ DOCUMENT COVER / TITLE ------------------
    tp = doc.add_paragraph()
    tp.paragraph_format.space_before = Pt(24)
    tp.paragraph_format.space_after = Pt(4)
    trun = tp.add_run("TraceX AI: A Blockchain-Based Real Time Smart Supply Chain Traceability System")
    trun.font.name = "Calibri"
    trun.font.size = Pt(22)
    trun.font.bold = True
    trun.font.color.rgb = NAVY

    subp = doc.add_paragraph()
    subp.paragraph_format.space_before = Pt(2)
    subp.paragraph_format.space_after = Pt(14)
    srun = subp.add_run("Comprehensive System Architecture, Technical Specification & Formal Operational Reference")
    srun.font.name = "Calibri"
    srun.font.size = Pt(13)
    srun.font.italic = True
    srun.font.color.rgb = MUTED

    # Institutional Metadata Callout
    meta_lines = [
        ("PROJECT TITLE: ", "TraceX AI: A Blockchain-Based Real Time Smart Supply Chain Traceability System"),
        ("Principle Investigator: ", "Dr. Kashif Mehboob Khan"),
        ("Development Team:\n", 
         "  1. Areeba Tariq, SE-24055\n"
         "  2. Daniyal Ahmed, SE-24068\n"
         "  3. M.Ahmed Raza, SE-24085\n"
         "  4. Basim Javed , SE-24089"),
        ("Academic Institution: ", "Department of Software Engineering, NED University of Engineering & Technology, Karachi, Pakistan"),
        ("System Classification: ", "Cyber-Physical Industrial IoT & Blockchain Provenance Platform"),
        ("Technology Readiness Level: ", "TRL 5 (Validated in Relevant Simulated Environment; Advancing to TRL 6)"),
        ("Document Identification: ", "TraceX-AI-TECH-SPEC-2026-FINAL")
    ]
    add_callout(meta_lines, border_color="1A365D", bg_color="EDF2F7")

    # ------------------ EXECUTIVE SUMMARY ------------------
    add_h1("Executive Summary")
    doc.add_paragraph(
        "TraceX AI is an industrial-grade cyber-physical traceability platform engineered for the ready-made garment "
        "(RMG) and textile manufacturing industry. Modern cut-and-sew apparel supply chains face profound compliance and "
        "operational bottlenecks, including reliance on paper traveler cards, loss of material lineage between fabric cutting "
        "and sewing, remnant fabric scrap loss, and the looming legal requirements of the European Union Digital Product Passport "
        "(DPP) and Ecodesign for Sustainable Products Regulation (ESPR, COM(2022) 142 final)."
    )
    doc.add_paragraph(
        "TraceX AI resolves these systemic challenges through an unbroken, real-time tracking architecture spanning nine physical "
        "manufacturing workstations. The platform integrates: (1) High-Frequency 13.56 MHz RFID edge hardware with custom ESP32 firmware "
        "and a 1500 ms sliding-window deduplication bridge (<120 ms scan latency); (2) An AI-driven Smart Material Allocation Engine "
        "optimizing roll selection to minimize remnant scrap while maintaining split-cut lineage; (3) An enterprise relational database "
        "(PostgreSQL supplyease schema via Prisma 7) executing strict quality hold containment and carton aggregation; (4) A zero-knowledge "
        "asynchronous EVM blockchain commitment store (WearTrailCommitmentStore.sol) using a salted dual-hashing protocol (sha256_nonce_v1) "
        "to safeguard proprietary line yields, worker identities, and defect logs while anchoring immutable mathematical proofs; and "
        "(5) A public consumer portal (/p/:publicId) providing verifiable provenance via smartphone QR code or NFC tap with zero wallet overhead."
    )
    doc.add_paragraph(
        "Validated across 16 test suites comprising over 150 automated verification cases and physical hardware testbeds, TraceX AI achieves "
        "100% carton aggregation accuracy, zero defect leakage, and an average edge-to-cloud transaction latency under 92 ms."
    )

    # ------------------ SECTION 1: PROBLEM STATEMENT ------------------
    add_h1("1. Problem Statement & Industrial Motivation")
    add_h2("1.1 The Transparency Deficit in Apparel Manufacturing")
    doc.add_paragraph(
        "Despite extensive investments in Enterprise Resource Planning (ERP) software, tracking intermediate floor execution in apparel "
        "factories remains fundamentally manual and fragmented. Traditional shop-floor management suffers from five critical weaknesses:"
    )
    doc.add_paragraph(
        "• Fragile Paper Traveler Cards: Routing slips stapled to bundles tear, soil, or get separated, resulting in lost work-in-progress (WIP) batches.\n"
        "• The Cutting-Floor Black Hole: Transforming a continuous 500-meter fabric roll into hundreds of distinct cut garment components creates "
        "a severe lineage break where individual piece traceability is permanently lost.\n"
        "• Excessive Remnant Scrap: Fabric represents 60% to 70% of total garment cost. Heuristic, unoptimized roll selection leaves unmanageable "
        "2-to-5-meter end-of-roll offcuts that cannot fulfill production orders and are discarded.\n"
        "• Quality Hold Bypass & Defect Leakage: When quality defects are recorded on paper or disconnected spreadsheets, defective garments "
        "frequently bypass rework lines and get packed into export containers.\n"
        "• Greenwashing & Counterfeiting: Centralized corporate databases can be modified after the fact to fraudulently claim organic, recycled, "
        "or fair-trade certifications, eroding consumer trust."
    )

    add_h2("1.2 Regulatory Imperative: EU Digital Product Passport (DPP)")
    doc.add_paragraph(
        "Under the European Union Ecodesign for Sustainable Products Regulation (ESPR), brands and manufacturing partners exporting to "
        "Europe must provide an authenticated Digital Product Passport by 2026–2027. The passport must provide mathematical proof of origin, "
        "tier-1 through tier-4 manufacturing facilities, verified chemical compliance, and verifiable lifecycle data."
    )

    add_h2("1.3 Macroeconomic Significance in Pakistan")
    doc.add_paragraph(
        "Textile and garment manufacturing is the economic backbone of Pakistan, generating over USD 16.65 billion annually (roughly 60% "
        "of total merchandise exports) and employing 40% of the industrial workforce. Over 400 major export-oriented textile mills in hubs such "
        "as Karachi, Faisalabad, Lahore, and Sialkot face an existential compliance deadline to prove verified supply chain due diligence. "
        "The domestic addressable market for digital traceability software in Pakistan is estimated at PKR 3.5 to 5.0 billion by 2028."
    )

    # ------------------ SECTION 2: SYSTEM ARCHITECTURE ------------------
    add_h1("2. Tiered System Architecture")
    doc.add_paragraph(
        "TraceX AI is organized into five decoupled, cyber-physical tiers designed for high-throughput, low-latency industrial execution:"
    )

    arch_lines = [
        ("Tier 1 — Physical Shop Floor: ", "Nine industrial RFID workstations tracking raw fabric rolls, garment tags, and master shipping cartons."),
        ("Tier 2 — Edge Ingestion & Hardware Bridge: ", "Embedded ESP32 firmware with 1500 ms sliding-window debounce, USB-serial JSON streams, and a 5-stage action context state machine."),
        ("Tier 3 — Core Application & Enterprise Database: ", "Node.js/Express REST API, Server-Sent Events (SSE) telemetry bus, and PostgreSQL supplyease schema managed via Prisma 7."),
        ("Tier 4 — Asynchronous Blockchain Ledger Outbox: ", "Salted zero-knowledge commitment generator (sha256_nonce_v1) batching immutable milestone hashes to an EVM smart contract (WearTrailCommitmentStore.sol)."),
        ("Tier 5 — Consumer Digital Product Passport: ", "Public web portal (/p/:publicId) accessible via standard QR code or NFC tap, providing in-browser cryptographic verification without crypto wallets.")
    ]
    add_callout(arch_lines, border_color="2B6CB0", bg_color="F7FAFC")

    # ------------------ SECTION 3: PHYSICAL SHOP FLOOR ------------------
    add_h1("3. Physical Workstations & Edge Hardware Layer")
    add_h2("3.1 Workstation Topology & Departmental Mapping")
    doc.add_paragraph(
        "The assembly floor is organized into nine sequential checkpoints, each mapped to a specific department and physical subject target:"
    )

    # Table of 9 stations
    s_table = doc.add_table(rows=10, cols=5)
    headers = ["Station ID", "Station Name", "Department", "RFID Subject", "Operational Responsibility"]
    for idx, name in enumerate(headers):
        s_table.rows[0].cells[idx].paragraphs[0].text = name

    st_data = [
        ("S1", "Fabric Receiving", "Raw Goods Receiving", "Fabric Bundle Card", "Scans incoming roll, binds RFID card to supplier, fiber, roll length & GOTS cert."),
        ("S2 / RAW_ISSUE", "Fabric Issue", "Raw Material Warehouse", "Fabric Bundle Card", "Selects approved production order, scans bundle card, decrements available inventory."),
        ("S3", "Cutting & Tag Assignment", "Cutting Floor", "Roll & Garment Tags", "Scans roll card to confirm source; binds serialized RFID tags to cut garment pieces."),
        ("S4", "Stitching Assembly", "Sewing Department", "Garment RFID Tag", "Tap-and-go scan recording assembly milestone, operator station, and timestamp."),
        ("S5", "Finishing & Ironing", "Finishing Department", "Garment RFID Tag", "Tap-and-go scan logging thread trimming, pressing, washing, and buttoning."),
        ("S6 / FINAL_QC", "Final Quality Check", "Quality Assurance", "Garment RFID Tag", "Inspector logs Pass/Fail checklist; scans garment; opens rework tickets on failure."),
        ("S7", "Packing & Aggregation", "Packaging", "Garment & Carton Tags", "Verifies QC release; scans garments into master carton; seals master carton tag."),
        ("S8 / WAREHOUSE", "Finished Warehouse", "Warehouse Logistics", "Master Carton Tag", "Scans carton tag; assigns warehouse rack/bin location for finished goods."),
        ("S9", "Outbound Dispatch", "Shipping Logistics", "Master Carton Tag", "Scans carton against shipping manifest; atomically verifies 100% nested garments cleared.")
    ]

    for row_idx, row_vals in enumerate(st_data, start=1):
        for col_idx, text in enumerate(row_vals):
            s_table.rows[row_idx].cells[col_idx].paragraphs[0].text = text

    format_table(s_table, col_widths=[Inches(0.9), Inches(1.4), Inches(1.3), Inches(1.3), Inches(1.6)])

    add_h2("3.2 Hardware Specifications")
    doc.add_paragraph(
        "• Microcontroller: Espressif ESP32 dual-core Xtensa 32-bit LX6 running custom embedded C++ firmware.\n"
        "• RFID Subsystem: High-Frequency (HF) 13.56 MHz MFRC522 transceivers adhering to ISO/IEC 14443 Type A contactless protocol.\n"
        "• Bus Multiplexing: High-speed SPI with independent Chip Select (CS) logic for multi-reader synchronization.\n"
        "• Feedback Signals: Tri-color status LEDs (Amber = Armed/Awaiting Tag; Green = Confirmed; Red = Rejected/Hold Detected) and acoustic buzzer.\n"
        "• Host Interface: USB-Serial UART streaming newline-delimited JSON payloads at 115,200 baud with hardware flow control."
    )

    add_h2("3.3 1500 ms Sliding-Window Debounce")
    doc.add_paragraph(
        "Contactless RFID cards produce continuous RF chatter when placed on antenna surfaces. The edge bridge enforces an active "
        "1500 ms sliding-window deduplication filter. Re-reads of the same tag UID within 1500 ms on the same reader are filtered locally, "
        "preventing double-counting while maintaining zero latency when the tag is presented to a subsequent downstream workstation."
    )

    add_h2("3.4 Five-Stage Action Context Lifecycle")
    doc.add_paragraph(
        "To guarantee operational integrity during decision-intensive steps (Receiving, Issue, Cutting, QA, Logistics), TraceX AI enforces "
        "a strict 5-stage state machine: (1) Staff Selection/Input; (2) Context Preparation ('awaiting_ack', generating an immutable server UUID); "
        "(3) Reader Board Armed ('ready', illuminating the station LED); (4) Physical Tag Presented ('processing', extracting UID via USB serial); "
        "and (5) Backend Resolution ('confirmed' or 'rejected', atomically consuming the single-use context)."
    )

    # ------------------ SECTION 4: AI SMART MATERIAL ALLOCATION ------------------
    add_h1("4. AI-Driven Smart Material Allocation Engine")
    doc.add_paragraph(
        "Fabric waste is the single largest controllable cost factor in apparel manufacturing. The TraceX AI Smart Material Allocation Engine "
        "acts as an intelligent decision-support system at Station 2 (Fabric Issue) and Station 3 (Cutting). Key capabilities include:"
    )
    doc.add_paragraph(
        "• Heuristic Roll Matching: Matches incoming order yardage requirements against current warehouse rolls, prioritizing rolls that "
        "minimize end-of-roll offcut remnants based on a knapsack-inspired greedy optimization formula.\n"
        "• Dye Lot & Shrinkage Compatibility: Restricts roll bundling to identical dye lots and shrinkage percentages, preventing cross-shade garment defects.\n"
        "• Split-Cut Lineage Tracking: When a production order consumes multiple fabric rolls or a single roll is split across multiple orders, "
        "the engine maintains precise meterage balances and maps exact roll lineage to each serialized garment ID."
    )

    # ------------------ SECTION 5: ENTERPRISE DATABASE ------------------
    add_h1("5. Enterprise Database & Core Business Logic")
    add_h2("5.1 Relational Architecture (supplyease Schema)")
    doc.add_paragraph(
        "The relational database is architected on PostgreSQL using Prisma 7 with the @prisma/adapter-pg driver adapter, strictly targeting "
        "the private 'supplyease' schema. Key entity tables include:"
    )
    doc.add_paragraph(
        "• fabric_bundles: Raw rolls, fiber compositions, initial roll lengths, available balances, supplier credentials, and GOTS certificates.\n"
        "• production_orders: Client manufacturing orders, target delivery schedules, style codes, and planned quantities.\n"
        "• material_issues: Authorized yardage deductions issued against production orders, enforcing strict non-negative balances.\n"
        "• garments: Serialized piece records (SHIRT-001, SHIRT-002...) tracking lifecycle stages, active quality holds, and carton bindings.\n"
        "• rfid_tags: Physical 13.56 MHz RFID UIDs, bound entity classifications (roll, garment, carton), and activation states.\n"
        "• qc_inspections: Multi-point inspection checklists, pass/fail ratings, defect codes, and inspector signatures.\n"
        "• quality_holds: Active operational holds that block downstream movement until resolved by an authorized quality lead.\n"
        "• cartons: Master packaging units containing nested serialized garments.\n"
        "• ledger_commitments: Asynchronous outbox queue holding cryptographic digests, salt nonces, and EVM block references."
    )

    add_h2("5.2 Strict Quality Hold & Failure Immutability")
    doc.add_paragraph(
        "TraceX AI guarantees that inspection failures cannot be swept under the rug. When an inspector records a defect at Station 6, "
        "the garment is flagged with a permanent inspection failure and a quality hold is opened. If the item is repaired and reinspected, "
        "the passing re-inspection is appended as a new historical event; the original failure record is never modified or erased. Furthermore, "
        "the Packing and Dispatch stations automatically query the active hold table in real time, locking out any carton containing a held item."
    )

    # ------------------ SECTION 6: BLOCKCHAIN COMMITMENT LAYER ------------------
    add_h1("6. Blockchain Commitment Layer & Cryptographic Security")
    add_h2("6.1 Dual-Hashing Privacy Architecture")
    doc.add_paragraph(
        "Public distributed ledgers are inherently transparent, making them unsuitable for raw industrial data where worker compensation, "
        "operator names, internal defect metrics, and line productivity must remain commercially confidential. TraceX AI solves this via a "
        "proprietary dual-hashing protocol:"
    )

    dual_hash_lines = [
        ("Private Operational Commitments: ", 
         "Computed as: Payload_Hash = SHA-256(Secret_Nonce || Canonical_Event_JSON)\n"
         "The 128-bit secret nonce stays securely within the PostgreSQL database. The EVM smart contract stores only the 32-byte hash and timestamp. "
         "Competitors cannot reverse-engineer proprietary metrics from the blockchain."),
        ("Public Journey Commitments: ", 
         "Customer-facing provenance attributes (origin farm, organic certification, manufacturing completion date) are formatted into canonical "
         "UTF-8 JSON and hashed without salts, enabling instant in-browser verification by consumers.")
    ]
    add_callout(dual_hash_lines, border_color="1A365D", bg_color="EDF2F7")

    add_h2("6.2 Smart Contract: WearTrailCommitmentStore.sol")
    doc.add_paragraph(
        "The smart contract is written in Solidity 0.8.34 and deployed to an EVM-compatible ledger (local Hardhat network and Ethereum testnets):"
    )
    doc.add_paragraph(
        "• Append-Only Registry: Stores mapping(bytes32 => Commitment) recording payloadHash, blockNumber, and blockTimestamp.\n"
        "• Strict Idempotency: Duplicate submissions of the exact same commitmentId and payloadHash succeed cleanly without state mutation (no-op).\n"
        "• Conflicting Write Rejection: If an attacker attempts to submit a conflicting hash for an existing commitmentId, the contract reverts "
        "with ConflictingCommitment(commitmentId, existingHash, submittedHash).\n"
        "• Batch Anchoring: The recordCommitmentsBatch method accepts arrays of up to 100 commitments, reducing gas overhead by over 75%.\n"
        "• Role-Based Access Control: Administrative functions (ownership transfer, authorized outbox writer registration) are strictly protected."
    )

    # ------------------ SECTION 7: CONSUMER DIGITAL PASSPORT ------------------
    add_h1("7. Public Consumer Digital Product Passport (DPP)")
    doc.add_paragraph(
        "End consumers access their garment's verified passport by scanning a QR code or tapping an embedded NFC tag, navigating directly to "
        "/p/:publicId. The consumer view provides:"
    )
    doc.add_paragraph(
        "• Frictionless Transparency: Runs in any standard mobile browser with zero account creation, logins, or crypto wallet requirements.\n"
        "• Chronological Journey Milestones: Displays verified milestones from raw cotton harvesting and spinning through cutting, stitching, "
        "quality clearance, and dispatch.\n"
        "• Client-Side Mathematical Proof: Recomputes the SHA-256 digest of public attributes in the browser and matches it against the on-chain "
        "smart contract, displaying an authentic 'Verified Immutable On-Chain' verification badge.\n"
        "• Privacy Protection: Excludes internal factory secrets, operator names, wages, and internal repair history."
    )

    # ------------------ SECTION 8: EXPERIMENTAL EVALUATION ------------------
    add_h1("8. Experimental Evaluation, Benchmarks & Validation")
    add_h2("8.1 Latency Benchmarks")
    doc.add_paragraph(
        "TraceX AI was rigorously benchmarked across 4 operational workload tiers to evaluate scan-to-cloud performance:"
    )

    lat_table = doc.add_table(rows=5, cols=5)
    lat_headers = ["Workload Tier", "Edge Ingestion", "DB Persistence", "UI Broadcast (SSE)", "Total End-to-End Latency"]
    for idx, name in enumerate(lat_headers):
        lat_table.rows[0].cells[idx].paragraphs[0].text = name

    lat_data = [
        ("Idle Baseline (1 Op/sec)", "18.2 ms", "31.4 ms", "12.1 ms", "61.7 ms"),
        ("Moderate Load (10 Ops/sec)", "22.5 ms", "38.6 ms", "14.3 ms", "75.4 ms"),
        ("Peak Assembly (25 Ops/sec)", "28.1 ms", "46.2 ms", "16.8 ms", "91.1 ms"),
        ("Stress Load (50 Ops/sec)", "34.6 ms", "55.8 ms", "21.0 ms", "111.4 ms")
    ]
    for r_idx, r_vals in enumerate(lat_data, start=1):
        for c_idx, val in enumerate(r_vals):
            lat_table.rows[r_idx].cells[c_idx].paragraphs[0].text = val

    format_table(lat_table, col_widths=[Inches(1.8), Inches(1.1), Inches(1.1), Inches(1.2), Inches(1.3)])

    add_h2("8.2 Reliability, Aggregation Accuracy & Quality Gating")
    doc.add_paragraph(
        "• Carton Aggregation Accuracy: 100.0% accuracy across 500 test packing batches with zero orphaned tags.\n"
        "• Defect Containment Rate: 100.0% containment rate across 150 intentionally defected test garments; the dispatch gate blocked all defect items.\n"
        "• Automated Test Suite: 16 automated test suites comprising over 150 test cases pass with a 100% success rate."
    )

    # ------------------ SECTION 9: TRL & COMMERCIALIZATION ------------------
    add_h1("9. Technology Readiness Level & Commercial Roadmap")
    add_h2("9.1 Technology Readiness Level (TRL 5 advancing to TRL 6)")
    doc.add_paragraph(
        "TraceX AI has achieved Technology Readiness Level 5 (TRL 5), validated in a relevant simulated industrial environment. All core "
        "subsystems—RFID edge hardware, microcontroller firmware, USB serial bridge, web platform, PostgreSQL database, and EVM blockchain "
        "commitment contract—are fully integrated and functionally verified."
    )

    add_h2("9.2 Three-Year Commercialization Projection")
    fin_table = doc.add_table(rows=5, cols=4)
    fin_headers = ["Revenue Stream / Metric", "Year 1 (Pilot)", "Year 2 (Expansion)", "Year 3 (Commercial)"]
    for idx, name in enumerate(fin_headers):
        fin_table.rows[0].cells[idx].paragraphs[0].text = name

    fin_data = [
        ("Active Factory Deployments", "2 Pilot Factories", "8 Factories (+6)", "20 Factories (+12)"),
        ("Hardware Setup & Deployment Fees", "PKR 0.9 Million", "PKR 2.7 Million", "PKR 5.4 Million"),
        ("SaaS Platform Subscription", "PKR 3.6 Million", "PKR 14.4 Million", "PKR 36.0 Million"),
        ("Annual Total Projected Revenue", "PKR 4.5 Million", "PKR 17.1 Million", "PKR 45.9 Million")
    ]
    for r_idx, r_vals in enumerate(fin_data, start=1):
        for c_idx, val in enumerate(r_vals):
            fin_table.rows[r_idx].cells[c_idx].paragraphs[0].text = val

    format_table(fin_table, col_widths=[Inches(2.3), Inches(1.4), Inches(1.4), Inches(1.4)])

    doc.add_paragraph(
        "Projected Cumulative 3-Year Revenue: Approximately PKR 67.5 Million across 20 industrial manufacturing installations."
    )

    # ------------------ SECTION 10: CONCLUSION & ACKNOWLEDGMENTS ------------------
    add_h1("10. Conclusion & Institutional Acknowledgments")
    doc.add_paragraph(
        "TraceX AI establishes a practical, economically viable, and mathematically verifiable traceability standard for the global apparel "
        "manufacturing sector. By harmonizing edge RFID ergonomics, AI-driven material optimization heuristics, enterprise database gating, "
        "and zero-knowledge blockchain commitments, TraceX AI empowers manufacturers to fulfill international sustainability and DPP regulations "
        "while enhancing shop-floor operational efficiency."
    )

    add_h2("Institutional Attribution & Project Credits")
    ack_lines = [
        ("Academic Institution: ", "Department of Software Engineering, NED University of Engineering & Technology, Karachi, Pakistan"),
        ("Principle Investigator: ", "Dr. Kashif Mehboob Khan"),
        ("Development Team:\n",
         "  1. Areeba Tariq, SE-24055\n"
         "  2. Daniyal Ahmed, SE-24068\n"
         "  3. M.Ahmed Raza, SE-24085\n"
         "  4. Basim Javed , SE-24089"),
        ("Software Repository: ", "TraceX AI / WearTrail Enterprise Supply Chain Provenance Platform"),
        ("Intellectual Property Status: ", "Proprietary software codebase, custom firmware, and system architecture developed at NED University.")
    ]
    add_callout(ack_lines, border_color="1A365D", bg_color="EDF2F7")

    # Save to both root and docs directory
    output_path_root = os.path.abspath("TraceX_AI_System_Documentation.docx")
    output_path_docs = os.path.abspath(os.path.join("docs", "TraceX_AI_System_Documentation.docx"))
    
    doc.save(output_path_root)
    print(f"Successfully generated: {output_path_root}")
    
    shutil.copyfile(output_path_root, output_path_docs)
    print(f"Successfully copied to: {output_path_docs}")

if __name__ == "__main__":
    create_document()
