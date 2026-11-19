/**
 * WearTrail Standalone RFID Hardware Simulator CLI.
 *
 * Sends simulated VersionedScanEnvelope payloads through the real /api/rfid/scan endpoint
 * using configured test device credentials.
 *
 * Usage:
 *   npx tsx scripts/simulate-scan.ts [--station final_qc|cutting|stitching] [--uid E280116060000204]
 */
import { dispatchSimulatedScanHttp } from "../src/server/rfid/simulator";

async function runSimulator(): Promise<void> {
  const args = process.argv.slice(2);
  const stationArg = args.find((a) => a.startsWith("--station="))?.split("=")[1] ?? "stitching";
  const uidArg = args.find((a) => a.startsWith("--uid="))?.split("=")[1] ?? "E280116060000204";

  console.log("==================================================");
  console.log(" WearTrail RFID Hardware Scan Simulator");
  console.log("==================================================");
  console.log(`Target Station: ${stationArg}`);
  console.log(`Tag UID:        ${uidArg}`);

  const testSecret = process.env["TEST_DEVICE_SECRET"] ?? "wt_dev_secret_simulation_key_2026";
  const testDeviceId = process.env["TEST_DEVICE_ID"] ?? "11111111-1111-4111-a111-111111111111";

  const result = await dispatchSimulatedScanHttp({
    baseUrl: process.env["WEARTRAIL_API_URL"] ?? "http://localhost:3001",
    deviceSecret: testSecret,
    deviceId: testDeviceId,
    readerIndex: 3,
    mappingVersion: 1,
    tagUid: uidArg,
  });

  console.log(`HTTP Status:    ${result.statusCode}`);
  if (result.outcome) {
    console.log("Scan Result:    SUCCESS");
    console.log(`Outcome:        ${result.outcome.outcome} (${result.outcome.outcomeCode})`);
    console.log(`Station:        ${result.outcome.stationCode}`);
  } else if (result.error) {
    console.log("Scan Result:    FAILED / REJECTED");
    console.log(`Error Code:     ${result.error.code}`);
    console.log(`Message:        ${result.error.message}`);
  }
}

if (require.main === module) {
  runSimulator().catch(console.error);
}
