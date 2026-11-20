// ===========================================================================
// WearTrail - ESP32 9-Reader RFID Workstation Firmware
//
// Implements the authenticated WearTrail VersionedScanEnvelope (v1) contract,
// device credential authentication (X-Device-Secret), decision-first action
// context polling & acknowledgement, bounded retry queue, and honest 4-stage
// status tracking (Detected -> Transmitted -> Processed -> Committed/Rejected).
//
// Compatible with the 9x MFRC522 SPI hardware board (SS pins: 27,12,15,2,4,16,5,17,21).
// Preserves exact ESP32 wiring and pinout.
// ===========================================================================
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>

#include "config.h"

// ===========================================================================
// PIN DEFINITIONS (Exact hardware layout: 9 physical reader stations)
// ===========================================================================
#define SS_PIN1  27  // Reader 0: fabric_receiving
#define SS_PIN2  12  // Reader 1: fabric_issue
#define SS_PIN3  15  // Reader 2: final_qc
#define SS_PIN4  2   // Reader 3: cutting
#define SS_PIN5  4   // Reader 4: warehouse
#define SS_PIN6  16  // Reader 5: finishing
#define SS_PIN7  5   // Reader 6: stitching
#define SS_PIN8  17  // Reader 7: packing
#define SS_PIN9  21  // Reader 8: dispatch
#define SS_SPARE 22  // Spare / unallocated

#define RST_PIN1 26
#define SCK_PIN  18
#define MOSI_PIN 23
#define MISO_PIN 19

const byte NUM_READERS = 9;

const int SS_PINS[NUM_READERS] = {
  SS_PIN1, SS_PIN2, SS_PIN3, SS_PIN4,
  SS_PIN5, SS_PIN6, SS_PIN7, SS_PIN8, SS_PIN9
};

const char* const STATION_NAMES[NUM_READERS] = {
  "fabric_receiving",
  "fabric_issue",
  "final_qc",
  "cutting",
  "warehouse",
  "finishing",
  "stitching",
  "packing",
  "dispatch"
};

// ===========================================================================
// DATA TYPES & DELIVERY OUTCOMES
// ===========================================================================
enum Outcome {
  OUT_COMMITTED_ACCEPTED, // Scan processed and domain transaction committed
  OUT_COMMITTED_REJECTED, // Processed by rule engine, logged as rejected (no mutation)
  OUT_COMMITTED_DUPLICATE,// Idempotent replay of already-committed scan
  OUT_DROP_CONFLICT,      // 409 Conflict: identity reuse with differing payload
  OUT_DROP_BAD_SECRET,    // 401 Unauthorized: bad device secret
  OUT_DROP_BAD_REQUEST,   // 400 / 404 / 422 permanent failure: not retried
  OUT_RETRY               // Transport failure / 429 / 5xx: keep in queue and retry
};

struct HttpResult {
  bool transportOk = false;
  int  status = 0;
  int  retryAfterSec = 0;
  String body;
};

struct ArmedContext {
  String contextId;
  String actionCode;
  String status;
  unsigned long expiresAtMs = 0;
  bool isAcknowledged = false;
};

struct PendingScan {
  String scanId;
  String bootId;
  unsigned long sequence;
  byte   readerIndex;
  String tagUid;
  String actionContextId;  // Captured at scan time; preserved through all retries
  time_t scanEpoch;
  unsigned long deviceUptimeMs;
  byte   attempts;
  unsigned long nextTryMs;
};

// ===========================================================================
// WEARTRAIL ESP32 HARDWARE FACADE
// ===========================================================================
class WearTrailHardware {
  private:
    static WearTrailHardware* instance;

    MFRC522* mfrc522[NUM_READERS];
    bool readerOk[NUM_READERS];
    unsigned long totalScans[NUM_READERS] = {0};
    String lastUid[NUM_READERS];
    unsigned long lastUidMs[NUM_READERS] = {0};

    // Reader action contexts armed by workstation UI
    ArmedContext armedContexts[NUM_READERS];

