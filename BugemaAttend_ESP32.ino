/**
 * ============================================================
 *  BUGEMA UNIVERSITY — BIOMETRIC ATTENDANCE SYSTEM
 *  ESP32 Firmware v2.0
 * ============================================================
 *  HARDWARE:
 *   - ESP32 Development Board
 *   - R307 / AS608 Fingerprint Sensor (Serial)
 *   - SSD1306 OLED Display (128x64, I2C)
 *   - 4x Push Buttons
 *   - Green LED (present)
 *   - Red LED (absent / error)
 *
 *  WIRING:
 *   Fingerprint Sensor:
 *     VCC → 3.3V,  GND → GND
 *     TX  → GPIO 16 (RX2),  RX → GPIO 17 (TX2)
 *
 *   OLED (I2C):
 *     VCC → 3.3V,  GND → GND
 *     SDA → GPIO 21,  SCL → GPIO 22
 *
 *   Buttons (with internal pull-up, press = LOW):
 *     BTN_ENROLL  → GPIO 13   (Register new fingerprint)
 *     BTN_ATTEND  → GPIO 12   (Start/stop attendance session)
 *     BTN_DELETE  → GPIO 14   (Delete a fingerprint)
 *     BTN_WIFI    → GPIO 27   (Toggle WiFi / switch to BT mode)
 *
 *   LEDs:
 *     LED_GREEN   → GPIO 2   (Present / Success)
 *     LED_RED     → GPIO 4   (Absent / Error)
 *
 *  DEPENDENCIES (install via Arduino Library Manager):
 *   - Adafruit Fingerprint Sensor Library
 *   - Adafruit SSD1306
 *   - Adafruit GFX Library
 *   - ArduinoJson
 *   - WiFi (built-in ESP32)
 *   - HTTPClient (built-in ESP32)
 *   - BluetoothSerial (built-in ESP32)
 * ============================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <BluetoothSerial.h>
#include <Adafruit_Fingerprint.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <WiFiManager.h>

// ============================================================
//  PROTOTYPES (to avoid scope errors)
// ============================================================
void oledMsg(String line1, String line2, String line3);
void showSplash();
void showIdleScreen();
void displayAttendanceIdle();
void setupWiFiManager();
bool connectWithWiFiManager();
void startAPMode();
void handleBluetoothConfig();
void setupWebServer();
void configModeCallback(WiFiManager *myWiFiManager);
void saveConfigCallback();
void handleWebServer();
String getConfigPageHTML();
String scanWiFiNetworks();
void handleWiFiConnect();
void handleDeviceConfig();
String getDeviceStatus();
void handleAPModeButtons();
void connectWiFi(const char* ssid, const char* pass);
String getTimestamp();
int getNextFreeSlot();
void startBluetoothSession(String sessionId);
void stopBluetoothSession();
void markBluetoothAttendance(String fpId);
void enrollBluetoothFingerprint(String studentId);
void deleteBluetoothFingerprint(String fpId);
void syncBluetoothQueue();
void showBluetoothQueue();
void clearBluetoothQueue();
void syncOfflineQueue();
bool sendAttendanceRaw(struct AttendRecord rec);
void startSession();
void stopSession();
void attendanceLoop();
void enrollLoop();
void deleteLoop();
bool enrollFingerprintStep(int fingerId);

// ============================================================
//  CONFIGURATION — CHANGE THESE
// ============================================================

// WiFiManager Configuration
const char* AP_SSID = "AttendanceSystem";
const char* AP_PASSWORD = ""; // Set to null for open AP
const int AP_CHANNEL = 1;
const bool AP_HIDDEN = false;
const int AP_MAX_CONNECTIONS = 4;

const char* DEFAULT_WIFI_SSID     = "Bugema--University";
const char* DEFAULT_WIFI_PASSWORD = "        ";

// Backend API (your Node.js server URL)
const char* API_BASE_URL          = "https://attendance-e8s6.onrender.com/v1"; // Change this to your Render URL after hosting
const char* API_ATTENDANCE_ENDPOINT = "/attendance";
const char* API_FP_REGISTER_ENDPOINT = "/fingerprint/register";
const char* API_DEVICE_HEARTBEAT  = "/device/heartbeat";

// This device's unique ID — change per device
const char* DEVICE_ID             = "ESP32-LAB-A";
const char* DEVICE_TOKEN          = "my_secret_key_123";

// NTP Time server for timestamps
const char* NTP_SERVER            = "pool.ntp.org";
const long  GMT_OFFSET_SEC        = 10800;   // EAT = UTC+3
const int   DAYLIGHT_OFFSET_SEC   = 0;

// Session lock time (minutes after session close, no new marks)
const int   SESSION_LOCK_MINUTES  = 5;

// ============================================================
//  PIN DEFINITIONS
// ============================================================
#define FP_RX         16
#define FP_TX         17

// ============================================================
//  OBJECT INIT
// ============================================================
HardwareSerial fpSerial(2);
Adafruit_Fingerprint finger(&fpSerial);
Adafruit_SSD1306 display(128, 64, &Wire, -1);
BluetoothSerial SerialBT;
Preferences prefs;
WiFiManager wifiManager;

// ============================================================
//  STATE VARIABLES
// ============================================================
enum DeviceMode { MODE_IDLE, MODE_ATTEND, MODE_ENROLL, MODE_DELETE, MODE_BT };
DeviceMode currentMode = MODE_IDLE;

bool wifiConnected     = false;
bool sessionActive     = false;
bool bluetoothMode     = false;
bool apMode           = false;
bool configMode        = false;
String currentSessionId = "";
String currentCourseId  = "";
String currentEnrollStudentId = ""; // Student currently being enrolled via Live flow
String currentEnrollName      = ""; // Name of student being enrolled

// Offline queue (when WiFi is down, store locally)
struct AttendRecord {
  uint8_t  fp_id;
  String   timestamp;
  String   course_id;
  String   session_id;
  bool     synced;
};

const int OFFLINE_QUEUE_SIZE = 200;
AttendRecord offlineQueue[OFFLINE_QUEUE_SIZE];
int offlineCount = 0;

// Heartbeat timer
unsigned long lastHeartbeat = 0;

// ============================================================
//  SETUP - ENHANCED WITH WIFIMANAGER
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("🎓 Bugema University Attendance System v2.0 - WiFiManager");

  // OLED
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED not found");
  }
  showSplash();

  // Fingerprint sensor
  fpSerial.begin(57600, SERIAL_8N1, FP_RX, FP_TX);
  finger.begin(57600);
  delay(100);
  if (finger.verifyPassword()) {
    oledMsg("FP Sensor OK", "Ready");
  } else {
    oledMsg("FP Sensor FAIL", "Check wiring");
  }

  // Initialize WiFiManager
  setupWiFiManager();

  // Try to connect to WiFi or start AP
  if (!connectWithWiFiManager()) {
    // Failed to connect, start AP mode
    startAPMode();
    return; // Stay in AP mode
  }

  // Connected successfully
  wifiConnected = true;
  oledMsg("WiFi Connected", WiFi.localIP().toString(), "System Ready");

  // Bluetooth (always available as fallback)
  SerialBT.begin("BU-Attend-" + String(DEVICE_ID));

  delay(1500);
  showIdleScreen();
}

// ============================================================
//  MAIN LOOP - ENHANCED WITH BLUETOOTH FALLBACK
// ============================================================
void loop() {
  handleBluetoothConfig();

  // Check WiFi connection and auto-fallback to Bluetooth
  static unsigned long lastWiFiCheck = 0;
  static bool wifiFailureNotified = false;
  
  if (millis() - lastWiFiCheck > 10000) { // Check every 10 seconds
    if (WiFi.status() != WL_CONNECTED && wifiConnected) {
      // WiFi was connected but now disconnected
      wifiConnected = false;
      
      if (!bluetoothMode && !wifiFailureNotified) {
        oledMsg("WIFI LOST", "Switching to BT", "Please wait...");
        SerialBT.println("ALERT:WiFi disconnected, switching to Bluetooth mode");
        Serial.println("📶 WiFi lost, activating Bluetooth backup");
        
        // Auto-activate Bluetooth mode
        bluetoothMode = true;
        currentMode = MODE_BT;
        wifiFailureNotified = true;
        
        delay(2000);
        oledMsg("BLUETOOTH MODE", "Connect app", "BU-Attend-" + String(DEVICE_ID));
      }
    } else if (WiFi.status() == WL_CONNECTED && !wifiConnected) {
      // WiFi reconnected
      wifiConnected = true;
      wifiFailureNotified = false;
      
      if (bluetoothMode) {
        oledMsg("WIFI RESTORED", "Switching back", "Please wait...");
        SerialBT.println("ALERT:WiFi reconnected, switching to WiFi mode");
        Serial.println("📶 WiFi restored, deactivating Bluetooth mode");
        
        // Switch back to WiFi mode
        bluetoothMode = false;
        currentMode = MODE_IDLE;
        
        delay(2000);
        showIdleScreen();
      }
    }
    lastWiFiCheck = millis();
  }

  // Heartbeat every 10 seconds for faster command response
  if (millis() - lastHeartbeat > 10000 && wifiConnected) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }

  // Try to sync offline queue when WiFi is available
  if (wifiConnected && offlineCount > 0 && !bluetoothMode) {
    syncOfflineQueue();
  }

  // Handle different modes
  switch (currentMode) {
    case MODE_ATTEND:
      attendanceLoop();
      break;
    case MODE_ENROLL:
      enrollLoop();
      break;
    case MODE_DELETE:
      deleteLoop();
      break;
    case MODE_BT:
      // Bluetooth mode - handle fingerprint scanning for attendance
      if (sessionActive) {
        bluetoothAttendanceLoop();
      }
      break;
    default:
      break;
  }
}

// ============================================================
//  BLUETOOTH ATTENDANCE LOOP
// ============================================================
void bluetoothAttendanceLoop() {
  // Handle fingerprint scanning in Bluetooth mode
  uint8_t p = finger.getImage();
  
  if (p == FINGERPRINT_OK) {
    // Got fingerprint image
    p = finger.image2Tz();
    
    if (p == FINGERPRINT_OK) {
      // Image converted to template
      p = finger.fingerSearch();
      
      if (p == FINGERPRINT_OK) {
        // Fingerprint found in database
        String fpId = "FP_" + String(finger.fingerID);
        
        // Mark attendance via Bluetooth
        markBluetoothAttendance(fpId);
        
        // Send immediate notification via Bluetooth
        SerialBT.println("SCAN_SUCCESS:" + fpId + ",timestamp:" + getTimestamp());
        
      } else if (p == FINGERPRINT_NOTFOUND) {
        // Fingerprint not found
        oledMsg("❌ NOT FOUND", "Register first", "Try again");
        
        SerialBT.println("SCAN_FAILED:Fingerprint not found in database");
        
      } else {
        // Other error
        oledMsg("❌ SCAN ERROR", "Try again", "Check finger");
        
        SerialBT.println("SCAN_FAILED:Scan error, code " + String(p));
      }
    } else {
      // Image conversion failed
      oledMsg("❌ IMAGE ERROR", "Try again", "Clean sensor");
      
      SerialBT.println("SCAN_FAILED:Image conversion failed");
    }
  } else if (p != FINGERPRINT_NOFINGER) {
    // Other error (not "no finger")
    oledMsg("❌ SENSOR ERROR", "Check wiring", "Reset device");
    
    SerialBT.println("SCAN_FAILED:Sensor error, code " + String(p));
  }
  
  // Small delay to prevent overwhelming
  delay(100);
}

// ============================================================
//  SESSION MANAGEMENT
// ============================================================
void startSession() {
  if (!wifiConnected) {
    // Allow offline — generate local session ID
    currentSessionId = "OFFLINE-" + String(millis());
    currentCourseId  = "PENDING";
    sessionActive    = true;
    currentMode      = MODE_ATTEND;
    oledMsg("SESSION STARTED", "Offline Mode", "Scan fingers");
    return;
  }

  // Fetch active session from API (opened by lecturer on web app)
  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/session/active?device_id=" + DEVICE_ID);
  http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));
  int code = http.GET();

  if (code == 200) {
    String payload = http.getString();
    StaticJsonDocument<512> doc;
    deserializeJson(doc, payload);
    currentSessionId = doc["session_id"].as<String>();
    currentCourseId  = doc["course_id"].as<String>();
    String courseName = doc["course_name"].as<String>();
    sessionActive    = true;
    currentMode      = MODE_ATTEND;
    oledMsg("SESSION ACTIVE", courseName.substring(0,16), "Scan fingers now");
  } else if (code == 404) {
    oledMsg("NO ACTIVE SESSION", "Start one from", "the web app");
  } else {
    oledMsg("API ERROR", "Code: " + String(code), "Check server");
  }
  http.end();
}

void stopSession() {
  sessionActive = false;
  currentMode   = MODE_IDLE;

  // Notify API
  if (wifiConnected) {
    HTTPClient http;
    http.begin(String(API_BASE_URL) + "/session/" + currentSessionId + "/stop");
    http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));
    http.addHeader("Content-Type", "application/json");
    http.POST("{\"device_id\":\"" + String(DEVICE_ID) + "\"}");
    http.end();
  }

  currentSessionId = "";
  currentCourseId  = "";
  oledMsg("SESSION ENDED", "Report saved", "on server");
  delay(2000);
  showIdleScreen();
}

// ============================================================
//  ATTENDANCE LOOP
// ============================================================
void attendanceLoop() {
  if (!sessionActive) return;

  oledMsg("SCANNING...", "Place finger", currentCourseId);

  uint8_t result = getFingerprintID();

  if (result == FINGERPRINT_OK) {
    uint8_t fpId = finger.fingerID;
    int confidence = finger.confidence;
    String ts = getTimestamp();

    oledMsg("FOUND!", "ID #" + String(fpId), "Conf: " + String(confidence) + "%");

    // Send to API
    bool sent = sendAttendance(fpId, ts, "present");

    if (!sent) {
      // Queue offline
      if (offlineCount < OFFLINE_QUEUE_SIZE) {
        offlineQueue[offlineCount++] = {fpId, ts, currentCourseId, currentSessionId, false};
        oledMsg("OFFLINE SAVED", "ID #" + String(fpId), "Will sync later");
      }
    } else {
      oledMsg("MARKED PRESENT", "ID #" + String(fpId), ts.substring(11, 16));
    }
    delay(2000);

  } else if (result == FINGERPRINT_NOTFOUND) {
    oledMsg("NOT REGISTERED", "Unknown finger", "Contact admin");
    flashRed(2);
    delay(2000);

  } else if (result == FINGERPRINT_NOFINGER) {
    // No finger yet — just show idle attendance screen
    displayAttendanceIdle();
    delay(500);
  }
}

uint8_t getFingerprintID() {
  uint8_t p = finger.getImage();
  if (p == FINGERPRINT_NOFINGER) return FINGERPRINT_NOFINGER;
  if (p != FINGERPRINT_OK)       return p;

  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return p;

  p = finger.fingerSearch();
  return p;
}

// ============================================================
//  ENROLL LOOP (Register new fingerprint)
// ============================================================
void enrollLoop() {
  oledMsg("ENROLLING STUDENT", currentEnrollName, "Ready to start?");
  sendLog("START", "Entering enrollment mode for " + currentEnrollName);

  // Get next available slot
  int id = getNextFreeSlot();
  if (id < 0) {
    oledMsg("MEMORY FULL", "Delete old FPs", "first");
    sendLog("ERROR", "Sensor memory full");
    currentMode = MODE_IDLE;
    return;
  }

  oledMsg("ENROLLING", "Slot #" + String(id), "Scan finger x2");
  sendLog("WAITING_FOR_SCAN_1", "Please place finger on sensor");
  delay(1000);

  // First scan
  while (finger.getImage() != FINGERPRINT_OK) {
    delay(200);
  }
  finger.image2Tz(1);
  oledMsg("SCAN 1/2 OK", "Lift finger", "");
  sendLog("SCAN_1_OK", "First scan successful. Please lift finger.");
  delay(1500);

  while (finger.getImage() != FINGERPRINT_NOFINGER) delay(200);

  // Second scan
  oledMsg("SCAN 2/2", "Place same finger", "again");
  sendLog("WAITING_FOR_SCAN_2", "Please place the same finger again.");
  while (finger.getImage() != FINGERPRINT_OK) {
    delay(200);
  }
  finger.image2Tz(2);

  uint8_t p = finger.createModel();
  if (p != FINGERPRINT_OK) {
    oledMsg("ENROLL FAILED", "Scans didn't match", "Try again");
    sendLog("ERROR_MATCH", "Fingerprint scans did not match. Try again.");
    currentMode = MODE_IDLE;
    return;
  }

  p = finger.storeModel(id);
  if (p == FINGERPRINT_OK) {
    oledMsg("ENROLLED!", "FP ID: #" + String(id), "Saved to sensor");
    sendLog("SUCCESS", "Fingerprint #" + String(id) + " enrolled successfully!");

    // Notify backend specifically for the link
    if (wifiConnected) {
      HTTPClient http;
      http.begin(String(API_BASE_URL) + String(API_FP_REGISTER_ENDPOINT));
      http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));
      http.addHeader("Content-Type", "application/json");
      
      // Link the student ID if we have it from the Live flow
      String body = "{\"device_id\":\"" + String(DEVICE_ID) +
                    "\",\"fp_id\":" + String(id);
      if (currentEnrollStudentId != "") {
        body += ",\"student_id\":\"" + currentEnrollStudentId + "\"";
      }
      body += "}";
      
      http.POST(body);
      http.end();
    }
  } else {
    oledMsg("STORE FAILED", "Error: " + String(p), "");
    sendLog("ERROR_STORE", "Failed to store model. Error code: " + String(p));
  }

  delay(2000);
  currentEnrollStudentId = "";
  currentMode = MODE_IDLE;
  showIdleScreen();
}

// ============================================================
//  DELETE LOOP
// ============================================================
void deleteLoop() {
  oledMsg("DELETE MODE", "Scan finger", "to delete");

  unsigned long start = millis();
  while (millis() - start < 10000) {
    uint8_t p = finger.getImage();
    if (p != FINGERPRINT_OK) { delay(200); continue; }
    finger.image2Tz();
    if (finger.fingerSearch() == FINGERPRINT_OK) {
      uint8_t id = finger.fingerID;
      finger.deleteModel(id);
      oledMsg("DELETED", "FP ID: #" + String(id), "Removed");
      delay(2000);
      currentMode = MODE_IDLE;
      showIdleScreen();
      return;
    }
  }
  oledMsg("TIMEOUT", "No finger found", "");
  currentMode = MODE_IDLE;
  showIdleScreen();
}

// ============================================================
//  API CALLS
// ============================================================
bool sendAttendance(uint8_t fpId, String timestamp, String status) {
  if (!wifiConnected) return false;

  HTTPClient http;
  http.begin(String(API_BASE_URL) + String(API_ATTENDANCE_ENDPOINT));
  http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  String body = "{";
  body += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  body += "\"fp_id\":" + String(fpId) + ",";
  body += "\"session_id\":\"" + currentSessionId + "\",";
  body += "\"course_id\":\"" + currentCourseId + "\",";
  body += "\"status\":\"" + status + "\",";
  body += "\"timestamp\":\"" + timestamp + "\",";
  body += "\"confidence\":" + String(finger.confidence);
  body += "}";

  int httpCode = http.POST(body);
  http.end();

  return (httpCode == 200 || httpCode == 201);
}

void sendHeartbeat() {
  if (!wifiConnected) return;
  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/device/heartbeat"); // Standardized path
  http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));
  http.addHeader("Content-Type", "application/json");

  String body = "{\"device_id\":\"" + String(DEVICE_ID) + "\",";
  body += "\"session_active\":" + String(sessionActive ? "true" : "false") + ",";
  body += "\"offline_queue\":" + String(offlineCount) + "}";

  int code = http.POST(body);
  if (code == 200) {
    String payload = http.getString();
    StaticJsonDocument<256> doc;
    deserializeJson(doc, payload);
    
    if (doc.containsKey("command")) {
      String cmd = doc["command"].as<String>();
      if (cmd == "ENROLL") {
        currentEnrollStudentId = doc["student_id"].as<String>();
        currentEnrollName      = doc["student_name"].as<String>();
        currentMode = MODE_ENROLL;
        Serial.println("[CMD] Remote start enrollment for " + currentEnrollName + " (" + currentEnrollStudentId + ")");
      }
    }
  }
  http.end();
}

void sendLog(String status, String message) {
  if (!wifiConnected) return;
  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/device/log");
  http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));
  http.addHeader("Content-Type", "application/json");

  String body = "{\"device_id\":\"" + String(DEVICE_ID) + "\",";
  body += "\"status\":\"" + status + "\",";
  body += "\"message\":\"" + message + "\",";
  body += "\"student_id\":\"" + currentEnrollStudentId + "\"}";

  http.POST(body);
  http.end();
}

// ============================================================
//  OFFLINE SYNC
// ============================================================
void syncOfflineQueue() {
  Serial.println("[SYNC] Syncing " + String(offlineCount) + " offline records...");
  int synced = 0;

  for (int i = 0; i < offlineCount; i++) {
    if (!offlineQueue[i].synced) {
      if (sendAttendanceRaw(offlineQueue[i])) {
        offlineQueue[i].synced = true;
        synced++;
      }
    }
  }

  if (synced > 0) {
    // Remove synced records
    int newCount = 0;
    for (int i = 0; i < offlineCount; i++) {
      if (!offlineQueue[i].synced) {
        offlineQueue[newCount++] = offlineQueue[i];
      }
    }
    offlineCount = newCount;
    Serial.println("[SYNC] Synced " + String(synced) + " records.");
    oledMsg("SYNC COMPLETE", String(synced) + " records sent", "");
    delay(1500);
    showIdleScreen();
  }
}

bool sendAttendanceRaw(AttendRecord rec) {
  HTTPClient http;
  http.begin(String(API_BASE_URL) + String(API_ATTENDANCE_ENDPOINT));
  http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(4000);

  String body = "{\"device_id\":\"" + String(DEVICE_ID) + "\",";
  body += "\"fp_id\":" + String(rec.fp_id) + ",";
  body += "\"session_id\":\"" + rec.session_id + "\",";
  body += "\"course_id\":\"" + rec.course_id + "\",";
  body += "\"status\":\"present\",";
  body += "\"timestamp\":\"" + rec.timestamp + "\",";
  body += "\"offline\":true}";

  int code = http.POST(body);
  http.end();
  return (code == 201 || code == 200);
}

// ============================================================
/**
 * Connect to the ESP32 via Bluetooth Serial from any phone
 * using a Bluetooth terminal app (e.g. Serial Bluetooth Terminal).
 *
 * BASIC COMMANDS:
 *   WIFI:SSID:PASSWORD       — Set new WiFi credentials
 *   STATUS                   — Get device status
 *   REBOOT                   — Reboot device
 *
 * ATTENDANCE COMMANDS (when WiFi fails):
 *   SESSION_START:SES123     — Start attendance session
 *   SESSION_STOP              — Stop current session
 *   ATTEND:FP001             — Mark attendance for fingerprint ID
 *   ENROLL:STU001            — Enroll new fingerprint for student
 *   DELETE:FP001             — Delete fingerprint
 *   SYNC                     — Sync offline queue when WiFi available
 *   QUEUE                    — Show offline attendance queue
 *   CLEAR_QUEUE              — Clear offline queue
 */
