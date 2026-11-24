async function runTests() {
  const baseUrl = "http://localhost:4000";

  // 1. Login as stitching.demo
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "stitching.demo", password: "weartrail123!" }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.token;
  console.log("Logged in:", loginData.success, "Token:", token ? "YES" : "NO");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  async function scan(uid: string, label: string) {
    console.log(`\n--- Test: ${label} (UID: ${uid}) ---`);
    const res = await fetch(`${baseUrl}/api/rfid/routine-scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ uid, stationCode: "stitching" }),
    });
    const json = await res.json();
    console.log("Status:", res.status);
    console.log("Resolution:", json.data?.resolution);
    console.log("Reject Reason:", json.data?.rejectReason);
    console.log("Outcome Message:", json.data?.outcomeMessage || json.error?.message);
    console.log("Garment:", json.data?.garmentCode);
    console.log("Next Expected Station:", json.data?.nextExpectedStation);
    return json;
  }

  // Test 1: Registered Garment (Stage 3 Approved -> Advance to Stage 5)
  await scan("04001122", "Scenario 1: Stage 3 Approved Garment (TROUSER-015)");

  // Test 2: Duplicate Scan
  await scan("04001122", "Scenario 2: Duplicate Scan (TROUSER-015)");

  // Test 3: Unknown UID
  await scan("UNKNOWN9999", "Scenario 3: Unknown Card");

  // Test 4: Incorrect Stage (Already finished)
  await scan("04B10096CFBCCC", "Scenario 4: Wrong Stage (TROUSER-006)");

  // Test 5: Active Quality Hold
  await scan("04B1013EA66562", "Scenario 5: Active Quality Hold (TROUSER-013)");
}

runTests().catch(console.error);