    // Bounded FIFO retry queue
    PendingScan queue[QUEUE_SIZE];
    int qHead = 0;
    int qCount = 0;

    // Device boot & sequence identity
    String bootId;
    unsigned long globalSequence = 0;

    // Connectivity & timing
    bool wasConnected = false;
    bool ntpStarted = false;
    unsigned long lastWifiTryMs = 0;
    unsigned long lastWaitMsgMs = 0;
    unsigned long lastReaderCheckMs = 0;
    unsigned long lastContextPollMs = 0;

    // Small JSON helper
    static String jsonStr(const String& body, const char* key) {
      String pat = String("\"") + key + "\":\"";
      int s = body.indexOf(pat);
      if (s < 0) return "";
      s += pat.length();
      String out;
      for (int i = s; i < (int)body.length(); i++) {
        char c = body[i];
        if (c == '\\' && i + 1 < (int)body.length()) { out += body[++i]; continue; }
        if (c == '"') break;
        out += c;
      }
      return out;
    }

    static bool clockValid() { return time(nullptr) > 1700000000; }

    static String isoUtc(time_t t) {
      struct tm tmv;
      gmtime_r(&t, &tmv);
      char b[32];
      strftime(b, sizeof(b), "%Y-%m-%dT%H:%M:%SZ", &tmv);
      return String(b);
    }

    String baseUrl() {
      return String("http://") + BACKEND_HOST + ":" + String(BACKEND_PORT) + "/api/rfid";
    }

    void selectReader(int r) {
      for (int i = 0; i < NUM_READERS; i++) digitalWrite(SS_PINS[i], HIGH);
      digitalWrite(SS_PINS[r], LOW);
      delayMicroseconds(100);
    }

    void deselectReader(int r) {
      digitalWrite(SS_PINS[r], HIGH);
    }

    bool chipAnswers(int r) {
      selectReader(r);
      byte v = mfrc522[r]->PCD_ReadRegister(MFRC522::VersionReg);
      deselectReader(r);
      return v != 0x00 && v != 0xFF;
    }

    byte chipVersion(int r) {
      selectReader(r);
      byte v = mfrc522[r]->PCD_ReadRegister(MFRC522::VersionReg);
      deselectReader(r);
      return v;
    }

    String getUID(int r) {
      String uid = "";
      for (byte i = 0; i < mfrc522[r]->uid.size; i++) {
        byte b = mfrc522[r]->uid.uidByte[i];
        if (b < 0x10) uid += "0";
        uid += String(b, HEX);
      }
      uid.toUpperCase();
      return uid;
    }

  public:
    void init() {
      Serial.begin(115200);
      delay(1000);
      Serial.println();
      Serial.println("==================================================");
      Serial.println(" WearTrail ESP32 9-Reader Hardware Controller");
      Serial.println(" Firmware Version: v1.0.0 (WearTrail RFC Contract)");
      Serial.println("==================================================");

      // Generate stable boot ID: "boot-" + last 6 hex chars of MAC
      uint8_t mac[6];
      WiFi.macAddress(mac);
      char buf[32];
      snprintf(buf, sizeof(buf), "boot-%02x%02x%02x", mac[3], mac[4], mac[5]);
      bootId = String(buf);
      Serial.print("[BOOT] Boot Identifier : "); Serial.println(bootId);
      Serial.print("[BOOT] Configured Device: "); Serial.println(DEVICE_ID);
      Serial.print("[BOOT] Mapping Version  : "); Serial.println(MAPPING_VERSION);
      Serial.print("[BOOT] Backend Host     : "); Serial.print(BACKEND_HOST); Serial.print(":"); Serial.println(BACKEND_PORT);

      // Initialize SPI bus and readers
      SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN);

      for (int i = 0; i < NUM_READERS; i++) {
        pinMode(SS_PINS[i], OUTPUT);
        digitalWrite(SS_PINS[i], HIGH);
        mfrc522[i] = new MFRC522(SS_PINS[i], RST_PIN1);
        readerOk[i] = false;
      }

