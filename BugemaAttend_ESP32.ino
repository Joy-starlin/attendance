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
#include <Preferences.h>       // For saving WiFi creds to flash
#include <time.h>

// ============================================================
//  CONFIGURATION — CHANGE THESE
// ============================================================
const char* DEFAULT_WIFI_SSID     = "BU-Campus-WiFi";
const char* DEFAULT_WIFI_PASSWORD = "yourpassword";

// Backend API (your Node.js server URL)
const char* API_BASE_URL          = "https://api.bugema.ac.ug/v1";
const char* API_ATTENDANCE_ENDPOINT = "/attendance";
const char* API_FP_REGISTER_ENDPOINT = "/fingerprint/register";
const char* API_DEVICE_HEARTBEAT  = "/device/heartbeat";

// This device's unique ID — change per device
const char* DEVICE_ID             = "ESP32-LAB-A";
const char* DEVICE_TOKEN          = "tok_esp32_your_secret_token_here";

// NTP Time server for timestamps
const char* NTP_SERVER            = "pool.ntp.org";
const long  GMT_OFFSET_SEC        = 10800;   // EAT = UTC+3
const int   DAYLIGHT_OFFSET_SEC   = 0;

// Session lock time (minutes after session close, no new marks)
const int   SESSION_LOCK_MINUTES  = 5;

// ============================================================
//  PIN DEFINITIONS
// ============================================================
#define BTN_ENROLL    13
#define BTN_ATTEND    12
#define BTN_DELETE    14
#define BTN_WIFI      27
#define LED_GREEN     2
#define LED_RED       4
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

// ============================================================
//  STATE VARIABLES
// ============================================================
enum DeviceMode { MODE_IDLE, MODE_ATTEND, MODE_ENROLL, MODE_DELETE, MODE_BT };
DeviceMode currentMode = MODE_IDLE;

bool wifiConnected     = false;
bool sessionActive     = false;
bool bluetoothMode     = false;
String currentSessionId = "";
String currentCourseId  = "";

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

// Debounce
unsigned long lastBtnPress[4] = {0,0,0,0};
const int DEBOUNCE_MS = 300;

// Heartbeat timer
unsigned long lastHeartbeat = 0;

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);

  // Pins
  pinMode(BTN_ENROLL, INPUT_PULLUP);
  pinMode(BTN_ATTEND, INPUT_PULLUP);
  pinMode(BTN_DELETE, INPUT_PULLUP);
  pinMode(BTN_WIFI,   INPUT_PULLUP);
  pinMode(LED_GREEN,  OUTPUT);
  pinMode(LED_RED,    OUTPUT);
  ledOff();

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
    flashRed(5);
  }

  // Load saved WiFi creds from flash
  prefs.begin("bugema-iot", false);
  String savedSSID = prefs.getString("ssid", DEFAULT_WIFI_SSID);
  String savedPASS = prefs.getString("pass", DEFAULT_WIFI_PASSWORD);

  // Connect WiFi
  connectWiFi(savedSSID.c_str(), savedPASS.c_str());

  // Bluetooth (always available as fallback)
  SerialBT.begin("BU-Attend-" + String(DEVICE_ID));

  oledMsg("BUGEMA UNIV.", "System Ready");
  delay(1500);
  showIdleScreen();
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
  checkButtons();
  handleBluetoothConfig();

  // Heartbeat every 60 seconds
  if (millis() - lastHeartbeat > 60000 && wifiConnected) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }

  // Try to sync offline queue
  if (wifiConnected && offlineCount > 0) {
    syncOfflineQueue();
  }

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
    default:
      break;
  }
}