void handleBluetoothConfig() {
  if (!SerialBT.available()) return;

  String cmd = SerialBT.readStringUntil('\n');
  cmd.trim();
  Serial.println("[BT CMD] " + cmd);

  // Handle attendance commands
  if (cmd.startsWith("SESSION_START:")) {
    String sessionId = cmd.substring(14);
    startBluetoothSession(sessionId);
    
  } else if (cmd == "SESSION_STOP") {
    stopBluetoothSession();
    
  } else if (cmd.startsWith("ATTEND:")) {
    String fpId = cmd.substring(7);
    markBluetoothAttendance(fpId);
    
  } else if (cmd.startsWith("ENROLL:")) {
    String studentId = cmd.substring(7);
    enrollBluetoothFingerprint(studentId);
    
  } else if (cmd.startsWith("DELETE:")) {
    String fpId = cmd.substring(7);
    deleteBluetoothFingerprint(fpId);
    
  } else if (cmd == "SYNC") {
    syncBluetoothQueue();
    
  } else if (cmd == "QUEUE") {
    showBluetoothQueue();
    
  } else if (cmd == "CLEAR_QUEUE") {
    clearBluetoothQueue();
    
  } else if (cmd.startsWith("WIFI:")) {
    // Existing WiFi config
    int firstColon = cmd.indexOf(':');
    int secondColon = cmd.indexOf(':', firstColon + 1);
    
    if (firstColon > 0 && secondColon > firstColon) {
      String ssid = cmd.substring(firstColon + 1, secondColon);
      String pass = cmd.substring(secondColon + 1);
      
      // Save to flash
      prefs.putString("ssid", ssid);
      prefs.putString("pass", pass);
      SerialBT.println("OK: Connecting to " + ssid);
      oledMsg("NEW WIFI", ssid, "Connecting...");
      connectWiFi(ssid.c_str(), pass.c_str());
      SerialBT.println(wifiConnected ? "CONNECTED: " + WiFi.localIP().toString() : "FAILED: Check credentials");
    } else {
      SerialBT.println("ERR: Format is WIFI:SSID:PASSWORD");
    }

  } else if (cmd == "STATUS") {
    // Enhanced status with Bluetooth mode info
    SerialBT.println("=== BUGEMA ATTENDANCE DEVICE STATUS ===");
    SerialBT.println("Device: " + String(DEVICE_ID));
    SerialBT.println("Mode: " + String(bluetoothMode ? "BLUETOOTH" : "WIFI"));
    SerialBT.println("WiFi: " + String(wifiConnected ? WiFi.SSID() + " (" + WiFi.localIP().toString() + ")" : "Disconnected"));
    SerialBT.println("Session: " + String(sessionActive ? currentSessionId : "None"));
    SerialBT.println("Course: " + (currentCourseId.isEmpty() ? "None" : currentCourseId));
    SerialBT.println("Offline queue: " + String(offlineCount));
    SerialBT.println("FP count: " + String(finger.templateCount));
    SerialBT.println("Bluetooth: BU-Attend-" + String(DEVICE_ID));
    SerialBT.println("========================================");

  } else if (cmd == "REBOOT") {
    SerialBT.println("Rebooting...");
    delay(500);
    ESP.restart();

  } else if (cmd == "HELP") {
    SerialBT.println("=== BUGEMA ATTENDANCE BLUETOOTH COMMANDS ===");
    SerialBT.println("BASIC:");
    SerialBT.println("  STATUS                    - Show device status");
    SerialBT.println("  WIFI:SSID:PASSWORD       - Set WiFi credentials");
    SerialBT.println("  REBOOT                    - Reboot device");
    SerialBT.println("  HELP                      - Show this help");
    SerialBT.println("");
    SerialBT.println("ATTENDANCE:");
    SerialBT.println("  SESSION_START:SES123     - Start session");
    SerialBT.println("  SESSION_STOP              - Stop session");
    SerialBT.println("  ATTEND:FP001             - Mark attendance");
    SerialBT.println("  ENROLL:STU001            - Enroll fingerprint");
    SerialBT.println("  DELETE:FP001             - Delete fingerprint");
    SerialBT.println("");
    SerialBT.println("SYNC:");
    SerialBT.println("  SYNC                      - Sync offline queue");
    SerialBT.println("  QUEUE                     - Show offline queue");
    SerialBT.println("  CLEAR_QUEUE               - Clear queue");
    SerialBT.println("============================================");

  } else {
    SerialBT.println("Unknown command: " + cmd);
    SerialBT.println("Type 'HELP' for available commands");
  }
}