      int readyCount = 0;
      for (int i = 0; i < NUM_READERS; i++) {
        mfrc522[i]->PCD_Init();
        delay(50);
        Serial.print("Reader #"); Serial.print(i);
        Serial.print(" (GPIO "); Serial.print(SS_PINS[i]);
        Serial.print(" -> "); Serial.print(STATION_NAMES[i]); Serial.print("): ");
        if (chipAnswers(i)) {
          readerOk[i] = true;
          readyCount++;
          Serial.print("ONLINE (MFRC522 VersionReg: 0x");
          Serial.print(chipVersion(i), HEX); Serial.println(")");
        } else {
          Serial.println("NO ANSWER (Check wiring/power). Will retry periodically.");
        }
      }

      Serial.println("--------------------------------------------------");
      Serial.print("Ready Antennas: "); Serial.print(readyCount);
      Serial.print(" of "); Serial.println(NUM_READERS);
      Serial.println("--------------------------------------------------");

      // Wi-Fi connection
      connectWifi();
    }

    void connectWifi() {
      WiFi.mode(WIFI_STA);
      WiFi.setAutoReconnect(true);
      Serial.print("[WIFI] Connecting to SSID '"); Serial.print(WIFI_SSID); Serial.print("' ");
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

      unsigned long t0 = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
        delay(500);
        Serial.print(".");
      }
      Serial.println();

      if (WiFi.status() == WL_CONNECTED) {
        Serial.print("[WIFI] Connected! Assigned IP: "); Serial.println(WiFi.localIP());
        wasConnected = true;
        if (!ntpStarted) {
          configTime(0, 0, "pool.ntp.org", "time.google.com");
          ntpStarted = true;
        }
      } else {
        Serial.println("[WIFI] Connection pending. Scans will queue in memory until Wi-Fi connects.");
        wasConnected = false;
      }
    }

    void maintainWifi() {
      bool up = (WiFi.status() == WL_CONNECTED);
      if (up && !wasConnected) {
        Serial.print("[WIFI] Reconnected. IP: "); Serial.println(WiFi.localIP());
        if (!ntpStarted) {
          configTime(0, 0, "pool.ntp.org", "time.google.com");
          ntpStarted = true;
        }
      } else if (!up && wasConnected) {
        Serial.println("[WIFI] Disconnected! Entering offline queue buffering mode.");
      }
      wasConnected = up;

      if (!up && millis() - lastWifiTryMs > 10000) {
        lastWifiTryMs = millis();
        Serial.println("[WIFI] Attempting reconnect...");
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      }
    }

    void maintainReaders() {
      if (millis() - lastReaderCheckMs < READER_RECHECK_MS) return;
      lastReaderCheckMs = millis();

      for (int i = 0; i < NUM_READERS; i++) {
        bool answering = chipAnswers(i);
        if (readerOk[i] && !answering) {
          readerOk[i] = false;
          Serial.print("[READER] #"); Serial.print(i); Serial.println(" stopped answering.");
        } else if (!readerOk[i]) {
          mfrc522[i]->PCD_Init();
          delay(50);
          if (chipAnswers(i)) {
            readerOk[i] = true;
            Serial.print("[READER] #"); Serial.print(i); Serial.println(" is back online.");
          }
        }
      }
    }

    // =======================================================================
    // ACTION CONTEXT POLLING & ACKNOWLEDGEMENT
    // =======================================================================
    void pollActionContexts() {
      if (WiFi.status() != WL_CONNECTED) return;
      if (millis() - lastContextPollMs < 2000) return; // Poll every 2 seconds
      lastContextPollMs = millis();

      HTTPClient http;
      http.setTimeout(2500);
      String url = baseUrl() + "/context/active?deviceId=" + DEVICE_ID;
      http.begin(url);
      http.addHeader("X-Device-Secret", DEVICE_SECRET);
      http.addHeader("Accept", "application/json");

      int code = http.GET();
      if (code == 200) {
        String body = http.getString();

        // Check if any context requires acknowledgement or update
        // Minimal parser looking for active context blocks
        for (int r = 0; r < NUM_READERS; r++) {
          String rdrPat = String("\"readerIndex\":") + r;
          int rIdx = body.indexOf(rdrPat);
          if (rIdx >= 0) {
            int blockEnd = body.indexOf("}", rIdx);
            String block = body.substring(rIdx, blockEnd > 0 ? blockEnd : body.length());

            String ctxId = jsonStr(block, "contextId");
            String actCode = jsonStr(block, "actionCode");
            String status = jsonStr(block, "status");

            if (ctxId.length() > 0 && ctxId != "null") {
              if (armedContexts[r].contextId != ctxId) {
                armedContexts[r].contextId = ctxId;
                armedContexts[r].actionCode = actCode;
                armedContexts[r].status = status;
                armedContexts[r].isAcknowledged = (status == "armed" || status == "ready");

                Serial.print("[CONTEXT] Reader #"); Serial.print(r);
                Serial.print(" ("); Serial.print(STATION_NAMES[r]);
                Serial.print(") assigned Context ID: "); Serial.print(ctxId);
                Serial.print(" [Action: "); Serial.print(actCode); Serial.println("]");

                // Acknowledge context if awaiting ack
                if (status == "awaiting_ack") {
                  acknowledgeContext(ctxId, r);
                }
              }
            } else {
              if (armedContexts[r].contextId.length() > 0) {
                Serial.print("[CONTEXT] Reader #"); Serial.print(r);
                Serial.println(" armed context cleared/expired.");
                armedContexts[r].contextId = "";
              }
            }
          }
        }
      }
      http.end();
    }

    void acknowledgeContext(const String& contextId, int readerIndex) {
      HTTPClient http;
      http.setTimeout(2500);
      String url = baseUrl() + "/device/contexts/" + contextId + "/ack";
      http.begin(url);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("X-Device-Secret", DEVICE_SECRET);

      String body = "{\"deviceId\":\"" + String(DEVICE_ID) + "\",\"readerIndex\":" + String(readerIndex) + "}";
      int code = http.POST(body);
      if (code == 200) {
        armedContexts[readerIndex].status = "armed";
        armedContexts[readerIndex].isAcknowledged = true;
        Serial.print("[ACK] Reader #"); Serial.print(readerIndex);
        Serial.println(" acknowledged and armed ready for card scan.");
      }
      http.end();
    }

    // =======================================================================
    // ENQUEUE & RETRY DISPATCH PIPELINE
    // =======================================================================
    bool enqueueScan(int r, const String& uid, time_t epoch) {
      if (qCount >= QUEUE_SIZE) {
        Serial.println("[QUEUE] Overflow! Oldest unconfirmed scan dropped.");
        popQueue();
      }

      globalSequence++;
      String scanId = bootId + ":" + String(globalSequence);

      PendingScan& p = queue[(qHead + qCount) % QUEUE_SIZE];
      p.scanId = scanId;
      p.bootId = bootId;
      p.sequence = globalSequence;
      p.readerIndex = r;
      p.tagUid = uid;

      // Capture currently armed context for this reader (or null)
      p.actionContextId = armedContexts[r].contextId;
      p.scanEpoch = epoch;
      p.deviceUptimeMs = millis();
      p.attempts = 0;
      p.nextTryMs = 0;

      // Consume armed context locally once captured
      if (armedContexts[r].contextId.length() > 0) {
        Serial.print("[CONTEXT] Bound Context '"); Serial.print(p.actionContextId);
        Serial.println("' to scan envelope.");
        armedContexts[r].contextId = "";
      }

      qCount++;
      return true;
    }

    void popQueue() {
      queue[qHead].tagUid = "";
      qHead = (qHead + 1) % QUEUE_SIZE;
      qCount--;
    }

    HttpResult postScan(const PendingScan& p) {
      HttpResult res;
      HTTPClient http;
      http.setTimeout(HTTP_TIMEOUT_MS);
      http.begin(baseUrl() + "/scan");
      http.addHeader("Content-Type", "application/json");
      http.addHeader("X-Device-Secret", DEVICE_SECRET);
      http.addHeader("X-Device-Id", DEVICE_ID);

      const char* hdrs[] = {"Retry-After"};
      http.collectHeaders(hdrs, 1);

      // Construct VersionedScanEnvelope v1
      String json = "{";
      json += "\"version\":\"v1\",";
      json += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
      json += "\"scanId\":\"" + p.scanId + "\",";
      json += "\"bootId\":\"" + p.bootId + "\",";
      json += "\"sequence\":" + String(p.sequence) + ",";
      json += "\"readerIndex\":" + String(p.readerIndex) + ",";
      json += "\"mappingVersion\":" + String(MAPPING_VERSION) + ",";
      json += "\"tagUid\":\"" + p.tagUid + "\",";
      if (p.actionContextId.length() > 0) {
        json += "\"actionContextId\":\"" + p.actionContextId + "\",";
      } else {
        json += "\"actionContextId\":null,";
      }
      json += "\"deviceUptimeMs\":" + String(p.deviceUptimeMs);
      if (p.scanEpoch) {
        json += ",\"timestamp\":\"" + isoUtc(p.scanEpoch) + "\"";
      }
      json += "}";

      int code = http.POST(json);
      res.status = code;
      if (code > 0) {
        res.transportOk = true;
        res.body = http.getString();
        String ra = http.header("Retry-After");
        if (ra.length()) res.retryAfterSec = ra.toInt();
      }
      http.end();
      return res;
    }

    Outcome interpretResponse(const PendingScan& p, const HttpResult& h) {
      if (!h.transportOk) {
        Serial.print("[TRANSMITTED] FAILED - HTTPClient error "); Serial.println(h.status);
        Serial.println("[COMMITTED]   UNCONFIRMED - keeping in queue for retry.");
        return OUT_RETRY;
      }

      Serial.print("[TRANSMITTED] HTTP Status "); Serial.println(h.status);

      bool success = h.body.indexOf("\"success\":true") >= 0;
      String outcome = jsonStr(h.body, "outcome");
      String errCode = jsonStr(h.body, "code");
      String message = jsonStr(h.body, "message");

      if (h.status == 200 || h.status == 201) {
        if (h.body.indexOf("\"isDuplicate\":true") >= 0 || h.body.indexOf("\"outcome\":\"duplicate\"") >= 0 || outcome == "duplicate") {
          Serial.println("[PROCESSED]   IDEMPOTENT RETRY: Original scan result returned.");
          Serial.println("[COMMITTED]   ALREADY COMMITTED.");
          return OUT_COMMITTED_DUPLICATE;
        }
        if (h.body.indexOf("\"outcome\":\"accepted\"") >= 0 || outcome == "accepted") {
          Serial.println("[PROCESSED]   ACCEPTED by WearTrail Scan Router.");
          Serial.println("[COMMITTED]   TRANSACTION COMMITTED in PostgreSQL.");
          return OUT_COMMITTED_ACCEPTED;
        }
        if (h.body.indexOf("\"outcome\":\"rejected\"") >= 0 || outcome == "rejected") {
          Serial.print("[PROCESSED]   REJECTED by Business Rule: ");
          Serial.println(message.length() ? message : "Operation disallowed");
          Serial.println("[COMMITTED]   REJECTION LOGGED in database. Subject not mutated. Will not retry.");
          return OUT_COMMITTED_REJECTED;
        }
      }

      if (h.status == 409) {
        Serial.print("[CONFLICT]    Conflicting Scan Identity Reuse: "); Serial.println(message);
        Serial.println("[DISCARD]     Dropping scan to avoid data corruption.");
        return OUT_DROP_CONFLICT;
      }

      if (h.status == 401) {
        Serial.print("[SECURITY]    UNAUTHORIZED: "); Serial.println(message);
        Serial.println("              Check DEVICE_SECRET in config.h. Dropping scan.");
        return OUT_DROP_BAD_SECRET;
      }

      if (h.status >= 400 && h.status < 500) {
        Serial.print("[REJECTED]    Client Error (HTTP "); Serial.print(h.status);
        Serial.print(" - "); Serial.print(errCode); Serial.print("): "); Serial.println(message);
        Serial.println("              Permanent failure. Will not retry.");
        return OUT_DROP_BAD_REQUEST;
      }

      Serial.print("[SERVER]      Server / Rate limit error (HTTP "); Serial.print(h.status);
      Serial.println("). Retrying with backoff.");
      return OUT_RETRY;
    }

    void serviceQueue() {
      if (qCount == 0) return;
      PendingScan& p = queue[qHead];
      if (millis() < p.nextTryMs) return;

      if (WiFi.status() != WL_CONNECTED) {
        if (millis() - lastWaitMsgMs > 10000) {
          lastWaitMsgMs = millis();
          Serial.print("[QUEUE] Scans buffered in RAM awaiting Wi-Fi: "); Serial.println(qCount);
        }
        return;
      }

      p.attempts++;
      Serial.println();
      Serial.print("[TX] Dispatching Scan '"); Serial.print(p.scanId);
      Serial.print("' (Attempt "); Serial.print(p.attempts); Serial.println(")...");

      HttpResult h = postScan(p);
      Outcome o = interpretResponse(p, h);

      if (o != OUT_RETRY) {
        popQueue();
      } else {
        if (p.attempts >= MAX_SEND_ATTEMPTS) {
          Serial.print("[QUEUE] Scan '"); Serial.print(p.scanId);
          Serial.println("' exceeded MAX_SEND_ATTEMPTS. Marked as LOST.");
          popQueue();
        } else {
          unsigned long backoff = (1UL << min((int)p.attempts, 5)) * 1000UL;
          if (h.retryAfterSec > 0) backoff = h.retryAfterSec * 1000UL;
          p.nextTryMs = millis() + backoff;
          Serial.print("[RETRY] Backoff "); Serial.print(backoff / 1000); Serial.println("s.");
        }
      }
    }

    // =======================================================================
    // MAIN POLLING LOOP
    // =======================================================================
    void loop() {
      maintainWifi();
      maintainReaders();
      pollActionContexts();
      serviceQueue();

      // Poll each active RFID reader for new cards
      for (int i = 0; i < NUM_READERS; i++) {
        if (!readerOk[i]) continue;

        selectReader(i);
        if (mfrc522[i]->PICC_IsNewCardPresent() && mfrc522[i]->PICC_ReadCardSerial()) {
          String uid = getUID(i);
          mfrc522[i]->PICC_HaltA();
          mfrc522[i]->PCD_StopCrypto1();
          deselectReader(i);

          // Debounce repeated readings of same card on same antenna
          if (uid == lastUid[i] && (millis() - lastUidMs[i] < REPEAT_IGNORE_MS)) {
            continue;
          }

          lastUid[i] = uid;
          lastUidMs[i] = millis();
          totalScans[i]++;

          time_t epoch = clockValid() ? time(nullptr) : 0;

          Serial.println();
          Serial.println("========== [DETECTED] RFID CARD READ ==========");
          Serial.print("Reader Index : "); Serial.print(i);
          Serial.print(" ("); Serial.print(STATION_NAMES[i]); Serial.println(")");
          Serial.print("SS Pin (GPIO): "); Serial.println(SS_PINS[i]);
          Serial.print("Tag UID      : "); Serial.println(uid);
          Serial.print("Scan Time    : ");
          if (epoch) { Serial.print(isoUtc(epoch)); Serial.println(" (UTC)"); }
          else Serial.println("Pending NTP sync");
          Serial.println("-----------------------------------------------");

          enqueueScan(i, uid, epoch);
        } else {
          deselectReader(i);
        }
      }

      delay(10);
    }
};

WearTrailHardware* WearTrailHardware::instance = nullptr;
static WearTrailHardware hardware;

void setup() {
  hardware.init();
}

void loop() {
  hardware.loop();
}
