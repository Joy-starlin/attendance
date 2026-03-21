#include <WiFi.h>
#include <WiFiManager.h> // https://github.com/tzapu/WiFiManager
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Adafruit_Fingerprint.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// --- CONFIGURATION ---
// WiFi credentials removed! Handled by WiFiManager AP.

// OLED Display Configuration
#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels
#define OLED_RESET    -1 // Reset pin # (or -1 if sharing Arduino reset pin)
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// API Server Details
// Important: Cannot use 'localhost' here. Use the IPv4 address of your computer running the Node server.
const char* websocket_host = "192.168.1.100"; 
const uint16_t websocket_port = 3008;
const char* websocket_path = "/";

// Device Identification
const char* device_id = "esp32-hall-A";

// Fingerprint Sensor Serial (Using HardwareSerial 2 on ESP32)
// TX = 17, RX = 16 
HardwareSerial mySerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

WebSocketsClient webSocket;

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected!");
      break;
    case WStype_CONNECTED:
      Serial.printf("[WS] Connected to url: %s\n", payload);
      // Send a handshake or authentication message if your API requires it
      break;
    case WStype_TEXT:
      Serial.printf("[WS] Received text: %s\n", payload);
      break;
  }
}

void updateDisplay(String text) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(text);
  display.display();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // 0. Initialize OLED
  Wire.begin(); 
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { // Default I2C address 0x3C
    Serial.println(F("SSD1306 allocation failed"));
    for(;;); // Don't proceed, loop forever
  }
  updateDisplay("Starting Up...");
  
  // 1. Connect to WiFi using WiFiManager
  Serial.println("\nStarting WiFiManager...");
  updateDisplay("WiFi Setup\nConnect to AP:\nBiometric-Scanner");
  
  WiFiManager wm;
  bool res = wm.autoConnect("Biometric-Scanner"); // Creates AP if no saved WiFi
  if(!res) {
    Serial.println("Failed to connect to WiFi and hit timeout");
    updateDisplay("WiFi Failed!\nRestarting...");
    delay(3000);
    ESP.restart();
  } 
  
  Serial.println("\nWiFi Connected! IP Address: ");
  Serial.println(WiFi.localIP());
  updateDisplay("WiFi Connected!\n" + WiFi.localIP().toString());
  delay(2000);

  // 2. Initialize Fingerprint Sensor
  Serial.println("\nInitializing Fingerprint Sensor...");
  finger.begin(57600);
  if (finger.verifyPassword()) {
    Serial.println("Found fingerprint sensor!");
  } else {
    Serial.println("Did not find fingerprint sensor :(");
    while (1) { delay(1); }
  }

  // 3. Connect to WebSocket
  Serial.println("Connecting to WebSocket Server...");
  webSocket.begin(websocket_host, websocket_port, websocket_path);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000); // Try to reconnect every 5s if dropped
}

void loop() {
  webSocket.loop();
  
  // Check for fingerprint scan
  int p = finger.getImage();
  if (p == FINGERPRINT_OK) {
    p = finger.image2Tz();
    if (p == FINGERPRINT_OK) {
      p = finger.fingerFastSearch();
      if (p == FINGERPRINT_OK) {
        // Fingerprint matched!
        Serial.print("Found ID #"); Serial.print(finger.fingerID);
        Serial.print(" with confidence of "); Serial.println(finger.confidence);
        
        // Construct JSON Payload for Biometric System
        StaticJsonDocument<200> doc;
        doc["type"] = "scan";
        doc["device_id"] = device_id;
        doc["fingerprint_id"] = finger.fingerID;
        doc["confidence"] = finger.confidence;
        doc["timestamp"] = millis(); // or use NTP for real time
        
        String jsonString;
        serializeJson(doc, jsonString);
        
        // Send to Server
        Serial.print("Sending: ");
        Serial.println(jsonString);
        webSocket.sendTXT(jsonString);
        
        // Debounce
        delay(2000);
      } else {
        Serial.println("Fingerprint not found in database.");
        delay(1000);
      }
    }
  }
}