// ============================================================
//  BLUETOOTH ATTENDANCE FUNCTIONS
// ============================================================

void startBluetoothSession(String sessionId) {
  currentSessionId = sessionId;
  sessionActive = true;
  bluetoothMode = true;
  currentMode = MODE_ATTEND;
  
  oledMsg("BT SESSION", "ID: " + sessionId.substring(0,8), "Scan fingerprints");
  flashGreen(2);
  
  SerialBT.println("SESSION_STARTED:" + sessionId);
  SerialBT.println("Session started in Bluetooth mode");
  Serial.println("🎯 Bluetooth session started: " + sessionId);
}

void stopBluetoothSession() {
  if (!sessionActive) {
    SerialBT.println("ERR: No active session");
    return;
  }
  
  String sessionId = currentSessionId;
  sessionActive = false;
  currentSessionId = "";
  currentCourseId = "";
  
  oledMsg("SESSION STOPPED", "Count: " + String(offlineCount), "Queue saved");
  flashRed(2);
  
  SerialBT.println("SESSION_STOPPED:" + String(offlineCount));
  SerialBT.println("Session stopped. " + String(offlineCount) + " records in queue");
  Serial.println("🛑 Bluetooth session stopped");
}

void markBluetoothAttendance(String fpId) {
  if (!sessionActive) {
    SerialBT.println("ERR: No active session");
    return;
  }
  
  // Add to offline queue
  if (offlineCount < OFFLINE_QUEUE_SIZE) {
    AttendRecord record;
    record.fp_id = fpId.toInt();
    record.timestamp = getTimestamp();
    record.course_id = currentCourseId;
    record.session_id = currentSessionId;
    record.synced = false;
    
    offlineQueue[offlineCount] = record;
    offlineCount++;
    
    oledMsg("✅ ATTENDED", "FP: " + fpId, "Queue: " + String(offlineCount));
    flashGreen(1);
    
    SerialBT.println("ATTENDANCE_OK:" + fpId + ",timestamp:" + record.timestamp + ",queue:" + String(offlineCount));
    Serial.println("✅ Bluetooth attendance recorded: " + fpId);
  } else {
    oledMsg("❌ QUEUE FULL", "Cannot record", "Sync needed");
    flashRed(3);
    
    SerialBT.println("ERR: Queue full (" + String(OFFLINE_QUEUE_SIZE) + ")");
    Serial.println("❌ Offline queue full");
  }
}

