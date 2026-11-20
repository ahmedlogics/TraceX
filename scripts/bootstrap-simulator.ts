/**
 * WearTrail Hardware Simulator & Workstation Seeding Script
 * Provisions the standard simulation bridge device, reader mappings, and active station sessions.
 * Allows simulated RFID scans to execute seamlessly against live factory logic.
 */
import crypto from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
import fs from "node:fs";
import pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hashDeviceSecret } from "../src/server/rfid/device-auth";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const connStr = process.env["MIGRATION_DATABASE_URL"] || process.env["DATABASE_URL"] || "";
const caPath = path.resolve(process.cwd(), "certs", "supabase-ca.crt");
const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath, "utf8") : undefined;
const parsed = parseConnectionString(connStr);

const adminPool = new pg.Pool({
  host: parsed.host ?? undefined,
  port: parsed.port ? Number.parseInt(parsed.port, 10) : undefined,
  database: parsed.database ?? undefined,
  user: parsed.user ?? undefined,
  password: parsed.password ?? undefined,
  connectionTimeoutMillis: 10000,
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
});
const adapter = new PrismaPg(adminPool, { schema: "supplyease" });
const adminPrisma = new PrismaClient({ adapter });



const SIMULATION_DEVICE_ID = process.env["TEST_DEVICE_ID"] ?? "11111111-1111-4111-a111-111111111111";
const SIMULATION_SECRET = process.env["TEST_DEVICE_SECRET"] ?? "wt_dev_secret_simulation_key_2026";

interface StationMapping {
  readerIndex: number;
  stationCode: string;
  operatorUsername: string;
  label: string;
}

const STATION_MAPPINGS: StationMapping[] = [
  { readerIndex: 0, stationCode: "fabric_receiving", operatorUsername: "receiving.demo", label: "Antenna 0 (Receiving)" },
  { readerIndex: 1, stationCode: "fabric_issue", operatorUsername: "rawstore.demo", label: "Antenna 1 (Fabric Issue)" },
  { readerIndex: 2, stationCode: "cutting", operatorUsername: "cutting.demo", label: "Antenna 2 (Cutting Table)" },
  { readerIndex: 3, stationCode: "stitching", operatorUsername: "stitching.demo", label: "Antenna 3 (Stitching Line)" },
  { readerIndex: 4, stationCode: "finishing", operatorUsername: "finishing.demo", label: "Antenna 4 (Finishing & Tagging)" },
  { readerIndex: 5, stationCode: "final_qc", operatorUsername: "qc.demo", label: "Antenna 5 (Final QA Gate)" },
  { readerIndex: 6, stationCode: "packing", operatorUsername: "packing.demo", label: "Antenna 6 (Packaging)" },
  { readerIndex: 7, stationCode: "warehouse", operatorUsername: "warehouse.demo", label: "Antenna 7 (Warehouse Inbound)" },
  { readerIndex: 8, stationCode: "dispatch", operatorUsername: "dispatch.demo", label: "Antenna 8 (Dispatch Dock)" },
];

