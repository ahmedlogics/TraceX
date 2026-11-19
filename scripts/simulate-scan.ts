/**
 * WearTrail Standalone RFID Hardware Simulator CLI.
 *
 * Sends simulated VersionedScanEnvelope payloads through the real /api/rfid/scan endpoint
 * using configured test device credentials and reader-to-station mappings.
 *
 * Usage:
 *   npx tsx scripts/simulate-scan.ts [--station=stitching] [--uid=E280116060000204] [--action-context=<uuid>] [--url=http://localhost:4000]
 */
import { dispatchSimulatedScanHttp } from "../src/server/rfid/simulator";

const STATION_READER_INDEX: Record<string, number> = {
  fabric_receiving: 0,
  receiving: 0,
  fabric_issue: 1,
  raw_issue: 1,
  cutting: 2,
  stitching: 3,
  finishing: 4,
  final_qc: 5,
  qc: 5,
  packing: 6,
  warehouse: 7,
  dispatch: 8,
};

async function runSimulator(): Promise<void> {
  const args = process.argv.slice(2);
  const stationArg = args.find((a) => a.startsWith("--station="))?.split("=")[1] ?? "stitching";
  const uidArg = args.find((a) => a.startsWith("--uid="))?.split("=")[1] ?? "E280116060000204";
  const actionContextArg = args.find((a) => a.startsWith("--action-context="))?.split("=")[1] ?? null;
  const urlArg = args.find((a) => a.startsWith("--url="))?.split("=")[1] ?? process.env["WEARTRAIL_API_URL"] ?? "http://localhost:4000";
  const readerArg = args.find((a) => a.startsWith("--reader="))?.split("=")[1];

  const readerIndex = readerArg !== undefined ? parseInt(readerArg, 10) : (STATION_READER_INDEX[stationArg.toLowerCase()] ?? 3);

  console.log("==================================================");
  console.log(" WearTrail RFID Hardware Scan Simulator");
  console.log("==================================================");
  console.log(`Target URL:     ${urlArg}`);
  console.log(`Station:        ${stationArg} (reader index ${readerIndex})`);
  console.log(`Tag UID:        ${uidArg}`);
  if (actionContextArg) {
    console.log(`Action Context: ${actionContextArg}`);
  }

  const testSecret = process.env["TEST_DEVICE_SECRET"] ?? "wt_dev_secret_simulation_key_2026";
  const testDeviceId = process.env["TEST_DEVICE_ID"] ?? "11111111-1111-4111-a111-111111111111";

  const result = await dispatchSimulatedScanHttp({
    baseUrl: urlArg,
    deviceSecret: testSecret,
    deviceId: testDeviceId,
    readerIndex,
    mappingVersion: 1,
    tagUid: uidArg,
    actionContextId: actionContextArg,
  });

  console.log(`\nHTTP Status:    ${result.statusCode}`);
  if (result.outcome) {
    console.log("Scan Result:    COMPLETED");
    console.log(`- Outcome:      ${result.outcome.outcome}`);
    console.log(`- Outcome Code: ${result.outcome.outcomeCode}`);
    console.log(`- Station:      ${result.outcome.stationCode}`);
    console.log(`- Scan ID:      ${result.outcome.scanId}`);
    if (result.outcome.outcomeMessage) {
      console.log(`- Message:      ${result.outcome.outcomeMessage}`);
    }
    if (result.outcome.subjectCode) {
      console.log(`- Subject:      ${result.outcome.subjectKind} (${result.outcome.subjectCode})`);
    }
  } else if (result.error) {
    console.log("Scan Result:    REJECTED / FAILED");
    console.log(`- Error Code:   ${result.error.code}`);
    console.log(`- Message:      ${result.error.message}`);
    if (result.error.details) {
      console.log(`- Details:      ${JSON.stringify(result.error.details)}`);
    }
  }
}

runSimulator().catch((err) => {
  console.error("Fatal simulator error:", err);
  process.exit(1);
});
