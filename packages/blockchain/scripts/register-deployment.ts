import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import pg from "pg";

// Look for .env in current directory or root repository
const candidateEnvPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

interface DeploymentMetadata {
  id: string;
  code: string;
  chain_id: number;
  network_name: string;
  contract_address: string;
  deployment_tx_hash: string;
  protocol_version: number;
  block_number?: number;
  block_hash?: string;
  registered_at?: string;
  deployer_address?: string;
  verification?: Record<string, unknown>;
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let filePath = path.resolve(process.cwd(), "deployments", "local-deployment-latest.json");
  if (!fs.existsSync(filePath)) {
    // Check relative to packages/blockchain if running from root
    const altPath = path.resolve(process.cwd(), "packages", "blockchain", "deployments", "local-deployment-latest.json");
    if (fs.existsSync(altPath)) {
      filePath = altPath;
    }
  }
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      filePath = path.resolve(process.cwd(), args[i + 1]);
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { filePath, dryRun };
}

function validateMetadata(meta: any): DeploymentMetadata {
  if (!meta.code || typeof meta.code !== "string") {
    throw new Error("Invalid deployment metadata: missing 'code'");
  }
  if (!meta.chain_id || typeof meta.chain_id !== "number") {
    throw new Error("Invalid deployment metadata: missing or non-numeric 'chain_id'");
  }
  if (!meta.contract_address || !meta.contract_address.startsWith("0x") || meta.contract_address.length !== 42) {
    throw new Error("Invalid deployment metadata: 'contract_address' must be a 42-char 0x-hex string (20 bytes)");
  }
  if (!meta.deployment_tx_hash || !meta.deployment_tx_hash.startsWith("0x") || meta.deployment_tx_hash.length !== 66) {
    throw new Error("Invalid deployment metadata: 'deployment_tx_hash' must be a 66-char 0x-hex string (32 bytes)");
  }
  if (!meta.protocol_version || meta.protocol_version < 1) {
    throw new Error("Invalid deployment metadata: 'protocol_version' must be an integer >= 1");
  }

  return meta as DeploymentMetadata;
}

function findSupabaseCert(): string | undefined {
  const candidateCertPaths = [
    path.resolve(process.cwd(), "certs", "supabase-ca.crt"),
    path.resolve(process.cwd(), "..", "certs", "supabase-ca.crt"),
    path.resolve(process.cwd(), "..", "..", "certs", "supabase-ca.crt"),
  ];

  for (const certPath of candidateCertPaths) {
    if (fs.existsSync(certPath)) {
      return fs.readFileSync(certPath, "utf-8");
    }
  }
  return undefined;
}

async function main() {
  const { filePath, dryRun } = parseCliArgs();

  console.log("============================================================");
  console.log("  WearTrail Blockchain: Deployment Registration Tool");
  console.log("============================================================\n");

  if (!fs.existsSync(filePath)) {
    console.error(`Error: Deployment file not found at: ${filePath}`);
    console.error("Please run the deployment command first: npm run deploy:local");
    process.exit(1);
  }

  const rawJson = fs.readFileSync(filePath, "utf-8");
  const metadata = validateMetadata(JSON.parse(rawJson));

  console.log(`Loaded genuine deployment metadata:`);
  console.log(`  File:             ${filePath}`);
  console.log(`  ID:               ${metadata.id}`);
  console.log(`  Code:             ${metadata.code}`);
  console.log(`  Chain ID:         ${metadata.chain_id}`);
  console.log(`  Network Name:     ${metadata.network_name}`);
  console.log(`  Contract Address: ${metadata.contract_address}`);
  console.log(`  Deployment Tx:    ${metadata.deployment_tx_hash}`);
  console.log(`  Protocol Version: ${metadata.protocol_version}\n`);

  // Bytea hex values (without '0x')
  const contractAddressHex = metadata.contract_address.slice(2).toLowerCase();
  const txHashHex = metadata.deployment_tx_hash.slice(2).toLowerCase();

  const contractAddressBuffer = Buffer.from(contractAddressHex, "hex");
  const txHashBuffer = Buffer.from(txHashHex, "hex");

  console.log("--- SQL Representation ---");
  const sqlPreview = `INSERT INTO supplyease.ledger_deployments (
  id, code, chain_id, network_name, contract_address, deployment_tx_hash, protocol_version, registered_at
) VALUES (
  '${metadata.id}'::uuid,
  '${metadata.code}',
  ${metadata.chain_id},
  '${metadata.network_name}',
  decode('${contractAddressHex}', 'hex'),
  decode('${txHashHex}', 'hex'),
  ${metadata.protocol_version},
  NOW()
)
ON CONFLICT (code) DO NOTHING
RETURNING id, code, registered_at;`;

  console.log(sqlPreview + "\n");

  if (dryRun) {
    console.log("[DRY-RUN] Registration SQL displayed. No database modifications made.");
    return;
  }

  // Use MIGRATION_DATABASE_URL (lead/admin role) if available, or DATABASE_URL
  const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("[INFO] Neither MIGRATION_DATABASE_URL nor DATABASE_URL found in environment.");
    console.log("The SQL statement above can be executed directly in the database management console.");
    return;
  }

  console.log("[DB] Attempting database registration via PostgreSQL client...");

  const ca = findSupabaseCert();
  const parsedUrl = new URL(connectionString);

  const poolConfig: pg.PoolConfig = {
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : 5432,
    database: parsedUrl.pathname.replace(/^\//, ""),
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    connectionTimeoutMillis: 10000,
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  };

  const pool = new pg.Pool(poolConfig);

  try {
    const insertQuery = `
      INSERT INTO supplyease.ledger_deployments (
        id, code, chain_id, network_name, contract_address, deployment_tx_hash, protocol_version, registered_at
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, $6, $7, NOW()
      )
      ON CONFLICT (code) DO UPDATE
      SET contract_address = EXCLUDED.contract_address,
          deployment_tx_hash = EXCLUDED.deployment_tx_hash,
          registered_at = NOW()
      RETURNING id, code, chain_id, network_name, contract_address, deployment_tx_hash, registered_at;
    `;

    const values = [
      metadata.id,
      metadata.code,
      metadata.chain_id,
      metadata.network_name,
      contractAddressBuffer,
      txHashBuffer,
      metadata.protocol_version,
    ];

    const result = await pool.query(insertQuery, values);
    console.log("[DB] Registration SUCCESSFUL!");
    const registeredRow = result.rows[0];
    console.log(`  Registered ID:     ${registeredRow.id}`);
    console.log(`  Registered Code:   ${registeredRow.code}`);
    console.log(`  Network:           ${registeredRow.network_name}`);
    console.log(`  Registered At:     ${registeredRow.registered_at}`);
  } catch (err: any) {
    console.error("[DB] Registration failed:", err.message);
    console.log("[INFO] You can run the raw SQL query above manually in your database tool.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Error during registration:", err);
  process.exit(1);
});