void enrollBluetoothFingerprint(String studentId) {
  oledMsg("BT ENROLL", "Student: " + studentId, "Place finger");
  
  int fingerId = finger.getTemplateCount() + 1;
  
  SerialBT.println("ENROLL_START:" + studentId + ",finger_id:" + String(fingerId));
  Serial.println("🔬 Bluetooth enrollment started for: " + studentId);
  
  // Simple enrollment process
  if (enrollFingerprintStep(fingerId)) {
    // Store enrollment info
    String enrollData = "ENROLL_SUCCESS:" + studentId;
    enrollData += ",finger_id:" + String(fingerId);
    enrollData += ",fp_template:FP_" + String(fingerId);
    enrollData += ",quality:95";
    
    SerialBT.println(enrollData);
    oledMsg("✅ ENROLLED", "FP: " + String(fingerId), "Student: " + studentId);
    flashGreen(2);
    
    Serial.println("✅ Bluetooth enrollment completed");
  } else {
    SerialBT.println("ENROLL_FAILED:" + studentId + ",error:Enrollment failed");
    oledMsg("❌ ENROLL FAIL", "Try again", "Check finger");
    flashRed(3);
    
    Serial.println("❌ Bluetooth enrollment failed");
  }
}

void deleteBluetoothFingerprint(String fpId) {
  int fingerNum = fpId.toInt();
  
  if (fingerNum > 0 && fingerNum <= finger.getTemplateCount()) {
    if (finger.deleteModel(fingerNum) == FINGERPRINT_OK) {
      SerialBT.println("DELETE_SUCCESS:" + fpId);
      oledMsg("✅ DELETED", "FP: " + fpId, "Success");
      flashGreen(1);
      
      Serial.println("✅ Fingerprint deleted: " + fpId);
    } else {
      SerialBT.println("DELETE_FAILED:" + fpId + ",error:Delete failed");
      oledMsg("❌ DELETE FAIL", "FP: " + fpId, "Try again");
      flashRed(2);
      
      Serial.println("❌ Fingerprint delete failed: " + fpId);
    }
  } else {
    SerialBT.println("DELETE_FAILED:" + fpId + ",error:Invalid finger ID");
    Serial.println("❌ Invalid fingerprint ID: " + fpId);
  }
}

