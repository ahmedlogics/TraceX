/**
 * WearTrail Hardware Device Provisioning Utility.
 * Idempotently registers and provisions the TexTracer ESP32 9-Reader hardware device,
 * its device credential secret, and the exact physical reader-to-station mappings.
 *
 * Preserves existing database records, unrelated devices, and never resets tables.
 *
 * Usage:
 *   npx tsx scripts/provision-hardware-device.ts [--secret=<secret>] [--force-new-version]
 */
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { prisma, disconnectPrisma } from "../src/server/db/client";
import { hashDeviceSecret } from "../src/server/rfid/device-auth";
import type { RfidStationCode } from "../src/server/contracts/rfid";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const HARDWARE_DEVICE_CODE = "DEV-TEXTRACER-01";
export const HARDWARE_DEVICE_NAME = "TexTracer ESP32 9-Reader Hardware";

/**
 * Verified Physical Wiring Mapping (0-based firmware readerIndex -> SS GPIO -> stationCode):
 * 0: GPIO 27 -> fabric_receiving
 * 1: GPIO 12 -> fabric_issue
 * 2: GPIO 15 -> final_qc
 * 3: GPIO 2  -> cutting
 * 4: GPIO 4  -> warehouse
 * 5: GPIO 16 -> finishing
 * 6: GPIO 5  -> stitching
 * 7: GPIO 17 -> packing
 * 8: GPIO 21 -> dispatch
 */
export const HARDWARE_READER_MAPPINGS: Array<{
  readerIndex: number;
  gpio: number;
  stationCode: RfidStationCode;
  label: string;
}> = [
  { readerIndex: 0, gpio: 27, stationCode: "fabric_receiving", label: "Antenna 0 (GPIO 27 - Receiving)" },
  { readerIndex: 1, gpio: 12, stationCode: "fabric_issue",     label: "Antenna 1 (GPIO 12 - Fabric Issue)" },
  { readerIndex: 2, gpio: 15, stationCode: "final_qc",         label: "Antenna 2 (GPIO 15 - Final QA Gate)" },
  { readerIndex: 3, gpio: 2,  stationCode: "cutting",          label: "Antenna 3 (GPIO 2 - Cutting Table)" },
  { readerIndex: 4, gpio: 4,  stationCode: "warehouse",        label: "Antenna 4 (GPIO 4 - Warehouse Inbound)" },
  { readerIndex: 5, gpio: 16, stationCode: "finishing",        label: "Antenna 5 (GPIO 16 - Finishing & Tagging)" },
  { readerIndex: 6, gpio: 5,  stationCode: "stitching",        label: "Antenna 6 (GPIO 5 - Stitching Line)" },
  { readerIndex: 7, gpio: 17, stationCode: "packing",          label: "Antenna 7 (GPIO 17 - Packaging)" },
  { readerIndex: 8, gpio: 21, stationCode: "dispatch",         label: "Antenna 8 (GPIO 21 - Dispatch Dock)" },
];

