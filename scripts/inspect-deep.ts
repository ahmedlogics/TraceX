import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";

async function main() {
  const url = process.env["MIGRATION_DATABASE_URL"] || process.env["DATABASE_URL"] || "";
  const parsed = parseConnectionString(url);
  const pool = new pg.Pool({
    host: parsed.host ?? undefined,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : undefined,
    database: parsed.database ?? undefined,
    user: parsed.user ?? undefined,
    password: parsed.password ?? undefined,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log("=== GARMENTS ===");
    const garments = await client.query("SELECT id, code, public_id, stage, quality_disposition, created_at FROM supplyease.garments ORDER BY created_at ASC");
    console.log(garments.rows);

    console.log("\n=== PACKAGES ===");
    const packages = await client.query("SELECT id, code, status, created_at FROM supplyease.packages ORDER BY created_at ASC");
    console.log(packages.rows);

    console.log("\n=== CUTTING JOBS ===");
    const jobs = await client.query("SELECT id, code, production_order_id, planned_quantity, performed_at FROM supplyease.cutting_jobs ORDER BY performed_at ASC");
    console.log(jobs.rows);

    console.log("\n=== WORK TASKS ===");
    const tasks = await client.query("SELECT id, checkpoint_code, status, subject_type, subject_id, created_at FROM supplyease.work_tasks ORDER BY created_at ASC");
    console.log(tasks.rows);

    console.log("\n=== READER SESSIONS (active) ===");
    const activeSessions = await client.query("SELECT id, device_id, station_code, reader_index, opened_at, expires_at, closed_at FROM supplyease.reader_sessions WHERE closed_at IS NULL");
    console.log(activeSessions.rows);

    console.log("\n=== STAFF USERS & CREDENTIALS ===");
    const staff = await client.query("SELECT id, username, display_name, active FROM supplyease.staff_users");
    console.log(staff.rows);

    const devCreds = await client.query("SELECT id, device_id, secret_sha256, active FROM supplyease.device_credentials");
    console.log("Device credentials:", devCreds.rows);

    const roleGrants = await client.query("SELECT staff_user_id, role_code FROM supplyease.staff_role_grants");
    console.log("Role grants:", roleGrants.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error).finally(() => process.exit(0));