void syncBluetoothQueue() {
  if (!wifiConnected) {
    SerialBT.println("SYNC_FAILED:WiFi not connected");
    SerialBT.println("Connect to WiFi first using WIFI:SSID:PASSWORD");
    return;
  }
  
  if (offlineCount == 0) {
    SerialBT.println("SYNC_OK:Queue is empty");
    SerialBT.println("No records to sync");
    return;
  }
  
  oledMsg("SYNCING...", "Records: " + String(offlineCount), "Please wait");
  
  int synced = 0;
  int failed = 0;
  
  for (int i = 0; i < offlineCount; i++) {
    AttendRecord rec = offlineQueue[i];
    if (!rec.synced) {
      if (sendAttendanceRaw(rec)) {
        rec.synced = true;
        offlineQueue[i] = rec;
        synced++;
      } else {
        failed++;
      }
      delay(100); // Small delay between requests
    }
  }
  
  // Remove synced records
  int newCount = 0;
  for (int i = 0; i < offlineCount; i++) {
    if (!offlineQueue[i].synced) {
      offlineQueue[newCount] = offlineQueue[i];
      newCount++;
    }
  }
  offlineCount = newCount;
  
  String result = "SYNC_COMPLETE:synced:" + String(synced) + ",failed:" + String(failed) + ",remaining:" + String(offlineCount);
  SerialBT.println(result);
  
  if (failed == 0) {
    oledMsg("✅ SYNC COMPLETE", "All synced", "Queue: " + String(offlineCount));
    flashGreen(2);
  } else {
    oledMsg("⚠️ SYNC PARTIAL", "Failed: " + String(failed), "Queue: " + String(offlineCount));
    flashRed(1);
  }
  
  Serial.println("🔄 Bluetooth sync completed: " + result);
}

