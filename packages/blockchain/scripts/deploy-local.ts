import { network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("============================================================");
  console.log("  WearTrail Blockchain: Local Deployment & Verification");
  console.log("============================================================\n");

  const { ethers } = await network.create();
  const provider = ethers.provider;

  // 1. Check network connection
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  console.log(`[1/5] Connected to network: chainId = ${chainId}`);

  // 2. Resolve deployer signer
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No available signers found on RPC provider.");
  }
  const deployer = signers[0];
  const balance = await provider.getBalance(deployer.address);
  console.log(`[2/5] Deployer: ${deployer.address}`);
  console.log(`      Balance:  ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    throw new Error("Deployer account has 0 ETH balance.");
  }

  // 3. Deploy WearTrailCommitmentStore
  console.log("[3/5] Deploying WearTrailCommitmentStore contract...");
  const factory = await ethers.getContractFactory("WearTrailCommitmentStore", deployer);
  const store = await factory.deploy(deployer.address);
  await store.waitForDeployment();

  const contractAddress = await store.getAddress();
  const deployTx = store.deploymentTransaction();
  if (!deployTx) {
    throw new Error("Failed to retrieve deployment transaction.");
  }

  const receipt = await deployTx.wait();
  if (!receipt) {
    throw new Error("Failed to retrieve deployment transaction receipt.");
  }

  const deploymentTxHash = receipt.hash;
  const blockNumber = receipt.blockNumber;
  const block = await provider.getBlock(blockNumber);
  const blockHash = block?.hash || "";

  console.log(`      Contract Address:    ${contractAddress}`);
  console.log(`      Deployment Tx Hash:  ${deploymentTxHash}`);
  console.log(`      Block Number:        ${blockNumber}`);
  console.log(`      Gas Used:            ${receipt.gasUsed.toString()}\n`);

  // 4. Verification: Bytecode & Live Write/Read Round-Trip
  console.log("[4/5] Verifying deployment on live local node...");

  // 4a. Bytecode check
  const deployedBytecode = await provider.getCode(contractAddress);
  if (!deployedBytecode || deployedBytecode === "0x" || deployedBytecode.length <= 2) {
    throw new Error(`Deployment verification failed: no bytecode found at ${contractAddress}`);
  }
  console.log("      [PASS] Deployed bytecode verified (non-empty).");

  // 4b. Live write/read round trip
  const testCommitmentId = ethers.hexlify(ethers.randomBytes(32));
  const testPayloadHash = ethers.hexlify(crypto.createHash("sha256").update("weartrail-verification-payload").digest());

  console.log(`      Writing verification commitment:`);
  console.log(`        ID:   ${testCommitmentId}`);
  console.log(`        Hash: ${testPayloadHash}`);

  const writeTx = await store.recordCommitment(testCommitmentId, testPayloadHash);
  const writeReceipt = await writeTx.wait();
  console.log(`      [PASS] Write transaction confirmed (block ${writeReceipt?.blockNumber}).`);

  // Read back
  const hasCommitment = await store.hasCommitment(testCommitmentId);
  if (!hasCommitment) {
    throw new Error("Round-trip failed: hasCommitment returned false.");
  }

  const [retrievedHash, recBlockNum, recTimestamp] = await store.getCommitment(testCommitmentId);
  if (retrievedHash !== testPayloadHash) {
    throw new Error(`Round-trip failed: retrieved hash ${retrievedHash} != ${testPayloadHash}`);
  }
  console.log(`      [PASS] Retrieval verified (retrievedHash matches).`);

  // Idempotency verification on live node
  const retryTx = await store.recordCommitment(testCommitmentId, testPayloadHash);
  await retryTx.wait();
  console.log(`      [PASS] Idempotent retry verified (succeeded without error).\n`);

  // 5. Generate genuine deployment metadata matching PostgreSQL schema
  console.log("[5/5] Recording deployment metadata matching database schema...");

  // Create a unique deployment code that distinguishes deployments after local chain resets
  // even when chain_id and contract_address repeat (e.g. Account 0 deploying at nonce 0)
  const timestampStr = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  const shortHash = deploymentTxHash.slice(2, 10);
  const prefix = process.env.DEPLOYMENT_CODE_PREFIX || "local-hardhat";
  const deploymentCode = `${prefix}-${timestampStr}-${shortHash}`;
  const deploymentId = crypto.randomUUID();

  const metadata = {
    id: deploymentId,
    code: deploymentCode,
    chain_id: chainId,
    network_name: "hardhat-local",
    contract_address: contractAddress,
    deployment_tx_hash: deploymentTxHash,
    protocol_version: 1,
    block_number: Number(blockNumber),
    block_hash: blockHash,
    registered_at: new Date().toISOString(),
    deployer_address: deployer.address,
    verification: {
      bytecode_verified: true,
      round_trip_verified: true,
      idempotency_verified: true,
      test_commitment_id: testCommitmentId,
      test_payload_hash: testPayloadHash,
    },
  };

  const deploymentsDir = path.resolve(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const latestPath = path.join(deploymentsDir, "local-deployment-latest.json");
  const specificPath = path.join(deploymentsDir, `deployment-${deploymentCode}.json`);

  fs.writeFileSync(latestPath, JSON.stringify(metadata, null, 2), "utf-8");
  fs.writeFileSync(specificPath, JSON.stringify(metadata, null, 2), "utf-8");

  console.log(`      Metadata written to:`);
  console.log(`        - ${latestPath}`);
  console.log(`        - ${specificPath}\n`);

  console.log("============================================================");
  console.log("  DEPLOYMENT SUCCESSFUL & FULLY VERIFIED");
  console.log("============================================================\n");
  console.log("GENUINE DEPLOYMENT METADATA:");
  console.log(`  Deployment ID:       ${deploymentId}`);
  console.log(`  Deployment Code:     ${deploymentCode}`);
  console.log(`  Chain ID:            ${chainId}`);
  console.log(`  Contract Address:    ${contractAddress}`);
  console.log(`  Deployment Tx Hash:  ${deploymentTxHash}`);
  console.log(`  Protocol Version:    1\n`);

  console.log("EXPLICIT REGISTRATION COMMAND FOR LEAD:");
  console.log(`  npm run register:deployment -- --file ./deployments/local-deployment-latest.json\n`);

  console.log("RAW POSTGRESQL INSERT FOR DIRECT DB EXECUTION:");
  console.log(`  INSERT INTO supplyease.ledger_deployments (`);
  console.log(`    id, code, chain_id, network_name, contract_address, deployment_tx_hash, protocol_version, registered_at`);
  console.log(`  ) VALUES (`);
  console.log(`    '${deploymentId}'::uuid,`);
  console.log(`    '${deploymentCode}',`);
  console.log(`    ${chainId},`);
  console.log(`    'hardhat-local',`);
  console.log(`    decode('${contractAddress.slice(2)}', 'hex'),`);
  console.log(`    decode('${deploymentTxHash.slice(2)}', 'hex'),`);
  console.log(`    1,`);
  console.log(`    NOW()`);
  console.log(`  );\n`);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
