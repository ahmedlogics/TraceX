// ===========================================================================
// WearTrail ESP32 Hardware Configuration Template
// Copy to config.h and fill in local Wi-Fi SSID and Password.
// Do not commit config.h to source control.
// ===========================================================================
#pragma once

// 1) 2.4 GHz Wi-Fi credentials (ESP32 does not support 5 GHz)
#define WIFI_SSID           "YOUR_2_4GHZ_WIFI_SSID"
#define WIFI_PASSWORD       "YOUR_WIFI_PASSWORD"

// 2) WearTrail Express Backend
//    Use your laptop LAN IPv4 address (ipconfig), NOT localhost.
#define BACKEND_HOST        "192.168.1.100"
#define BACKEND_PORT        4000

// 3) Hardware Device Identity & Pre-Shared Secret
#define DEVICE_ID           "26ee6645-9da8-49b3-8e88-feb5707adce6"
#define DEVICE_SECRET       "REPLACE_WITH_DEVICE_SECRET"
#define MAPPING_VERSION     1

// 4) Operational Tuning
#define HTTP_TIMEOUT_MS     5000
#define REPEAT_IGNORE_MS    2000
#define QUEUE_SIZE          30
#define MAX_SEND_ATTEMPTS   40
#define READER_RECHECK_MS   30000