void showBluetoothQueue() {
  SerialBT.println("=== OFFLINE QUEUE STATUS ===");
  SerialBT.println("Total records: " + String(offlineCount));
  SerialBT.println("Max capacity: " + String(OFFLINE_QUEUE_SIZE));
  SerialBT.println("");
  
  if (offlineCount == 0) {
    SerialBT.println("Queue is empty");
  } else {
    SerialBT.println("Recent records:");
    int show = min(5, offlineCount);
    for (int i = offlineCount - show; i < offlineCount; i++) {
      AttendRecord rec = offlineQueue[i];
      SerialBT.println((i+1) + ". FP:" + String(rec.fp_id) + " | " + rec.timestamp + " | " + (rec.synced ? "SYNCED" : "PENDING"));
    }
    
    if (offlineCount > 5) {
      SerialBT.println("... and " + String(offlineCount - 5) + " more");
    }
  }
  SerialBT.println("==========================");
}

void clearBluetoothQueue() {
  if (offlineCount == 0) {
    SerialBT.println("CLEAR_OK:Queue already empty");
    return;
  }
  
  int cleared = offlineCount;
  offlineCount = 0;
  
  SerialBT.println("CLEAR_OK:Cleared " + String(cleared) + " records");
  oledMsg("✅ QUEUE CLEARED", "Removed: " + String(cleared), "Queue empty");
  flashGreen(2);
  
  Serial.println("🗑️ Bluetooth queue cleared: " + String(cleared) + " records");
}

bool enrollFingerprintStep(int fingerId) {
  // Step 1: Capture first image
  oledMsg("Place finger", "Step 1/3", "Don't move");
  delay(1000);
  
  while (finger.getImage() != FINGERPRINT_OK) {
    if (digitalRead(BTN_WIFI) == LOW) return false; // Cancel
  }
  
  if (finger.image2Tz() != FINGERPRINT_OK) {
    Serial.println("❌ Image conversion failed");
    return false;
  }
  
  // Step 2: Remove finger
  oledMsg("Remove finger", "Step 2/3", "Wait...");
  delay(1000);
  
  while (finger.getImage() != FINGERPRINT_NOFINGER) {
    if (digitalRead(BTN_WIFI) == LOW) return false; // Cancel
  }
  
  // Step 3: Capture second image
  oledMsg("Place finger", "Step 3/3", "Same finger");
  delay(1000);
  
  while (finger.getImage() != FINGERPRINT_OK) {
    if (digitalRead(BTN_WIFI) == LOW) return false; // Cancel
  }
  
  if (finger.image2Tz() != FINGERPRINT_OK) {
    Serial.println("❌ Second image failed");
    return false;
  }
  
  // Create model
  if (finger.createModel() != FINGERPRINT_OK) {
    Serial.println("❌ Model creation failed");
    return false;
  }
  
  // Store model
  if (finger.storeModel(fingerId) != FINGERPRINT_OK) {
    Serial.println("❌ Storage failed");
    return false;
  }
  
  return true;
}

// ============================================================
//  WIFIMANAGER FUNCTIONS
// ============================================================

void setupWiFiManager() {
  // Set custom parameters for device configuration
  WiFiManagerParameter custom_device_id("device_id", "Device ID", DEVICE_ID, 20);
  WiFiManagerParameter custom_api_url("api_url", "API URL", API_BASE_URL, 50);
  WiFiManagerParameter custom_device_token("device_token", "Device Token", DEVICE_TOKEN, 50);
  
  // Add custom parameters
  wifiManager.addParameter(&custom_device_id);
  wifiManager.addParameter(&custom_api_url);
  wifiManager.addParameter(&custom_device_token);
  
  // Set AP configuration
  wifiManager.setAPStaticIPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  wifiManager.setAPCallback(configModeCallback);
  wifiManager.setSaveConfigCallback(saveConfigCallback);
  
  // Set custom web interface
  wifiManager.setCustomHeadElement("<style>body{font-family:Arial,sans-serif;} .input-group{margin:10px 0;} .btn{background:#4CAF50;color:white;padding:10px 20px;border:none;border-radius:4px;cursor:pointer;}</style>");
  
  // Set timeout for configuration
  wifiManager.setConfigPortalTimeout(300); // 5 minutes
  
  Serial.println("📶 WiFiManager initialized");
}

bool connectWithWiFiManager() {
  oledMsg("Connecting WiFi", "Please wait...", "");
  
  // Try to connect with saved credentials first
  prefs.begin("bugema-iot", false);
  String savedSSID = prefs.getString("ssid", DEFAULT_WIFI_SSID);
  String savedPASS = prefs.getString("pass", DEFAULT_WIFI_PASSWORD);
  prefs.end();
  
  WiFi.begin(savedSSID.c_str(), savedPASS.c_str());
  
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 10) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Connected to saved WiFi: " + savedSSID);
    return true;
  }
  
  // If failed, start configuration portal
  Serial.println("\n📶 Starting WiFi Configuration Portal...");
  oledMsg("CONFIG MODE", "Connect to:", AP_SSID);
  
  // Start configuration portal
  String apName = String(AP_SSID) + "-" + String(DEVICE_ID);
  if (!wifiManager.startConfigPortal(apName.c_str(), AP_PASSWORD)) {
    Serial.println("❌ Failed to connect or timeout");
    return false;
  }
  
  // Connected successfully via portal
  Serial.println("✅ Connected via WiFiManager");
  return true;
}

void startAPMode() {
  apMode = true;
  configMode = true;
  
  Serial.println("📶 Starting Access Point mode...");
  oledMsg("AP MODE", "Connect to:", AP_SSID);
  
  // Start AP with custom web server
  WiFi.softAP(AP_SSID, AP_PASSWORD, AP_CHANNEL, AP_HIDDEN, AP_MAX_CONNECTIONS);
  
  IPAddress apIP = WiFi.softAPIP();
  Serial.print("AP IP Address: ");
  Serial.println(apIP);
  
  // Setup web server for configuration
  setupWebServer();
  
  // Show AP mode on OLED
  oledMsg("CONFIG MODE", "IP: " + apIP.toString(), "Connect phone/laptop");
  
  while (apMode) {
    handleWebServer();
    delay(10);
  }
}

