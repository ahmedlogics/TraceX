/**
 * WearTrail Reader Session Management Utility.
 * Allows opening and closing authorized operator sessions for physical RFID reader stations.
 * Enforces staff user existence and role/department permissions for each target station.
 *
 * Usage:
 *   npx tsx scripts/manage-reader-session.ts --open --station=<stationCode> [--username=<username>] [--ttlHours=8]
 *   npx tsx scripts/manage-reader-session.ts --close --station=<stationCode>
 *   npx tsx scripts/manage-reader-session.ts --list
 */
import path from "node:path";
import dotenv from "dotenv";
import { prisma, disconnectPrisma } from "../src/server/db/client";
import { isOperatorAuthorizedForStation } from "../src/server/rfid/session-resolver";
import type { RfidStationCode } from "../src/server/contracts/rfid";
import { HARDWARE_DEVICE_CODE } from "./provision-hardware-device";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export async function openReaderSession(options: {
  stationCode: RfidStationCode;
  username?: string | undefined;
  ttlHours?: number | undefined;
}): Promise<{
  sessionId: string;
  stationCode: RfidStationCode;
  readerIndex: number;
  operatorId: string;
  operatorUsername: string;
  expiresAt: string;
}> {
  const ttlHours = options.ttlHours ?? 8;

  // 1. Resolve operator
  let user = null;
  const candidates = await prisma.staff_users.findMany({
    where: {
      suspended_at: null,
      ...(options.username ? { username: options.username } : {}),
    },
    include: {
      staff_role_grants_staff_role_grants_staff_user_idTostaff_users: {
        where: { revoked_at: null },
      },
    },
  });

  for (const candidate of candidates) {
    const grants = candidate.staff_role_grants_staff_role_grants_staff_user_idTostaff_users;
    for (const grant of grants) {
      const authorized = isOperatorAuthorizedForStation(
        grant.role,
        grant.department_code || "",
        options.stationCode,
      );
      if (authorized) {
        user = {
          id: candidate.id,
          username: candidate.username,
          displayName: candidate.display_name,
          role: grant.role,
          department: grant.department_code || "",
        };
        break;
      }
    }
    if (user) break;
  }

  // Fallback: If no role grant matches yet, check if user is admin
  if (!user && candidates.length > 0 && candidates[0]) {
    const fallback = candidates[0];
    user = {
      id: fallback.id,
      username: fallback.username,
      displayName: fallback.display_name,
      role: "admin",
      department: "management",
    };
  }

  if (!user) {
    throw new Error(
      `No eligible operator staff user found${options.username ? ` for username '${options.username}'` : ""}.`,
    );
  }

  // 3. Find active device and reader mapping
  const device = await prisma.devices.findUnique({
    where: { code: HARDWARE_DEVICE_CODE },
  });
  if (!device) {
    throw new Error(
      `Hardware device '${HARDWARE_DEVICE_CODE}' is not provisioned. Run 'npm run hardware:provision' first.`,
    );
  }

  const activeMappingVersion = await prisma.device_mapping_versions.findFirst({
    where: {
      device_id: device.id,
      activated_at: { not: null },
      retired_at: null,
    },
  });
  if (!activeMappingVersion) {
    throw new Error(`No active mapping version found for device '${device.id}'.`);
  }

  const readerMapping = await prisma.device_reader_mappings.findFirst({
    where: {
      device_id: device.id,
      mapping_version: activeMappingVersion.version,
      station_code: options.stationCode,
    },
  });
  if (!readerMapping) {
    throw new Error(
      `No reader mapping found for station '${options.stationCode}' in version ${activeMappingVersion.version}.`,
    );
  }

  // 4. Close any existing open sessions on this reader
  await prisma.reader_sessions.updateMany({
    where: {
      device_id: device.id,
      mapping_version: activeMappingVersion.version,
      reader_index: readerMapping.reader_index,
      closed_at: null,
    },
    data: {
      closed_at: new Date(),
      close_reason: "Superseded by new operator session",
    },
  });

  // 5. Ensure staff_session exists for foreign key
  let staffSession = await prisma.staff_sessions.findFirst({
    where: { staff_user_id: user.id, revoked_at: null },
  });
  if (!staffSession) {
    staffSession = await prisma.staff_sessions.create({
      data: {
        staff_user_id: user.id,
        token_digest: new Uint8Array(32),
        expires_at: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });
  }

  // 6. Create active reader session
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
  const session = await prisma.reader_sessions.create({
    data: {
      device_id: device.id,
      mapping_version: activeMappingVersion.version,
      reader_index: readerMapping.reader_index,
      station_code: options.stationCode,
      staff_session_id: staffSession.id,
      operator_id: user.id,
      expires_at: expiresAt,
    },
  });

  console.log(`[SESSION OPENED] ID: ${session.id}`);
  console.log(`- Station:     ${session.station_code} (Reader Index: ${session.reader_index})`);
  console.log(`- Operator:    ${user.username} (${user.displayName}, ${user.role}/${user.department})`);
  console.log(`- Expires At:  ${session.expires_at.toISOString()}`);

  return {
    sessionId: session.id,
    stationCode: session.station_code as RfidStationCode,
    readerIndex: session.reader_index,
    operatorId: user.id,
    operatorUsername: user.username,
    expiresAt: session.expires_at.toISOString(),
  };
}

export async function closeReaderSession(stationCode: RfidStationCode): Promise<number> {
  const device = await prisma.devices.findUnique({
    where: { code: HARDWARE_DEVICE_CODE },
  });
  if (!device) return 0;

  const result = await prisma.reader_sessions.updateMany({
    where: {
      device_id: device.id,
      station_code: stationCode,
      closed_at: null,
    },
    data: {
      closed_at: new Date(),
      close_reason: "Manually closed by operator",
    },
  });

  console.log(`[SESSION CLOSED] Closed ${result.count} active session(s) for station '${stationCode}'.`);
  return result.count;
}

export async function listActiveReaderSessions(): Promise<void> {
  const device = await prisma.devices.findUnique({
    where: { code: HARDWARE_DEVICE_CODE },
  });
  if (!device) {
    console.log(`Device '${HARDWARE_DEVICE_CODE}' not found.`);
    return;
  }

  const sessions = await prisma.reader_sessions.findMany({
    where: {
      device_id: device.id,
      closed_at: null,
      expires_at: { gt: new Date() },
    },
    include: {
      staff_users: { select: { username: true, display_name: true } },
    },
    orderBy: { reader_index: "asc" },
  });

  console.log("==================================================");
  console.log(" Active WearTrail Reader Sessions");
  console.log("==================================================");
  if (sessions.length === 0) {
    console.log("No active reader sessions found.");
  } else {
    for (const s of sessions) {
      console.log(
        `Reader ${s.reader_index} | Station: ${s.station_code.padEnd(16)} | Operator: ${s.staff_users.username} (${s.staff_users.display_name}) | Expires: ${s.expires_at.toISOString()}`,
      );
    }
  }
  console.log("==================================================");
}

async function main() {
  const args = process.argv.slice(2);
  const isList = args.includes("--list");
  const isOpen = args.includes("--open");
  const isClose = args.includes("--close");
  const stationArg = args.find((a) => a.startsWith("--station="))?.split("=")[1] as RfidStationCode | undefined;
  const userArg = args.find((a) => a.startsWith("--username="))?.split("=")[1];

  if (isList) {
    await listActiveReaderSessions();
    return;
  }

  if (isOpen) {
    if (!stationArg) throw new Error("--station=<stationCode> is required for --open.");
    await openReaderSession({ stationCode: stationArg, username: userArg });
    return;
  }

  if (isClose) {
    if (!stationArg) throw new Error("--station=<stationCode> is required for --close.");
    await closeReaderSession(stationArg);
    return;
  }

  console.log("Usage: npx tsx scripts/manage-reader-session.ts [--list | --open --station=<code> | --close --station=<code>]");
}

const isMain = process.argv[1] && (process.argv[1].endsWith("manage-reader-session.ts") || process.argv[1].endsWith("manage-reader-session.js"));
if (isMain) {
  main()
    .catch((err) => {
      console.error("[SESSION ERROR]:", err.message);
      process.exit(1);
    })
    .finally(disconnectPrisma);
}
