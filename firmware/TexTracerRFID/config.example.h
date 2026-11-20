// ===========================================================================
// TexTracer ESP32 - user settings template
// ===========================================================================
#pragma once

// 1) Wi-Fi the ESP32 joins (2.4 GHz only - the ESP32 cannot use 5 GHz).
#define WIFI_SSID      "YOUR_WIFI_SSID"
#define WIFI_PASSWORD  "YOUR_WIFI_PASSWORD"

// 2) The laptop that runs the TexTracer backend.
#define BACKEND_HOST   "192.168.1.100"
#define BACKEND_PORT   5000

// 3) Optional tuning (defaults are fine)
#define HTTP_TIMEOUT_MS      5000
#define REPEAT_IGNORE_MS     2000
#define QUEUE_SIZE           30
#define MAX_SEND_ATTEMPTS    40
#define READER_RECHECK_MS    30000
