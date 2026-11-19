/**
 * WearTrail Staff Bootstrap Script
 * Safe administrative procedure for provisioning initial staff accounts into Supabase PostgreSQL.
 * Provisions role-appropriate demo accounts for each station without overwriting custom passwords.
 */
import path from "node:path";
import dotenv from "dotenv";
import { prisma, disconnectPrisma } from "../src/server/db/client";
import { hashPassword } from "../src/server/auth/crypto";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

interface SeedUserSpec {
  username: string;
  displayName: string;
  role: "admin" | "manager" | "materials" | "production" | "quality" | "logistics";
  departmentCode: string | null;
}

const SEED_USERS: SeedUserSpec[] = [
  { username: "admin.demo", displayName: "System Administrator", role: "admin", departmentCode: null },
  { username: "manager.demo", displayName: "Factory Operations Manager", role: "manager", departmentCode: null },
  { username: "receiving.demo", displayName: "Receiving Inspector", role: "materials", departmentCode: "receiving" },
  { username: "rawstore.demo", displayName: "Raw Store & Issue Associate", role: "materials", departmentCode: "raw_store" },
  { username: "cutting.demo", displayName: "Cutting Table Lead", role: "production", departmentCode: "cutting" },
  { username: "stitching.demo", displayName: "Stitching Line Operator", role: "production", departmentCode: "stitching" },
  { username: "finishing.demo", displayName: "Finishing & Tagging Lead", role: "production", departmentCode: "finishing" },
  { username: "qc.demo", displayName: "Final QA Inspector", role: "quality", departmentCode: "quality" },
  { username: "packing.demo", displayName: "Packaging Station Operator", role: "logistics", departmentCode: "packing" },
  { username: "warehouse.demo", displayName: "Warehouse Associate", role: "logistics", departmentCode: "warehouse" },
  { username: "dispatch.demo", displayName: "Dispatch & Freight Agent", role: "logistics", departmentCode: "dispatch" },
];

async function runBootstrap() {
  const defaultPassword = process.env["INITIAL_ADMIN_PASSWORD"] || "weartrail123!";

  console.log("==================================================");
  console.log(" WearTrail Staff Accounts Bootstrap Utility");
  console.log("==================================================");
  console.log(`Default prototype password configured for all accounts.\n`);

  try {
    for (const spec of SEED_USERS) {
      const cleanUsername = spec.username.trim().toLowerCase();
      const hashedPassword = await hashPassword(defaultPassword);
      const now = new Date();

      // Upsert staff user with active status and activated_at timestamp
      const user = await prisma.staff_users.upsert({
        where: { username: cleanUsername },
        update: {
          display_name: spec.displayName,
          suspended_at: null,
          activated_at: now,
        },
        create: {
          username: cleanUsername,
          display_name: spec.displayName,
          password_hash: hashedPassword,
          activated_at: now,
        },
      });

      // If user had no password hash, ensure password is set
      if (!user.password_hash) {
        await prisma.staff_users.update({
          where: { id: user.id },
          data: { password_hash: hashedPassword, activated_at: now },
        });
      }

      // Check active role grant
      const activeGrant = await prisma.staff_role_grants.findFirst({
        where: {
          staff_user_id: user.id,
          role: spec.role,
          department_code: spec.departmentCode,
          revoked_at: null,
        },
      });

      if (!activeGrant) {
        await prisma.staff_role_grants.create({
          data: {
            staff_user_id: user.id,
            role: spec.role,
            department_code: spec.departmentCode,
          },
        });
      }

      console.log(`✓ [${spec.role.padEnd(10)}] @${cleanUsername.padEnd(16)} - ${spec.displayName} (dept: ${spec.departmentCode ?? "ALL"})`);
    }

    // Also grant receiving.demo secondary access to raw_store for multi-station flexibility
    const receivingUser = await prisma.staff_users.findUnique({ where: { username: "receiving.demo" } });
    if (receivingUser) {
      const hasRawStore = await prisma.staff_role_grants.findFirst({
        where: { staff_user_id: receivingUser.id, role: "materials", department_code: "raw_store", revoked_at: null },
      });
      if (!hasRawStore) {
        await prisma.staff_role_grants.create({
          data: { staff_user_id: receivingUser.id, role: "materials", department_code: "raw_store" },
        });
        console.log(`✓ [materials ] @receiving.demo   - Added secondary grant for dept: raw_store`);
      }
    }

    console.log("\nAll standard factory role accounts verified and ready for testing.");
  } catch (err) {
    console.error("\n[BOOTSTRAP FAILED]:", (err as Error).message);
    process.exit(1);
  } finally {
    await disconnectPrisma();
  }
}

runBootstrap().catch((err) => {
  console.error("Fatal error during bootstrap:", err);
  process.exit(1);
});