// ============================================================
//  BUTTON HANDLING
// ============================================================
void checkButtons() {
  unsigned long now = millis();

  // BTN_ENROLL — toggle enroll mode
  if (digitalRead(BTN_ENROLL) == LOW && now - lastBtnPress[0] > DEBOUNCE_MS) {
    lastBtnPress[0] = now;
    if (currentMode != MODE_ENROLL) {
      currentMode = MODE_ENROLL;
      oledMsg("ENROLL MODE", "Waiting...");
    } else {
      currentMode = MODE_IDLE;
      showIdleScreen();
    }
  }

  // BTN_ATTEND — start/stop session
  if (digitalRead(BTN_ATTEND) == LOW && now - lastBtnPress[1] > DEBOUNCE_MS) {
    lastBtnPress[1] = now;
    if (!sessionActive) {
      startSession();
    } else {
      stopSession();
    }
  }

  // BTN_DELETE — delete mode
  if (digitalRead(BTN_DELETE) == LOW && now - lastBtnPress[2] > DEBOUNCE_MS) {
    lastBtnPress[2] = now;
    if (currentMode != MODE_DELETE) {
      currentMode = MODE_DELETE;
      oledMsg("DELETE MODE", "Scan to delete");
    } else {
      currentMode = MODE_IDLE;
      showIdleScreen();
    }
  }

  // BTN_WIFI — toggle Bluetooth config mode
  if (digitalRead(BTN_WIFI) == LOW && now - lastBtnPress[3] > DEBOUNCE_MS) {
    lastBtnPress[3] = now;
    bluetoothMode = !bluetoothMode;
    if (bluetoothMode) {
      currentMode = MODE_BT;
      oledMsg("BLUETOOTH MODE", "Connect app", "BU-Attend-" + String(DEVICE_ID));
    } else {
      currentMode = MODE_IDLE;
      showIdleScreen();
    }
  }
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
    flashGreen(2);
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
    flashGreen(2);
  } else if (code == 404) {
    oledMsg("NO ACTIVE SESSION", "Start one from", "the web app");
    flashRed(3);
  } else {
    oledMsg("API ERROR", "Code: " + String(code), "Check server");
    flashRed(2);
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
  flashGreen(1);
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
    flashGreen(1);

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
  oledMsg("ENROLL MODE", "Enter ID via BT", "or press ENROLL");

  // Get next available slot
  int id = getNextFreeSlot();
  if (id < 0) {
    oledMsg("MEMORY FULL", "Delete old FPs", "first");
    flashRed(3);
    currentMode = MODE_IDLE;
    return;
  }

  oledMsg("ENROLLING", "Slot #" + String(id), "Scan finger x2");
  delay(1000);

  // First scan
  oledMsg("SCAN 1/2", "Place finger", "firmly on sensor");
  while (finger.getImage() != FINGERPRINT_OK) {
    delay(200);
    if (digitalRead(BTN_ENROLL) == LOW) { currentMode = MODE_IDLE; return; }
  }
  finger.image2Tz(1);
  oledMsg("SCAN 1/2 OK", "Lift finger", "");
  delay(1500);

  while (finger.getImage() != FINGERPRINT_NOFINGER) delay(200);

  // Second scan
  oledMsg("SCAN 2/2", "Place same finger", "again");
  while (finger.getImage() != FINGERPRINT_OK) {
    delay(200);
    if (digitalRead(BTN_ENROLL) == LOW) { currentMode = MODE_IDLE; return; }
  }
  finger.image2Tz(2);

  uint8_t p = finger.createModel();
  if (p != FINGERPRINT_OK) {
    oledMsg("ENROLL FAILED", "Scans didn't match", "Try again");
    flashRed(3);
    currentMode = MODE_IDLE;
    return;
  }

  p = finger.storeModel(id);
  if (p == FINGERPRINT_OK) {
    oledMsg("ENROLLED!", "FP ID: #" + String(id), "Saved to sensor");
    flashGreen(3);

    // Notify backend
    if (wifiConnected) {
      HTTPClient http;
      http.begin(String(API_BASE_URL) + String(API_FP_REGISTER_ENDPOINT));
      http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));
      http.addHeader("Content-Type", "application/json");
      String body = "{\"device_id\":\"" + String(DEVICE_ID) +
                    "\",\"fp_id\":" + String(id) + "}";
      http.POST(body);
      http.end();
    }
  } else {
    oledMsg("STORE FAILED", "Error: " + String(p), "");
    flashRed(2);
  }

  delay(2000);
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
    if (digitalRead(BTN_DELETE) == LOW) { currentMode = MODE_IDLE; showIdleScreen(); return; }
    uint8_t p = finger.getImage();
    if (p != FINGERPRINT_OK) { delay(200); continue; }
    finger.image2Tz();
    if (finger.fingerSearch() == FINGERPRINT_OK) {
      uint8_t id = finger.fingerID;
      finger.deleteModel(id);
      oledMsg("DELETED", "FP ID: #" + String(id), "Removed");
      flashRed(2);
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
  http.begin(String(API_BASE_URL) + String(API_DEVICE_HEARTBEAT));
  http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));
  http.addHeader("Content-Type", "application/json");

  String body = "{\"device_id\":\"" + String(DEVICE_ID) + "\",";
  body += "\"session_active\":" + String(sessionActive ? "true" : "false") + ",";
  body += "\"offline_queue\":" + String(offlineCount) + "}";

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
  return (code == 200 || code == 201);
}

