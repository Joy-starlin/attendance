#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h> // Standard HTTP for Localhost
#include <BluetoothSerial.h>
#include <Adafruit_Fingerprint.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include <WiFiManager.h>

// ============================================================
//  HARDWARE & CONFIG
// ============================================================
LiquidCrystal_I2C lcd(0x27, 16, 2); 
#define FP_RX 16
#define FP_TX 17

HardwareSerial fpSerial(2);
Adafruit_Fingerprint finger(&fpSerial);
BluetoothSerial SerialBT;

// LOCALHOST CONFIGURATION
// Using your Laptop's IPv4 address and Port 3008
const char* API_BASE_URL = "http://192.168.106.56:3008/v1"; 
const char* DEVICE_ID    = "ESP32-BU-01"; 
const char* DEVICE_TOKEN = "my_secret_key_123"; 

// State
enum DeviceMode { MODE_IDLE, MODE_ATTEND, MODE_ENROLL };
DeviceMode currentMode = MODE_IDLE;
bool wifiConnected = false;
String currentSessionId = "";
String enrollStudentId = "";
String enrollStudentName = "";
int enrollFingerId = -1;
uint8_t nextAvailableSlot = 1;  // Cache for faster enrollment

// ============================================================
//  HELPERS
// ============================================================
void lcdMsg(String line1, String line2 = "") {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
  Serial.println("LCD: " + line1 + " | " + line2);
}

// ============================================================
//  API SERVICES
// ============================================================
void sendAttendance(int fpId) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client; // Standard client (no SSL)
  HTTPClient http;
  
  http.begin(client, String(API_BASE_URL) + "/attendance");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));

  StaticJsonDocument<200> doc;
  doc["device_id"] = DEVICE_ID;
  doc["fp_id"] = fpId;
  doc["session_id"] = currentSessionId;
  doc["status"] = "present";

  String requestBody;
  serializeJson(doc, requestBody);
  
  int httpResponseCode = http.POST(requestBody);
  if (httpResponseCode > 0) {
    lcdMsg("MARKED!", "ID: " + String(fpId));
  } else {
    lcdMsg("API ERROR", "Code: " + String(httpResponseCode));
  }
  http.end();
}

void registerFingerprint(int fpId, String studentId) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;
  
  http.begin(client, String(API_BASE_URL) + "/fingerprint/register");
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["device_id"] = DEVICE_ID;
  doc["fp_id"] = fpId;
  doc["student_id"] = studentId;

  String requestBody;
  serializeJson(doc, requestBody);
  
  int httpResponseCode = http.POST(requestBody);
  if (httpResponseCode == 201) {
    lcdMsg("ENROLLED!", "ID: " + String(fpId));
    Serial.println("Fingerprint registered: " + String(fpId) + " for student " + studentId);
  } else {
    lcdMsg("REG FAILED", "Code: " + String(httpResponseCode));
    Serial.println("Failed to register fingerprint. Code: " + String(httpResponseCode));
  }
  http.end();
}

void handleEnrollment() {
  static int step = 0;
  static uint8_t fingerId = 0;
  
  // Turn on LED so sensor can see the finger
  finger.LEDcontrol(true);
  
  // Find empty slot (start from cached position)
  if (fingerId == 0) {
    fingerId = nextAvailableSlot;
    // Verify slot is actually empty, if not search from beginning
    if (finger.loadModel(fingerId) == FINGERPRINT_OK) {
      // Slot was taken, search for empty one
      for (uint8_t i = 1; i < 128; i++) {
        if (finger.loadModel(i) != FINGERPRINT_OK) {
          fingerId = i;
          break;
        }
      }
    }
    if (fingerId == 0 || fingerId >= 128) {
      lcdMsg("DB FULL", "Delete some");
      finger.LEDcontrol(false);
      currentMode = MODE_IDLE;
      return;
    }
    nextAvailableSlot = fingerId + 1;  // Cache next slot for next time
    enrollFingerId = fingerId;
    lcdMsg("PLACE FINGER", "Slot " + String(fingerId));
    step = 0;
  }

  uint8_t p = finger.getImage();
  if (p != FINGERPRINT_OK) return;

  if (step == 0) {
    p = finger.image2Tz(1);
    if (p != FINGERPRINT_OK) {
      lcdMsg("TRY AGAIN", "Bad image");
      return;
    }
    // Don't show REMOVE, go straight to asking for second placement
    lcdMsg("PLACE AGAIN", "Same finger");
    step = 1;
  } else if (step == 1) {
    // Wait for finger removal with small delay to avoid hammering
    p = finger.getImage();
    if (p != FINGERPRINT_NOFINGER) {
      delay(50);
      return;
    }
    // Finger removed, now wait for re-placement
    step = 2;
  } else if (step == 2) {
    p = finger.getImage();
    if (p != FINGERPRINT_OK) return;
    
    p = finger.image2Tz(2);
    if (p != FINGERPRINT_OK) {
      lcdMsg("TRY AGAIN", "Bad image");
      step = 0;
      return;
    }
    
    p = finger.createModel();
    if (p != FINGERPRINT_OK) {
      lcdMsg("MISMATCH", "Try again");
      step = 0;
      return;
    }
    
    p = finger.storeModel(enrollFingerId);
    if (p == FINGERPRINT_OK) {
      registerFingerprint(enrollFingerId, enrollStudentId);
      finger.LEDcontrol(false); // Turn off LED on success
      currentMode = MODE_IDLE;
      fingerId = 0;
      enrollFingerId = -1;
    } else {
      String errorMsg;
      switch(p) {
        case 0x0B: errorMsg = "Bad Location"; break;
        case 0x10: errorMsg = "Flash Error"; break;
        case 0x11: errorMsg = "Bad Image"; break;
        case 0x12: errorMsg = "Image Messy"; break;
        case 0x13: errorMsg = "Too Featureless"; break;
        case 0x15: errorMsg = "Invalid Image"; break;
        case 0x18: errorMsg = "Flash Read Error"; break;
        case 0x19: errorMsg = "Flash Write Error"; break;
        case 0x1A: errorMsg = "Flash Error"; break;
        case 0x01: errorMsg = "Full DB"; break;
        default: errorMsg = "Err " + String(p, HEX); break;
      }
      lcdMsg("STORE FAIL", errorMsg);
      Serial.print(">>> Store fail: "); Serial.println(p, HEX);
      finger.LEDcontrol(false); // Turn off LED on failure
      step = 0;
    }
  }
}

void checkRemoteCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client; 
  HTTPClient http;
  
  String url = String(API_BASE_URL) + "/device/heartbeat";
  
  if (http.begin(client, url)) {
    http.addHeader("Authorization", "Bearer " + String(DEVICE_TOKEN));
    http.addHeader("Content-Type", "application/json"); 

    String body = "{\"device_id\":\"" + String(DEVICE_ID) + "\"}";
    
    Serial.println(">>> Heartbeat to Laptop: " + url);
    int httpCode = http.POST(body); 
    
    if (httpCode == 200) {
      String payload = http.getString();
      Serial.println(">>> Success: " + payload);
      StaticJsonDocument<256> doc;
      deserializeJson(doc, payload);

      if (doc.containsKey("command")) {
        String cmd = doc["command"].as<String>();
        if (cmd == "START_SESSION") {
          currentSessionId = doc["session_id"].as<String>();
          currentMode = MODE_ATTEND;
          lcdMsg("SESSION START", "Ready to Scan");
        } else if (cmd == "STOP_SESSION") {
          currentMode = MODE_IDLE;
          currentSessionId = "";
          lcdMsg("SESSION STOPPED", "Idle Mode");
        } else if (cmd == "ENROLL") {
          enrollStudentId = doc["student_id"].as<String>();
          enrollStudentName = doc["student_name"].as<String>();
          currentMode = MODE_ENROLL;
          enrollFingerId = -1;
          lcdMsg("ENROLL MODE", enrollStudentName.substring(0, 16));
          Serial.println("Enrolling for student: " + enrollStudentId);
        }
      }
    } else {
      Serial.print(">>> Failed. Code: ");
      Serial.println(httpCode);
      if(httpCode == -1) Serial.println("Tip: Check Firewall & Laptop IP!");
    }
    http.end();
  }
}

// ============================================================
//  SETUP & LOOP
// ============================================================
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  
  lcd.init();
  lcd.backlight();
  lcdMsg("BUGEMA UNIV", "LOCAL MODE");

  fpSerial.begin(57600, SERIAL_8N1, FP_RX, FP_TX);
  finger.begin(57600);

  // Verify sensor connection
  if (finger.verifyPassword()) {
    Serial.println(">>> Fingerprint sensor OK");
    uint8_t p = finger.getParameters();
    if (p == FINGERPRINT_OK) {
      Serial.print(">>> Capacity: "); Serial.println(finger.capacity);
    }
  } else {
    Serial.println(">>> ERROR: Sensor not found!");
    lcdMsg("SENSOR ERROR", "Check wiring");
  }

  WiFiManager wm;
  WiFi.setSleep(false); 

  // Make sure your ESP32 connects to the SAME network as your laptop
  if (!wm.autoConnect("AttendanceSystemAP")) {
    lcdMsg("WIFI FAILED", "REBOOTING...");
    delay(3000);
    ESP.restart();
  }
  
  wifiConnected = true;
  lcdMsg("WIFI OK", WiFi.localIP().toString());
  SerialBT.begin("BU-ATTEND-DEVICE");
  delay(2000);
}

void loop() {
  static unsigned long lastCheck = 0;
  // Local heartbeat is fast, so we check every 10 seconds
  if (millis() - lastCheck > 10000) {
    checkRemoteCommands();
    lastCheck = millis();
  }

  if (currentMode == MODE_ENROLL) {
    handleEnrollment();
  } else if (currentMode == MODE_ATTEND) {
    uint8_t p = finger.getImage();
    if (p == FINGERPRINT_OK) {
      if (finger.image2Tz() == FINGERPRINT_OK) {
        if (finger.fingerSearch() == FINGERPRINT_OK) {
          sendAttendance(finger.fingerID);
          delay(3000); 
          lcdMsg("SCAN FINGER", "Session Active");
        } else {
          lcdMsg("NOT FOUND", "Try Again");
          delay(2000);
        }
      }
    }
  }

  if (SerialBT.available()) {
    String cmd = SerialBT.readStringUntil('\n');
    cmd.trim();
    if (cmd == "START") {
       currentMode = MODE_ATTEND;
       currentSessionId = "MANUAL_BT";
       lcdMsg("BT SESSION", "STARTED");
    }
  }
  
  delay(100);
}