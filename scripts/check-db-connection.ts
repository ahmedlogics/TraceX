import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import pg from "pg";

// Ensure backend .env is loaded
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function maskConnectionString(urlStr?: string): string {
  if (!urlStr) return "<empty>";
  try {
    const parsed = new URL(urlStr);
    if (parsed.password) {
      parsed.password = "******";
    }
    return parsed.toString();
  } catch {
    return "<malformed URL>";
  }
}

async function runCheck() {
  const databaseUrl = process.env["DATABASE_URL"];
  const migrationUrl = process.env["MIGRATION_DATABASE_URL"];

  console.log("==================================================");
  console.log(" WearTrail Server Database Connectivity Check");
  console.log("==================================================");
  console.log(`DATABASE_URL configured: ${databaseUrl ? "Yes (" + maskConnectionString(databaseUrl) + ")" : "No (Empty)"}`);
  console.log(`MIGRATION_DATABASE_URL configured: ${migrationUrl ? "Yes (" + maskConnectionString(migrationUrl) + ")" : "No (Empty)"}`);

  if (!databaseUrl) {
    console.warn("\n[PENDING] DATABASE_URL is not set in .env.");
    console.warn("Please populate DATABASE_URL with the restricted 'weartrail_api' runtime connection string.");
    process.exit(1);
  }

  const caPath = path.resolve(process.cwd(), "certs", "supabase-ca.crt");
  const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath, "utf8") : undefined;

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10000,
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  });

  try {
    console.log("\nAttempting connection to PostgreSQL database...");
    const client = await pool.connect();

    try {
      // 1. Check database server session metadata
      const res = await client.query(`
        SELECT
          current_database() AS db_name,
          current_user AS session_user,
          current_schema() AS active_schema,
          to_regnamespace('supplyease') AS supplyease_namespace
      `);
      const row = res.rows[0] as {
        db_name: string;
        session_user: string;
        active_schema: string;
        supplyease_namespace: string | null;
      };

      console.log("\nConnection SUCCESSFUL!");
      console.log(`- Database Name:       ${row.db_name}`);
      console.log(`- Database User:       ${row.session_user}`);
      console.log(`- Active Schema:       ${row.active_schema}`);
      console.log(`- SupplyEase Schema:   ${row.supplyease_namespace ? "Detected ('supplyease')" : "NOT FOUND"}`);

      // 2. Count tables in supplyease schema without reading business records
      if (row.supplyease_namespace) {
        const tableCountRes = await client.query(`
          SELECT count(*)::int AS count
          FROM information_schema.tables
          WHERE table_schema = 'supplyease'
        `);
        const tableCount = (tableCountRes.rows[0] as { count: number }).count;
        console.log(`- Tables in supplyease: ${tableCount}`);
      }

      console.log("\nTesting Prisma Client ORM query on 'supplyease' schema...");
      const { prisma, disconnectPrisma } = await import("../src/server/db/client");
      const stationCount = await prisma.rfid_stations.count();
      console.log(`- Prisma Client query SUCCESS: ${stationCount} stations found in rfid_stations.`);
      await disconnectPrisma();

      console.log("\nSanitized check completed with zero errors.");
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error("\n[CONNECTION FAILED]");
    console.error(`Error Code:    ${(error as { code?: string }).code || "UNKNOWN"}`);
    console.error(`Error Message: ${error.message}`);
    console.error("\nTroubleshooting tips:");
    console.error("1. Confirm the Supabase Session Pooler host (port 5432) is used for IPv4 networks.");
    console.error("2. Verify the username includes your project ref (e.g., 'weartrail_api.your-project-ref').");
    console.error("3. Ensure the password does not contain unescaped special characters.");
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runCheck().catch((e) => {
  console.error("Fatal error during check:", (e as Error).message);
  process.exit(1);
});