// ============================================================
//  BLUETOOTH CONFIG MODE
// ============================================================
/**
 * Connect to the ESP32 via Bluetooth Serial from any phone
 * using a Bluetooth terminal app (e.g. Serial Bluetooth Terminal).
 *
 * Commands:
 *   WIFI:SSID:PASSWORD       — Set new WiFi credentials
 *   STATUS                   — Get device status
 *   REBOOT                   — Reboot device
 */
void handleBluetoothConfig() {
  if (!SerialBT.available()) return;

  String cmd = SerialBT.readStringUntil('\n');
  cmd.trim();
  Serial.println("[BT CMD] " + cmd);

  if (cmd.startsWith("WIFI:")) {
    // Format: WIFI:SSID:PASSWORD
    int first  = cmd.indexOf(':', 5);
    int second = cmd.lastIndexOf(':');
    if (first > 0 && second > first) {
      String ssid = cmd.substring(5, first);
      String pass = cmd.substring(first + 1);
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
    SerialBT.println("Device: " + String(DEVICE_ID));
    SerialBT.println("WiFi: " + String(wifiConnected ? WiFi.SSID() + " (" + WiFi.localIP().toString() + ")" : "Disconnected"));
    SerialBT.println("Session: " + String(sessionActive ? currentSessionId : "None"));
    SerialBT.println("Offline queue: " + String(offlineCount));
    SerialBT.println("FP count: " + String(finger.templateCount));

  } else if (cmd == "REBOOT") {
    SerialBT.println("Rebooting...");
    delay(500);
    ESP.restart();

  } else {
    SerialBT.println("Unknown command: " + cmd);
    SerialBT.println("Commands: WIFI:SSID:PASS | STATUS | REBOOT");
  }
}

// ============================================================
//  WIFI CONNECTION
// ============================================================
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
    flashGreen(2);
  } else {
    wifiConnected = false;
    oledMsg("WiFi FAILED", "Offline Mode", "Use BT to config");
    flashRed(3);
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

// ============================================================
//  LED HELPERS
// ============================================================
void ledOff() {
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED,   LOW);
}

void flashGreen(int n) {
  for (int i = 0; i < n; i++) {
    digitalWrite(LED_GREEN, HIGH);
    delay(200);
    digitalWrite(LED_GREEN, LOW);
    delay(150);
  }
}

void flashRed(int n) {
  for (int i = 0; i < n; i++) {
    digitalWrite(LED_RED, HIGH);
    delay(200);
    digitalWrite(LED_RED, LOW);
    delay(150);
  }
}