void configModeCallback(WiFiManager *myWiFiManager) {
  Serial.println("📶 Entered configuration mode");
  oledMsg("CONFIG MODE", "Connect to AP", "192.168.4.1");
}

void saveConfigCallback() {
  Serial.println("📶 Configuration saved");
  oledMsg("CONFIG SAVED", "Reconnecting...", "");
}

// ============================================================
//  WEB SERVER FOR CONFIGURATION
// ============================================================

WebServer server(80);

void setupWebServer() {
  // Main configuration page
  server.on("/", HTTP_GET, []() {
    String html = getConfigPageHTML();
    server.send(200, "text/html", html);
  });
  
  // Handle WiFi scan
  server.on("/scan", HTTP_GET, []() {
    String json = scanWiFiNetworks();
    server.send(200, "application/json", json);
  });
  
  // Handle WiFi connection
  server.on("/connect", HTTP_POST, []() {
    handleWiFiConnect();
  });
  
  // Handle device configuration
  server.on("/device", HTTP_POST, []() {
    handleDeviceConfig();
  });
  
  // Handle status
  server.on("/status", HTTP_GET, []() {
    String json = getDeviceStatus();
    server.send(200, "application/json", json);
  });
  
  // Handle restart
  server.on("/restart", HTTP_POST, []() {
    server.send(200, "text/plain", "Restarting...");
    delay(1000);
    ESP.restart();
  });
  
  server.begin();
  Serial.println("🌐 Web server started");
}

void handleWebServer() {
  server.handleClient();
}

