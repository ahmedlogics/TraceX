import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "@prisma/config";

// Explicitly load the backend environment file (.env) from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const migrationUrl = process.env["MIGRATION_DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Lead-only CLI operations (db pull, migrate) use MIGRATION_DATABASE_URL.
    // Client generation does not require a database connection.
    ...(migrationUrl ? { url: migrationUrl } : {}),
  },
  migrations: {
    path: "prisma/migrations",
  },
});
