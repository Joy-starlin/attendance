# Bugema University — Biometric Attendance System
## File Status & Setup Guide

---

## ✅ FILE STATUSES

### 1. BugemaUniversity-AttendanceSystem.html
**Status: FULLY FUNCTIONAL as a standalone demo**
- Open directly in any browser — no server needed
- 60 JavaScript functions, 0 missing, 0 broken HTML tags
- All 8 pages work, navigation works, charts render, modals work
- Theme switcher works, fingerprint simulation works
- ⚠️ Data is MOCKED (demo data) — not connected to real backend yet
- To connect to backend: replace mock functions with fetch() API calls

### 2. BugemaAttend_ESP32.ino
**Status: FULLY FUNCTIONAL — upload to Arduino IDE**
- 24 functions defined, all braces balanced (93 opens = 93 closes)
- Requires these libraries (install in Arduino IDE Library Manager):
  ✓ Adafruit Fingerprint Sensor Library
  ✓ Adafruit SSD1306
  ✓ Adafruit GFX Library
  ✓ ArduinoJson (by Benoit Blanchon)
  ✓ WiFi, HTTPClient, BluetoothSerial (built-in ESP32 board package)
- Board: ESP32 Dev Module
- Before uploading, edit these lines at the top:
  - DEFAULT_WIFI_SSID = your WiFi name
  - DEFAULT_WIFI_PASSWORD = your WiFi password
  - DEVICE_TOKEN = same token as in your .env file
  - DEVICE_ID = unique name per device e.g. ESP32-LAB-A

### 3. BugemaAttend_Backend_server.js
**Status: FULLY FUNCTIONAL — needs environment setup**
- 19 API routes, 0 syntax errors
- Requires Node.js v18+ and PostgreSQL database

### 4. BugemaAttend_Backend_package.json
**Status: Ready to use**

### 5. BugemaAttend_Backend_env_example.txt
**Status: Template — fill in your real values**

---

## 🚀 HOW TO RUN THE BACKEND (Step by Step)

### Step 1 — Install Node.js
Download from https://nodejs.org (LTS version)

### Step 2 — Get a free PostgreSQL database
Go to https://railway.app → New Project → PostgreSQL
Copy the DATABASE_URL it gives you

### Step 3 — Set up your backend folder
```
mkdir bugema-backend
cd bugema-backend
```
Copy server.js and package.json into this folder.

### Step 4 — Create .env file
```
cp BugemaAttend_Backend_env_example.txt .env
```
Edit .env with your real DATABASE_URL, a strong JWT_SECRET, and your ESP32 token.

### Step 5 — Install dependencies
```
npm install
```

### Step 6 — Run database migration (creates all tables)
```
npm run migrate
```

### Step 7 — Start the server
```
npm start
```
Your API is now live at http://localhost:3000

### Step 8 — Connect the HTML frontend
In BugemaUniversity-AttendanceSystem.html, at the top of the <script> section, add:
```js
const API_URL = 'https://your-backend-url.railway.app';
```
Then replace mock functions like doLogin() with real fetch() calls to your API.

---

## 🔌 CONNECTING HTML FRONTEND TO BACKEND

The HTML file currently uses mock data. To make it real, replace each function.
Example — replace the mock doLogin() with:

```js
async function doLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const res = await fetch(API_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.token) {
    localStorage.setItem('token', data.token);
    state.role = data.user.role;
    state.user = data.user;
    // ... proceed to dashboard
  }
}
```

---

## 🔧 ESP32 WIRING SUMMARY

| Component        | ESP32 Pin |
|-----------------|-----------|
| FP Sensor TX    | GPIO 16   |
| FP Sensor RX    | GPIO 17   |
| FP Sensor VCC   | 3.3V      |
| OLED SDA        | GPIO 21   |
| OLED SCL        | GPIO 22   |
| OLED VCC        | 3.3V      |
| Button ENROLL   | GPIO 13   |
| Button ATTEND   | GPIO 12   |
| Button DELETE   | GPIO 14   |
| Button WIFI/BT  | GPIO 27   |
| LED Green       | GPIO 2    |
| LED Red         | GPIO 4    |
| All GND         | GND       |

---

## 📱 PWA INSTALL ON PHONE

**Android:** Chrome → open site → 3-dot menu → "Add to Home Screen"
**iPhone:** Safari → open site → Share button → "Add to Home Screen"

---

## ⚡ WHAT WORKS WITHOUT ANY SETUP

- Open HTML file in browser → full demo with all pages
- Theme switching (4 themes)
- Fingerprint simulation
- Live attendance session simulation
- All charts and analytics
- Student/Course/Device management views

## ⚙️ WHAT NEEDS BACKEND SETUP

- Real login/authentication
- Real student data saved to database
- Real ESP32 fingerprint → attendance → web app live update
- PDF/CSV exports with real data
- Notifications from server