String getConfigPageHTML() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <title>Bugema Attendance - Configuration</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; text-align: center; margin-bottom: 30px; }
        .logo { text-align: center; font-size: 24px; margin-bottom: 20px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #34495e; }
        input, select { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #27ae60; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; margin-top: 10px; }
        button:hover { background: #229954; }
        button.secondary { background: #3498db; }
        button.secondary:hover { background: #2980b9; }
        .network-list { max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 10px; }
        .network-item { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; }
        .network-item:hover { background: #f8f9fa; }
        .network-item:last-child { border-bottom: none; }
        .signal-strength { float: right; color: #27ae60; }
        .status { padding: 10px; border-radius: 5px; margin-bottom: 20px; }
        .status.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .tabs { display: flex; margin-bottom: 20px; }
        .tab { flex: 1; padding: 10px; text-align: center; background: #ecf0f1; border: 1px solid #bdc3c7; cursor: pointer; }
        .tab:first-child { border-radius: 5px 0 0 5px; }
        .tab:last-child { border-radius: 0 5px 5px 0; }
        .tab.active { background: #3498db; color: white; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎓 Bugema University</div>
        <h1>Attendance System Configuration</h1>
        
        <div class="tabs">
            <div class="tab active" onclick="showTab('wifi')">WiFi Setup</div>
            <div class="tab" onclick="showTab('device')">Device Settings</div>
            <div class="tab" onclick="showTab('status')">Device Status</div>
        </div>
        
        <div id="status-message"></div>
        
        <!-- WiFi Setup Tab -->
        <div id="wifi-tab" class="tab-content active">
            <div class="form-group">
                <label>Available Networks</label>
                <div class="network-list" id="network-list">
                    <div class="network-item">Scanning networks...</div>
                </div>
                <button onclick="scanNetworks()">🔄 Scan Networks</button>
            </div>
            
            <div class="form-group">
                <label for="ssid">Network Name (SSID)</label>
                <input type="text" id="ssid" placeholder="Enter WiFi network name">
            </div>
            
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" placeholder="Enter WiFi password">
            </div>
            
            <button onclick="connectWiFi()">📶 Connect to WiFi</button>
        </div>
        
        <!-- Device Settings Tab -->
        <div id="device-tab" class="tab-content">
            <div class="form-group">
                <label for="device-id">Device ID</label>
                <input type="text" id="device-id" placeholder="ESP32-LAB-A" value="ESP32-LAB-A">
            </div>
            
            <div class="form-group">
                <label for="api-url">API Server URL</label>
                <input type="text" id="api-url" placeholder="https://api.bugema.ac.ug/v1" value="https://api.bugema.ac.ug/v1">
            </div>
            
            <div class="form-group">
                <label for="device-token">Device Token</label>
                <input type="text" id="device-token" placeholder="Device authentication token">
            </div>
            
            <button onclick="saveDeviceConfig()">💾 Save Device Settings</button>
        </div>
        
        <!-- Device Status Tab -->
        <div id="status-tab" class="tab-content">
            <div id="device-status">
                <p>Loading device status...</p>
            </div>
            <button onclick="loadStatus()" class="secondary">🔄 Refresh Status</button>
            <button onclick="restartDevice()" class="secondary">🔄 Restart Device</button>
        </div>
    </div>
    
    <script>
        function showTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            
            // Show selected tab
            document.getElementById(tabName + '-tab').classList.add('active');
            event.target.classList.add('active');
            
            // Load data if needed
            if (tabName === 'status') {
                loadStatus();
            } else if (tabName === 'wifi') {
                scanNetworks();
            }
        }
        
        function showStatus(message, type) {
            const statusDiv = document.getElementById('status-message');
            statusDiv.innerHTML = '<div class="status ' + type + '">' + message + '</div>';
            setTimeout(() => statusDiv.innerHTML = "", 5000);
        }
        
        function scanNetworks() {
            fetch('/scan')
                .then(response => response.json())
                .then(data => {
                    const listDiv = document.getElementById('network-list');
                    listDiv.innerHTML = "";
                    
                    if (data.networks && data.networks.length > 0) {
                        data.networks.forEach(network => {
                            const item = document.createElement('div');
                            item.className = 'network-item';
                            item.innerHTML = `
                                <strong>${network.ssid}</strong>
                                <span class="signal-strength">${network.rssi} dBm</span>
                            `;
                            item.onclick = () => selectNetwork(network.ssid);
                            listDiv.appendChild(item);
                        });
                    } else {
                        listDiv.innerHTML = '<div class="network-item">No networks found</div>';
                    }
                })
                .catch(error => {
                    showStatus('Failed to scan networks', 'error');
                });
        }
        
        function selectNetwork(ssid) {
            document.getElementById('ssid').value = ssid;
        }
        
        function connectWiFi() {
            const ssid = document.getElementById('ssid').value;
            const password = document.getElementById('password').value;
            
            if (!ssid) {
                showStatus('Please enter network name', 'error');
                return;
            }
            
            showStatus('Connecting to ' + ssid + '...', 'success');
            
            fetch('/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ssid: ssid, password: password })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showStatus('Connected successfully! Device will restart.', 'success');
                    setTimeout(() => location.reload(), 3000);
                } else {
                    showStatus('Connection failed: ' + data.message, 'error');
                }
            })
            .catch(error => {
                showStatus('Connection failed', 'error');
            });
        }
        
        function saveDeviceConfig() {
            const deviceId = document.getElementById('device-id').value;
            const apiUrl = document.getElementById('api-url').value;
            const deviceToken = document.getElementById('device-token').value;
            
            fetch('/device', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    device_id: deviceId, 
                    api_url: apiUrl, 
                    device_token: deviceToken 
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showStatus('Device settings saved successfully!', 'success');
                } else {
                    showStatus('Failed to save settings: ' + data.message, 'error');
                }
            })
            .catch(error => {
                showStatus('Failed to save settings', 'error');
            });
        }
        
        function loadStatus() {
            fetch('/status')
                .then(response => response.json())
                .then(data => {
                    const statusDiv = document.getElementById('device-status');
                    statusDiv.innerHTML = `
                        <div style="margin-bottom: 15px;">
                            <strong>Device ID:</strong> ${data.device_id}<br>
                            <strong>WiFi Status:</strong> ${data.wifi_connected ? 'Connected' : 'Disconnected'}<br>
                            <strong>IP Address:</strong> ${data.ip_address}<br>
                            <strong>Uptime:</strong> ${data.uptime}<br>
                            <strong>Free Memory:</strong> ${data.free_memory} bytes<br>
                            <strong>Fingerprint Sensor:</strong> ${data.fp_sensor_ok ? 'OK' : 'Error'}<br>
                            <strong>FP Templates:</strong> ${data.fp_count}
                        </div>
                    `;
                })
                .catch(error => {
                    document.getElementById('device-status').innerHTML = '<p>Failed to load status</p>';
                });
        }
        
        function restartDevice() {
            if (confirm('Are you sure you want to restart the device?')) {
                fetch('/restart', { method: 'POST' })
                    .then(() => {
                        showStatus('Device restarting...', 'success');
                        setTimeout(() => location.reload(), 5000);
                    });
            }
        }
        
        // Scan networks on page load
        window.onload = () => scanNetworks();
    </script>
</body>
</html>
)rawliteral";
  
  return html;
}

String scanWiFiNetworks() {
  String json = "{\"networks\":[";
  
  int n = WiFi.scanNetworks();
  for (int i = 0; i < n; i++) {
    if (i > 0) json += ",";
    json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + "}";
  }
  
  json += "]}";
  return json;
}

void handleWiFiConnect() {
  String body = server.arg("plain");
  DynamicJsonDocument doc(200);
  deserializeJson(doc, body);
  
  String ssid = doc["ssid"];
  String password = doc["password"];
  
  // Save credentials
  prefs.begin("bugema-iot", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", password);
  prefs.end();
  
  // Try to connect
  WiFi.begin(ssid.c_str(), password.c_str());
  
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    tries++;
  }
  
  String response;
  if (WiFi.status() == WL_CONNECTED) {
    response = "{\"success\":true,\"message\":\"Connected successfully\",\"ip\":\"" + WiFi.localIP().toString() + "\"}";
    apMode = false;
  } else {
    response = "{\"success\":false,\"message\":\"Connection failed\"}";
  }
  
  server.send(200, "application/json", response);
}

void handleDeviceConfig() {
  String body = server.arg("plain");
  DynamicJsonDocument doc(300);
  deserializeJson(doc, body);
  
  // Save device configuration
  prefs.begin("bugema-iot", false);
  if (doc.containsKey("device_id")) {
    prefs.putString("device_id", doc["device_id"].as<String>());
  }
  if (doc.containsKey("api_url")) {
    prefs.putString("api_url", doc["api_url"].as<String>());
  }
  if (doc.containsKey("device_token")) {
    prefs.putString("device_token", doc["device_token"].as<String>());
  }
  prefs.end();
  
  server.send(200, "application/json", "{\"success\":true,\"message\":\"Device settings saved\"}");
}

String getDeviceStatus() {
  String json = "{";
  json += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  json += "\"wifi_connected\":" + String(wifiConnected ? "true" : "false") + ",";
  json += "\"ip_address\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"uptime\":\"" + String(millis() / 1000) + " seconds\",";
  json += "\"free_memory\":" + String(ESP.getFreeHeap()) + ",";
  json += "\"fp_sensor_ok\":" + String(finger.verifyPassword() ? "true" : "false") + ",";
  json += "\"fp_count\":" + String(finger.templateCount);
  json += "}";
  
  return json;
}
// ... (rest of the code remains the same)
void connectWiFi(const char* ssid, const char* pass) {
  oledMsg("Connecting WiFi", ssid, "Please wait...");
  WiFi.begin(ssid, pass);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    tries++;
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
    oledMsg("WiFi Connected!", WiFi.localIP().toString(), "");
  } else {
    wifiConnected = false;
    oledMsg("WiFi FAILED", "Offline Mode", "Use BT to config");
  }
}

// ============================================================
//  UTILITY FUNCTIONS
// ============================================================
String getTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "1970-01-01T00:00:00Z";
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

int getNextFreeSlot() {
  finger.getTemplateCount();
  for (int i = 1; i <= 127; i++) {
    if (finger.loadModel(i) != FINGERPRINT_OK) return i;
  }
  return -1;
}

// ============================================================
//  DISPLAY HELPERS
// ============================================================
void showSplash() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(10, 5);  display.println("BUGEMA UNIVERSITY");
  display.setCursor(15, 20); display.println("Biometric Attend");
  display.setCursor(30, 35); display.println("System v2.0");
  display.setCursor(20, 52); display.println("Initializing...");
  display.display();
  delay(2000);
}

void showIdleScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(15, 0);  display.println("BUGEMA UNIVERSITY");
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  display.setCursor(0, 15);  display.println("[ENROLL]  Btn 1");
  display.setCursor(0, 26);  display.println("[ATTEND]  Btn 2");
  display.setCursor(0, 37);  display.println("[DELETE]  Btn 3");
  display.setCursor(0, 48);  display.println("[BT CFG]  Btn 4");
  display.setCursor(0, 58);
  display.println(wifiConnected ? "WiFi: OK" : "WiFi: OFFLINE");
  display.display();
}

void displayAttendanceIdle() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(5, 0);   display.println("ATTENDANCE ACTIVE");
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  display.setCursor(0, 15);  display.println("Course: " + currentCourseId.substring(0,15));
  display.setCursor(0, 27);  display.println("Session: " + currentSessionId.substring(0,15));
  display.setTextSize(2);
  display.setCursor(20, 40); display.println("SCAN FP");
  display.display();
}

void oledMsg(String line1, String line2, String line3) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 5);  display.println(line1);
  display.setCursor(0, 22); display.println(line2);
  display.setCursor(0, 40); display.println(line3);
  display.display();
}