async function runSimulatorBootstrap() {
  console.log("==================================================");
  console.log(" WearTrail RFID Hardware Simulation Provisioning");
  console.log("==================================================");

  try {
    // 0. Ensure weartrail_api runtime user has full table access on supplyease
    try {
      await adminPrisma.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA supplyease TO weartrail_api;`);
      await adminPrisma.$executeRawUnsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA supplyease TO weartrail_api;`);
      console.log("✓ Synchronized supplyease permissions for weartrail_api runtime user.");
    } catch {
      // Ignore if running on non-superuser or already granted
    }

    // 1. Get or create admin user for device registration
    const admin = await adminPrisma.staff_users.findFirst({
      where: { username: "admin.demo" },
    });
    if (!admin) {
      throw new Error("Admin user 'admin.demo' not found. Please run 'npm run db:check' and bootstrap first.");
    }

    // 2. Provision or verify simulation device
    const device = await adminPrisma.devices.upsert({
      where: { id: SIMULATION_DEVICE_ID },
      update: {
        code: "DEV-SIM-01",
        name: "Factory Floor Simulation Bridge",
        enabled: true,
      },
      create: {
        id: SIMULATION_DEVICE_ID,
        code: "DEV-SIM-01",
        name: "Factory Floor Simulation Bridge",
        enabled: true,
        registered_by: admin.id,
      },
    });
    console.log(`✓ Device '${device.name}' (${device.id}) configured and enabled.`);

    // 3. Provision device credential
    const secretDigest = new Uint8Array(hashDeviceSecret(SIMULATION_SECRET));
    const existingCred = await adminPrisma.device_credentials.findFirst({
      where: {
        device_id: device.id,
        credential_digest: secretDigest,
        revoked_at: null,
      },
    });

    if (!existingCred) {
      await adminPrisma.device_credentials.create({
        data: {
          device_id: device.id,
          credential_digest: Buffer.from(secretDigest),
          issued_by: admin.id,
          expires_at: null,
        },
      });
      console.log(`✓ Pre-shared device secret credential provisioned.`);
    } else {
      console.log(`✓ Pre-shared device secret credential verified.`);
    }

    // 4. Provision unverified mapping version first (to satisfy PostgreSQL trigger)
    let mappingVer = await adminPrisma.device_mapping_versions.findUnique({
      where: {
        device_id_version: {
          device_id: device.id,
          version: 1,
        },
      },
    });

    if (!mappingVer) {
      mappingVer = await adminPrisma.device_mapping_versions.create({
        data: {
          device_id: device.id,
          version: 1,
          created_by: admin.id,
          bench_verified_at: null,
          activated_at: null,
        },
      });
      console.log(`✓ Created initial unactivated mapping version 1.`);
    }

    // 5. If mapping version is not yet activated, insert reader mappings and activate
    if (!mappingVer.activated_at) {
      for (const mapping of STATION_MAPPINGS) {
        await adminPrisma.device_reader_mappings.upsert({
          where: {
            device_id_mapping_version_reader_index: {
              device_id: device.id,
              mapping_version: 1,
              reader_index: mapping.readerIndex,
            },
          },
          update: {
            station_code: mapping.stationCode,
            physical_label: mapping.label,
          },
          create: {
            device_id: device.id,
            mapping_version: 1,
            reader_index: mapping.readerIndex,
            station_code: mapping.stationCode,
            physical_label: mapping.label,
          },
        });
      }
      console.log(`✓ All 9 station reader antenna mappings configured.`);

      const now = new Date();
      await adminPrisma.device_mapping_versions.update({
        where: {
          device_id_version: {
            device_id: device.id,
            version: 1,
          },
        },
        data: {
          bench_verified_at: now,
          activated_at: now,
        },
      });
      console.log(`✓ Device mapping version 1 activated and bench-verified.`);
    } else {
      console.log(`✓ Device mapping version 1 is already verified and active.`);
    }

    // 7. Ensure active operator sessions for each station
    const readerExpiresAt = new Date(Date.now() + 48 * 3600 * 1000); // 48-hour valid session
    const staffSessionExpiresAt = new Date(Date.now() + 72 * 3600 * 1000); // 72-hour valid session (strictly >= reader session)

    for (const mapping of STATION_MAPPINGS) {
      const operator = await adminPrisma.staff_users.findFirst({
        where: { username: mapping.operatorUsername },
      });
      if (!operator) {
        console.warn(`[WARN] Operator '${mapping.operatorUsername}' not found. Skipping station session.`);
        continue;
      }

      // Ensure active staff_session exists for operator with sufficient lifetime
      let staffSession = await adminPrisma.staff_sessions.findFirst({
        where: {
          staff_user_id: operator.id,
          revoked_at: null,
          expires_at: { gt: readerExpiresAt },
        },
      });

      if (!staffSession) {
        staffSession = await adminPrisma.staff_sessions.create({
          data: {
            staff_user_id: operator.id,
            token_digest: new Uint8Array(crypto.randomBytes(32)),
            expires_at: staffSessionExpiresAt,
          },
        });
      }

      // Ensure reader_session exists for this station & reader index
      const existingReaderSession = await adminPrisma.reader_sessions.findFirst({
        where: {
          device_id: device.id,
          reader_index: mapping.readerIndex,
          closed_at: null,
        },
      });

      if (existingReaderSession) {
        // Close prior session: reader sessions in supplyease are immutable audit records
        await adminPrisma.reader_sessions.update({
          where: { id: existingReaderSession.id },
          data: {
            closed_at: new Date(),
            close_reason: "Refreshed by simulation bootstrap",
          },
        });
      }

      await adminPrisma.reader_sessions.create({
        data: {
          device_id: device.id,
          mapping_version: 1,
          reader_index: mapping.readerIndex,
          station_code: mapping.stationCode,
          staff_session_id: staffSession.id,
          operator_id: operator.id,
          expires_at: readerExpiresAt,
        },
      });
      console.log(`✓ Station '${mapping.stationCode.padEnd(16)}' claimed by @${operator.username} (antenna ${mapping.readerIndex})`);
    }

    console.log("\nAll 9 factory stations are fully armed, mapped, and ready for RFID scans.");
  } catch (err) {
    console.error("\n[SIMULATOR PROVISIONING FAILED]:", (err as Error).message);
    process.exit(1);
  } finally {
    await adminPrisma.$disconnect();
    await adminPool.end();
  }
}

runSimulatorBootstrap().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