export async function provisionHardwareDevice(customSecret?: string): Promise<{
  deviceId: string;
  deviceCode: string;
  mappingVersion: number;
  deviceSecret: string;
  mappingsCount: number;
}> {
  console.log("==================================================");
  console.log(" WearTrail ESP32 Hardware Device Provisioning");
  console.log("==================================================");

  // 1. Resolve administrative staff user to register the device
  let adminUser = await prisma.staff_users.findFirst({
    where: {
      suspended_at: null,
      staff_role_grants_staff_role_grants_staff_user_idTostaff_users: {
        some: {
          role: "admin",
          revoked_at: null,
        },
      },
    },
    orderBy: { created_at: "asc" },
  });

  if (!adminUser) {
    adminUser = await prisma.staff_users.findFirst({
      where: { suspended_at: null },
      orderBy: { created_at: "asc" },
    });
  }

  if (!adminUser) {
    throw new Error(
      "No active staff account found. Run 'npx tsx scripts/bootstrap-staff.ts' first.",
    );
  }

  // 2. Find or register the hardware device
  let device = await prisma.devices.findUnique({
    where: { code: HARDWARE_DEVICE_CODE },
  });

  if (!device) {
    console.log(`[1/4] Registering new hardware device '${HARDWARE_DEVICE_CODE}'...`);
    device = await prisma.devices.create({
      data: {
        code: HARDWARE_DEVICE_CODE,
        name: HARDWARE_DEVICE_NAME,
        enabled: true,
        registered_by: adminUser.id,
      },
    });
    console.log(`      Device created. ID: ${device.id}`);
  } else {
    console.log(`[1/4] Found existing hardware device '${HARDWARE_DEVICE_CODE}' (ID: ${device.id}).`);
    if (!device.enabled) {
      console.log("      Enabling hardware device...");
      device = await prisma.devices.update({
        where: { id: device.id },
        data: { enabled: true },
      });
    }
  }

  // 3. Resolve or create device credential secret
  console.log("[2/4] Configuring device credentials...");
  const firmwareDir = path.resolve(process.cwd(), "firmware", "WearTrailRFID");
  const configPath = path.join(firmwareDir, "config.h");

  let existingSecretFromConfig: string | undefined;
  if (fs.existsSync(configPath)) {
    const existingContent = fs.readFileSync(configPath, "utf8");
    const secretMatch = existingContent.match(/#define\s+DEVICE_SECRET\s+"([^"]+)"/);
    if (secretMatch && secretMatch[1] && secretMatch[1] !== "REPLACE_WITH_DEVICE_SECRET") {
      existingSecretFromConfig = secretMatch[1];
    }
  }

  const rawSecret =
    customSecret ||
    existingSecretFromConfig ||
    process.env["HARDWARE_DEVICE_SECRET"] ||
    process.env["TEST_DEVICE_SECRET"] ||
    `wt_dev_secret_${crypto.randomBytes(16).toString("hex")}`;

  const secretDigest = hashDeviceSecret(rawSecret);

  // Check if active credential already exists for this secret digest
  let existingCred = await prisma.device_credentials.findFirst({
    where: {
      device_id: device.id,
      credential_digest: new Uint8Array(secretDigest),
      revoked_at: null,
    },
  });

  if (!existingCred) {
    existingCred = await prisma.device_credentials.create({
      data: {
        device_id: device.id,
        credential_digest: new Uint8Array(secretDigest),
        issued_by: adminUser.id,
        expires_at: null, // Production bench prototype credential
      },
    });
    console.log(`      Provisioned active credential record (ID: ${existingCred.id}).`);
  } else {
    console.log(`      Active credential record exists (ID: ${existingCred.id}).`);
  }

  // 4. Provision hardware reader mappings adhering to PostgreSQL trigger constraints
  console.log("[3/4] Configuring antenna-to-station reader mappings...");

  // Determine active or target mapping version
  const activeVersionRecord = await prisma.device_mapping_versions.findFirst({
    where: {
      device_id: device.id,
      activated_at: { not: null },
      retired_at: null,
    },
  });

  let targetVersion = 1;
  let needsActivation = false;

  if (activeVersionRecord) {
    // Check if active version already has all 9 matching mappings
    const currentMappings = await prisma.device_reader_mappings.findMany({
      where: {
        device_id: device.id,
        mapping_version: activeVersionRecord.version,
      },
    });

    const isCompleteAndMatching =
      currentMappings.length === HARDWARE_READER_MAPPINGS.length &&
      HARDWARE_READER_MAPPINGS.every((expected) =>
        currentMappings.some(
          (m) =>
            m.reader_index === expected.readerIndex &&
            m.station_code === expected.stationCode,
        ),
      );

    if (isCompleteAndMatching) {
      console.log(
        `      Version ${activeVersionRecord.version} is already active with all 9 correct physical reader mappings.`,
      );
      targetVersion = activeVersionRecord.version;
    } else {
      // Need a new version to satisfy reject_reader_mapping_after_activation() trigger
      targetVersion = activeVersionRecord.version + 1;
      console.log(
        `      Active version ${activeVersionRecord.version} mappings differ. Provisioning new version ${targetVersion}...`,
      );

      // Retire previous version
      await prisma.device_mapping_versions.update({
        where: {
          device_id_version: {
            device_id: device.id,
            version: activeVersionRecord.version,
          },
        },
        data: { retired_at: new Date() },
      });

      // Create new unactivated version
      await prisma.device_mapping_versions.create({
        data: {
          device_id: device.id,
          version: targetVersion,
          created_by: adminUser.id,
          bench_verified_at: null,
          activated_at: null,
        },
      });
      needsActivation = true;
    }
  } else {
    // No active version exists: create or use version 1
    const unactivatedVersion = await prisma.device_mapping_versions.findUnique({
      where: {
        device_id_version: {
          device_id: device.id,
          version: 1,
        },
      },
    });

    if (!unactivatedVersion) {
      await prisma.device_mapping_versions.create({
        data: {
          device_id: device.id,
          version: 1,
          created_by: adminUser.id,
          bench_verified_at: null,
          activated_at: null,
        },
      });
    }
    needsActivation = true;
    targetVersion = 1;
  }

  // Insert missing mappings if version is not yet activated
  if (needsActivation) {
    for (const mapping of HARDWARE_READER_MAPPINGS) {
      const exists = await prisma.device_reader_mappings.findUnique({
        where: {
          device_id_mapping_version_reader_index: {
            device_id: device.id,
            mapping_version: targetVersion,
            reader_index: mapping.readerIndex,
          },
        },
      });

      if (!exists) {
        await prisma.device_reader_mappings.create({
          data: {
            device_id: device.id,
            mapping_version: targetVersion,
            reader_index: mapping.readerIndex,
            station_code: mapping.stationCode,
            physical_label: mapping.label,
          },
        });
      }
    }

    // Now activate the version (satisfies DB trigger ordering)
    const now = new Date();
    await prisma.device_mapping_versions.update({
      where: {
        device_id_version: {
          device_id: device.id,
          version: targetVersion,
        },
      },
      data: {
        bench_verified_at: now,
        activated_at: now,
      },
    });
    console.log(`      Activated device mapping version ${targetVersion} with all 9 antennas.`);
  }

  // 5. Generate local firmware config file safely (without printing secrets to stdout)
  console.log("[4/4] Writing local firmware configuration template...");
  if (!fs.existsSync(firmwareDir)) {
    fs.mkdirSync(firmwareDir, { recursive: true });
  }

  const examplePath = path.join(firmwareDir, "config.example.h");
  const exampleContent = `// ===========================================================================
// WearTrail ESP32 Hardware Configuration Template
// Copy to config.h and fill in local Wi-Fi SSID and Password.
// Do not commit config.h to source control.
// ===========================================================================
#pragma once

// 1) 2.4 GHz Wi-Fi credentials (ESP32 does not support 5 GHz)
#define WIFI_SSID           "YOUR_2_4GHZ_WIFI_SSID"
#define WIFI_PASSWORD       "YOUR_WIFI_PASSWORD"

// 2) WearTrail Express Backend
//    Use your laptop LAN IPv4 address (ipconfig), NOT localhost.
#define BACKEND_HOST        "192.168.1.100"
#define BACKEND_PORT        4000

// 3) Hardware Device Identity & Pre-Shared Secret
#define DEVICE_ID           "${device.id}"
#define DEVICE_SECRET       "REPLACE_WITH_DEVICE_SECRET"
#define MAPPING_VERSION     ${targetVersion}

// 4) Operational Tuning
#define HTTP_TIMEOUT_MS     5000
#define REPEAT_IGNORE_MS    2000
#define QUEUE_SIZE          30
#define MAX_SEND_ATTEMPTS   40
#define READER_RECHECK_MS   30000
`;
  fs.writeFileSync(examplePath, exampleContent, "utf8");

  if (!fs.existsSync(configPath)) {
    const configContent = exampleContent.replace("REPLACE_WITH_DEVICE_SECRET", rawSecret);
    fs.writeFileSync(configPath, configContent, "utf8");
    console.log(`      Created local 'firmware/WearTrailRFID/config.h' (gitignored).`);
  } else {
    console.log(`      Existing 'firmware/WearTrailRFID/config.h' preserved.`);
  }

  console.log("\n==================================================");
  console.log(" Provisioning Summary (Sanitized)");
  console.log("==================================================");
  console.log(`- Device Code:     ${device.code}`);
  console.log(`- Device ID:       ${device.id}`);
  console.log(`- Mapping Version: ${targetVersion}`);
  console.log(`- Credential:      SHA-256 Digest registered in device_credentials`);
  console.log(`- Antenna Count:   ${HARDWARE_READER_MAPPINGS.length} physical antennas mapped`);
  console.log("==================================================\n");

  return {
    deviceId: device.id,
    deviceCode: device.code,
    mappingVersion: targetVersion,
    deviceSecret: rawSecret,
    mappingsCount: HARDWARE_READER_MAPPINGS.length,
  };
}

const isMain = process.argv[1] && (process.argv[1].endsWith("provision-hardware-device.ts") || process.argv[1].endsWith("provision-hardware-device.js"));
if (isMain) {
  provisionHardwareDevice()
    .catch((err) => {
      console.error("[PROVISIONING ERROR]:", err.message);
      process.exit(1);
    })
    .finally(disconnectPrisma);
}
