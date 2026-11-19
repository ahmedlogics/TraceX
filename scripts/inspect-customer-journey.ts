import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { getPrismaClient } from "../src/server/db/client";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  console.log("==================================================");
  console.log(" WearTrail Customer Journey & Dispatched Inspection");
  console.log("==================================================");

  const db = getPrismaClient();

  // 1. Query garments
  const garments = await db.garments.findMany({
    include: {
      public_payload_versions: true,
      cutting_jobs: true,
      package_items: {
        include: {
          packages: true,
        },
      },
    },
  });

  console.log(`Found ${garments.length} garment(s) in PostgreSQL database.\n`);

  for (const g of garments) {
    console.log(`Garment Code:   ${g.code}`);
    console.log(`Garment ID:     ${g.id}`);
    console.log(`Public ID:      ${g.public_id}`);
    console.log(`Stage:          ${g.stage}`);
    console.log(`Disposition:    ${g.quality_disposition}`);
    console.log(`Public Payload Versions: ${g.public_payload_versions.length}`);

    for (const pv of g.public_payload_versions) {
      console.log(`  - Version ${pv.version}:`);
      console.log(`    Payload SHA256: 0x${pv.payload_sha256 ? Buffer.from(pv.payload_sha256).toString("hex") : "none"}`);
      console.log(`    Payload Bytes Length: ${pv.payload_bytes ? Buffer.from(pv.payload_bytes).length : 0}`);
      console.log(`    Published At:   ${pv.published_at.toISOString()}`);

      // Check corresponding ledger_commitments
      const commitments = await db.ledger_commitments.findMany({
        where: { public_payload_id: pv.id },
      });
      console.log(`    Linked Commitments (${commitments.length}):`);
      for (const c of commitments) {
        console.log(`      * Commitment ID:      ${c.id}`);
        console.log(`        On-Chain Commit ID: 0x${Buffer.from(c.commitment_id).toString("hex")}`);
        console.log(`        Stored SHA256:      0x${Buffer.from(c.payload_sha256).toString("hex")}`);

        // Check outbox
        const outbox = await db.ledger_outbox.findFirst({
          where: { commitment_id: c.id },
        });
        if (outbox) {
          console.log(`        Outbox Status:      ${outbox.status} (attempts: ${outbox.attempt_count})`);
        } else {
          console.log(`        Outbox:             <No outbox row>`);
        }
      }
    }
    console.log("--------------------------------------------------");
  }

  // 2. Query all public_payload_versions if any are unlinked
  const allPayloads = await db.public_payload_versions.findMany();
  console.log(`Total public_payload_versions in database: ${allPayloads.length}`);

  // 3. Query all ledger_commitments
  const allCommitments = await db.ledger_commitments.findMany({
    where: { public_payload_id: { not: null } },
  });
  console.log(`Total public ledger_commitments in database: ${allCommitments.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Inspection error:", err);
  process.exit(1);
});
