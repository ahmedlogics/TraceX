/**
 * WearTrail Staff Bootstrap Script
 * Safe administrative procedure for provisioning initial staff accounts into Supabase PostgreSQL.
 * Does not overwrite existing accounts.
 */
import path from "node:path";
import dotenv from "dotenv";
import { prisma, disconnectPrisma } from "../src/server/db/client";
import { bootstrapInitialAdmin } from "../src/server/auth/auth-service";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function runBootstrap() {
  const adminUsername = process.env["INITIAL_ADMIN_USERNAME"] || "admin.demo";
  const adminDisplayName = process.env["INITIAL_ADMIN_NAME"] || "System Administrator";
  const adminPassword = process.env["INITIAL_ADMIN_PASSWORD"] || "weartrail123!";

  console.log("==================================================");
  console.log(" WearTrail Staff Account Bootstrap Utility");
  console.log("==================================================");

  try {
    const user = await bootstrapInitialAdmin(prisma, {
      username: adminUsername,
      displayName: adminDisplayName,
      password: adminPassword,
    });

    console.log(`\nStaff account '${user.username}' is ready:`);
    console.log(`- ID:          ${user.id}`);
    console.log(`- Display:     ${user.displayName}`);
    console.log(`- Role:        ${user.role} (${user.department})`);
    console.log(`- Status:      ${user.status}`);
    console.log("\nBootstrap procedure completed successfully.");
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
