/**
 * ============================================================
 *  BUGEMA UNIVERSITY — BIOMETRIC ATTENDANCE SYSTEM
 *  Backend API — Node.js + Express + PostgreSQL
 *  Version 2.0
 * ============================================================
 *
 *  SETUP INSTRUCTIONS:
 *  1. Install Node.js (https://nodejs.org)
 *  2. npm install
 *  3. Copy .env.example to .env and fill in values
 *  4. Run database migrations: npm run migrate
 *  5. Start server: npm start
 *     Or for development: npm run dev
 *
 *  Free Hosting Options:
 *  - Railway.app  (PostgreSQL + Node.js, free tier)
 *  - Render.com   (PostgreSQL + Node.js, free tier)
 *  - Supabase     (PostgreSQL + REST, free tier)
 * ============================================================
 */

// package.json (create this file separately):
// {
//   "name": "bugema-attendance-api",
//   "version": "2.0.0",
//   "scripts": { "start": "node server.js", "dev": "nodemon server.js", "migrate": "node migrate.js" },
//   "dependencies": {
//     "express": "^4.18.2",
//     "pg": "^8.11.0",
//     "bcryptjs": "^2.4.3",
//     "jsonwebtoken": "^9.0.0",
//     "cors": "^2.8.5",
//     "dotenv": "^16.0.3",
//     "ws": "^8.14.2",
//     "uuid": "^9.0.0",
//     "express-rate-limit": "^7.1.0"
//   },
//   "devDependencies": { "nodemon": "^3.0.1" }
// }

'use strict';
require('dotenv').config();
const express    = require('express');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const { v4: uuidv4 } = require('uuid');
const { WebSocketServer } = require('ws');
const http       = require('http');
const rateLimit  = require('express-rate-limit');

const app  = express();
const server = http.createServer(app);

// ============================================================
//  TRUST PROXY (for Railway.app and other hosting platforms)
// ============================================================
app.set('trust proxy', true);

// ============================================================
//  DATABASE (PostgreSQL)
// ============================================================
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ============================================================
//  MIDDLEWARE
// ============================================================
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Rate limiting (configured for Railway.app)
const limiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for Railway health checks
  skip: (req) => req.url === '/health' || req.url === '/api/health'
});
app.use(limiter);

// ============================================================
//  WEBSOCKET SERVER (Real-time attendance updates to web app)
// ============================================================
const wss = new WebSocketServer({ server });
const clients = new Map(); // sessionId → Set<WebSocket>

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.replace('/?', ''));
  const sessionId = params.get('session_id');
  const token     = params.get('token');

  if (!verifyToken(token)) { ws.close(1008, 'Unauthorized'); return; }

  if (sessionId) {
    if (!clients.has(sessionId)) clients.set(sessionId, new Set());
    clients.get(sessionId).add(ws);
  }

  ws.on('close', () => {
    if (sessionId && clients.has(sessionId)) {
      clients.get(sessionId).delete(ws);
    }
  });
});

function broadcastToSession(sessionId, data) {
  if (!clients.has(sessionId)) return;
  const msg = JSON.stringify(data);
  clients.get(sessionId).forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// ============================================================
//  AUTH HELPERS
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });

  const token = header.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  req.user = decoded;
  next();
}

function deviceMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token !== process.env.ESP32_MASTER_TOKEN) {
    return res.status(401).json({ error: 'Invalid device token' });
  }
  next();
}

function lecturerOnly(req, res, next) {
  if (req.user.role !== 'lecturer') return res.status(403).json({ error: 'Lecturers only' });
  next();
}

// ============================================================
//  AUTH ROUTES
// ============================================================

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, student_id, employee_id, department, courses } = req.body;

  // Validate student ID format: YY/PROGRAMME/CAMPUS/CATEGORY/NUMBER
  if (role === 'student') {
    const idPattern = /^\d{2}\/[A-Z]+\/[A-Z]+\/[A-Z]\/\d{4}$/;
    if (!idPattern.test(student_id)) {
      return res.status(400).json({ error: 'Invalid student ID format. Expected: 24/BSE/BU/R/0004' });
    }
  }

  const hash = await bcrypt.hash(password, 10);
  const id   = uuidv4();

  try {
    await db.query(
      `INSERT INTO users (id, name, email, password_hash, role, student_id, employee_id, department)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, name, email, hash, role, student_id || null, employee_id || null, department || null]
    );

    // Enroll student in courses + auto-link to lecturers
    if (role === 'student' && courses && courses.length > 0) {
      for (const courseEntry of courses) {
        const { course_id, day, time } = courseEntry;
        await db.query(
          `INSERT INTO enrollments (student_id, course_id, day, time, enrolled_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (student_id, course_id) DO NOTHING`,
          [id, course_id, day, time]
        );
      }
    }

    const token = signToken({ id, name, email, role });
    res.json({ token, user: { id, name, email, role } });

  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email or Student ID already exists' });
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user   = result.rows[0];

  if (!user) return res.status(401).json({ error: 'User not found' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Wrong password' });

  const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

// ============================================================
//  COURSES
// ============================================================

// GET /api/courses — get all courses (lecturer: their own; student: enrolled)
app.get('/api/courses', authMiddleware, async (req, res) => {
  let query, params;
  if (req.user.role === 'lecturer') {
    query  = 'SELECT * FROM courses WHERE lecturer_id = $1 ORDER BY code';
    params = [req.user.id];
  } else {
    query  = `SELECT c.*, e.day, e.time FROM courses c
              JOIN enrollments e ON e.course_id = c.id
              WHERE e.student_id = $1 ORDER BY c.code`;
    params = [req.user.id];
  }
  const result = await db.query(query, params);
  res.json(result.rows);
});

// POST /api/courses — create course (lecturer only)
app.post('/api/courses', authMiddleware, lecturerOnly, async (req, res) => {
  const { code, name, total_classes, pass_criteria, attendance_weight, credit_hours, days, start_time, end_time } = req.body;
  const id = uuidv4();
  await db.query(
    `INSERT INTO courses (id, code, name, lecturer_id, total_classes, pass_criteria, attendance_weight, credit_hours, days, start_time, end_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, code, name, req.user.id, total_classes, pass_criteria || 75, attendance_weight || 20, credit_hours, days, start_time, end_time]
  );
  res.json({ id, code, name });
});

// GET /api/courses/:id/students — students enrolled in this course (for lecturer)
app.get('/api/courses/:id/students', authMiddleware, lecturerOnly, async (req, res) => {
  const result = await db.query(
    `SELECT u.id, u.name, u.email, u.student_id, fp.fp_sensor_id IS NOT NULL as has_fingerprint,
            COALESCE(
              ROUND(100.0 * COUNT(CASE WHEN a.status = 'present' THEN 1 END) / NULLIF(COUNT(a.id), 0)),
              0
            ) as attendance_pct
     FROM users u
     JOIN enrollments e ON e.student_id = u.id
     LEFT JOIN fingerprints fp ON fp.user_id = u.id
     LEFT JOIN attendance a ON a.student_id = u.id AND a.course_id = $1
     WHERE e.course_id = $1
     GROUP BY u.id, u.name, u.email, u.student_id, fp.fp_sensor_id
     ORDER BY u.name`,
    [req.params.id]
  );
  res.json(result.rows);
});

// ============================================================
//  SESSIONS
// ============================================================

// POST /api/sessions — start a session (lecturer)
app.post('/api/sessions', authMiddleware, lecturerOnly, async (req, res) => {
  const { course_id, device_id, duration_minutes } = req.body;
  const session_id = uuidv4();

  await db.query(
    `INSERT INTO sessions (id, course_id, lecturer_id, device_id, started_at, duration_minutes, status)
     VALUES ($1,$2,$3,$4,NOW(),$5,'active')`,
    [session_id, course_id, req.user.id, device_id, duration_minutes]
  );

  // Pre-populate absent marks for all enrolled students
  await db.query(
    `INSERT INTO attendance (id, session_id, course_id, student_id, status, marked_at)
     SELECT gen_random_uuid(), $1, $2, e.student_id, 'pending', NOW()
     FROM enrollments e WHERE e.course_id = $2`,
    [session_id, course_id]
  );

  res.json({ session_id, course_id, device_id, status: 'active' });
});

// GET /api/session/active — ESP32 fetches active session for its device
app.get('/api/session/active', deviceMiddleware, async (req, res) => {
  const { device_id } = req.query;
  const result = await db.query(
    `SELECT s.id as session_id, s.course_id, c.code as course_code, c.name as course_name
     FROM sessions s JOIN courses c ON c.id = s.course_id
     WHERE s.device_id = $1 AND s.status = 'active'
     ORDER BY s.started_at DESC LIMIT 1`,
    [device_id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'No active session' });
  res.json(result.rows[0]);
});

// POST /api/sessions/:id/stop
app.post('/api/sessions/:id/stop', authMiddleware, async (req, res) => {
  await db.query(
    `UPDATE sessions SET status = 'completed', ended_at = NOW() WHERE id = $1`,
    [req.params.id]
  );
  // Mark remaining 'pending' as 'absent'
  await db.query(
    `UPDATE attendance SET status = 'absent' WHERE session_id = $1 AND status = 'pending'`,
    [req.params.id]
  );
  res.json({ success: true });
});

// ============================================================
//  ATTENDANCE (from ESP32)
// ============================================================

// POST /v1/attendance — ESP32 posts a fingerprint scan
app.post('/v1/attendance', deviceMiddleware, async (req, res) => {
  const { device_id, fp_id, session_id, course_id, status, timestamp, confidence, offline } = req.body;

  // Look up student by fingerprint ID + device
  const fpResult = await db.query(
    'SELECT user_id FROM fingerprints WHERE fp_sensor_id = $1 AND device_id = $2',
    [fp_id, device_id]
  );

  if (fpResult.rows.length === 0) {
    return res.status(404).json({ error: 'Fingerprint not linked to any student' });
  }

  const student_id = fpResult.rows[0].user_id;

  // Prevent duplicate marks in same session
  const existing = await db.query(
    `SELECT id FROM attendance WHERE session_id = $1 AND student_id = $2 AND status = 'present'`,
    [session_id, student_id]
  );
  if (existing.rows.length > 0) {
    return res.json({ success: true, duplicate: true, message: 'Already marked present' });
  }

  // Update or insert attendance mark
  await db.query(
    `INSERT INTO attendance (id, session_id, course_id, student_id, status, marked_at, fp_id, confidence, from_offline)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (session_id, student_id)
     DO UPDATE SET status = $4, marked_at = $5, confidence = $7`,
    [session_id, course_id, student_id, status, timestamp || new Date(), fp_id, confidence || 0, offline || false]
  );

  // Get student name for real-time broadcast
  const stuResult = await db.query('SELECT name, student_id FROM users WHERE id = $1', [student_id]);
  const student   = stuResult.rows[0];

  // Broadcast to web app via WebSocket
  broadcastToSession(session_id, {
    type: 'attendance_update',
    student_id,
    student_name: student?.name,
    student_number: student?.student_id,
    status,
    timestamp,
    confidence,
    fp_id
  });

  res.json({ success: true, student_name: student?.name });
});

// ============================================================
//  FINGERPRINT MANAGEMENT
// ============================================================

// POST /api/fingerprint/register — link fp_id on sensor to student (lecturer does this)
app.post('/api/fingerprint/register', authMiddleware, lecturerOnly, async (req, res) => {
  const { student_id, fp_sensor_id, device_id } = req.body;

  // Check for duplicate fingerprint IDs (prevent sharing)
  const dup = await db.query(
    'SELECT id FROM fingerprints WHERE fp_sensor_id = $1 AND device_id = $2',
    [fp_sensor_id, device_id]
  );
  if (dup.rows.length > 0) {
    return res.status(409).json({ error: 'This fingerprint slot is already registered to another student' });
  }

  await db.query(
    `INSERT INTO fingerprints (id, user_id, fp_sensor_id, device_id, registered_by, registered_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, device_id) DO UPDATE SET fp_sensor_id = $2`,
    [student_id, fp_sensor_id, device_id, req.user.id]
  );

  res.json({ success: true, message: 'Fingerprint linked to student' });
});

// POST /v1/fingerprint/register — called by ESP32 after enrollment
app.post('/v1/fingerprint/register', deviceMiddleware, async (req, res) => {
  const { device_id, fp_id } = req.body;
  // Just log — actual student linking is done from the web app
  console.log(`[FP] New fingerprint enrolled on ${device_id}: slot #${fp_id}`);
  res.json({ success: true, fp_id, message: 'Link student from web app' });
});

// DELETE /api/fingerprint/:id
app.delete('/api/fingerprint/:userId', authMiddleware, lecturerOnly, async (req, res) => {
  await db.query('DELETE FROM fingerprints WHERE user_id = $1', [req.params.userId]);
  res.json({ success: true });
});

// ============================================================
//  STUDENTS MANAGEMENT
// ============================================================

// GET /api/students — lecturer gets all their students
app.get('/api/students', authMiddleware, lecturerOnly, async (req, res) => {
  const result = await db.query(
    `SELECT DISTINCT u.id, u.name, u.email, u.student_id,
            fp.fp_sensor_id IS NOT NULL as has_fingerprint
     FROM users u
     JOIN enrollments e ON e.student_id = u.id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN fingerprints fp ON fp.user_id = u.id
     WHERE c.lecturer_id = $1 AND u.role = 'student'
     ORDER BY u.name`,
    [req.user.id]
  );
  res.json(result.rows);
});

// POST /api/students/register — lecturer registers a new student + enrolls in courses
app.post('/api/students/register', authMiddleware, lecturerOnly, async (req, res) => {
  const { name, email, student_id, phone, school, year, courses } = req.body;

  // Validate student ID format
  const idPattern = /^\d{2}\/[A-Z]+\/[A-Z]+\/[A-Z]\/\d{4}$/;
  if (!idPattern.test(student_id)) {
    return res.status(400).json({ error: 'Invalid student ID. Expected format: 24/BSE/BU/R/0004' });
  }

  const userId = uuidv4();
  const tempPass = await bcrypt.hash('changeme123', 10); // Student sets their own later

  try {
    await db.query(
      `INSERT INTO users (id, name, email, password_hash, role, student_id, phone, school, year)
       VALUES ($1,$2,$3,$4,'student',$5,$6,$7,$8)`,
      [userId, name, email, tempPass, student_id, phone, school, year]
    );

    // Enroll in selected courses
    if (courses && courses.length > 0) {
      for (const c of courses) {
        await db.query(
          `INSERT INTO enrollments (student_id, course_id, day, time, enrolled_at)
           VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
          [userId, c.course_id, c.day, c.time]
        );
      }
    }

    res.json({ success: true, user_id: userId, message: 'Student registered. Courses linked to lecturers.' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Student ID or email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ============================================================
//  REPORTS
// ============================================================

// GET /api/reports/course/:id
app.get('/api/reports/course/:id', authMiddleware, async (req, res) => {
  const result = await db.query(
    `SELECT u.name, u.student_id,
            COUNT(a.id) as total_sessions,
            COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present,
            COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent,
            ROUND(100.0 * COUNT(CASE WHEN a.status = 'present' THEN 1 END) / NULLIF(COUNT(a.id),0)) as pct
     FROM users u
     JOIN enrollments e ON e.student_id = u.id
     LEFT JOIN attendance a ON a.student_id = u.id AND a.course_id = $1
     WHERE e.course_id = $1
     GROUP BY u.id, u.name, u.student_id
     ORDER BY pct DESC`,
    [req.params.id]
  );
  res.json(result.rows);
});

// GET /api/reports/student/:id
app.get('/api/reports/student/:id', authMiddleware, async (req, res) => {
  const result = await db.query(
    `SELECT c.code, c.name,
            COUNT(a.id) as total,
            COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present,
            ROUND(100.0 * COUNT(CASE WHEN a.status = 'present' THEN 1 END) / NULLIF(COUNT(a.id),0)) as pct
     FROM courses c
     JOIN enrollments e ON e.course_id = c.id
     LEFT JOIN attendance a ON a.course_id = c.id AND a.student_id = $1
     WHERE e.student_id = $1
     GROUP BY c.id, c.code, c.name`,
    [req.params.id]
  );
  res.json(result.rows);
});

// ============================================================
//  DEVICE MANAGEMENT
// ============================================================

// POST /v1/device/heartbeat — ESP32 pings every 60s
app.post('/v1/device/heartbeat', deviceMiddleware, async (req, res) => {
  const { device_id, session_active, offline_queue } = req.body;
  await db.query(
    `INSERT INTO devices (id, last_seen, session_active, offline_queue)
     VALUES ($1, NOW(), $2, $3)
     ON CONFLICT (id) DO UPDATE SET last_seen = NOW(), session_active = $2, offline_queue = $3`,
    [device_id, session_active, offline_queue]
  );
  res.json({ ok: true, server_time: new Date().toISOString() });
});

// GET /api/devices — get all registered devices
app.get('/api/devices', authMiddleware, lecturerOnly, async (req, res) => {
  const result = await db.query(
    `SELECT d.*, 
            CASE WHEN d.last_seen > NOW() - INTERVAL '2 minutes' THEN 'online' ELSE 'offline' END as status
     FROM devices d ORDER BY d.id`
  );
  res.json(result.rows);
});

// ============================================================
//  NOTIFICATIONS
// ============================================================

// GET /api/notifications
app.get('/api/notifications', authMiddleware, async (req, res) => {
  const result = await db.query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json(result.rows);
});

// ============================================================
//  DATABASE MIGRATION (run once with: node migrate.js)
// ============================================================
async function migrate() {
  const sql = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          VARCHAR(200) NOT NULL,
      email         VARCHAR(200) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          VARCHAR(20) NOT NULL CHECK (role IN ('lecturer','student')),
      student_id    VARCHAR(50) UNIQUE,
      employee_id   VARCHAR(50) UNIQUE,
      department    VARCHAR(200),
      phone         VARCHAR(30),
      school        VARCHAR(200),
      year          VARCHAR(20),
      created_at    TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS courses (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code                VARCHAR(20) NOT NULL,
      name                VARCHAR(300) NOT NULL,
      lecturer_id         UUID REFERENCES users(id),
      total_classes       INT DEFAULT 42,
      pass_criteria       INT DEFAULT 75,
      attendance_weight   INT DEFAULT 20,
      credit_hours        INT DEFAULT 3,
      days                TEXT[],
      start_time          TIME,
      end_time            TIME,
      created_at          TIMESTAMP DEFAULT NOW(),
      UNIQUE(code, lecturer_id)
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      student_id  UUID REFERENCES users(id),
      course_id   UUID REFERENCES courses(id),
      day         VARCHAR(20),
      time        TIME,
      enrolled_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id         UUID REFERENCES courses(id),
      lecturer_id       UUID REFERENCES users(id),
      device_id         VARCHAR(50),
      started_at        TIMESTAMP DEFAULT NOW(),
      ended_at          TIMESTAMP,
      duration_minutes  INT,
      status            VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','completed'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id    UUID REFERENCES sessions(id),
      course_id     UUID REFERENCES courses(id),
      student_id    UUID REFERENCES users(id),
      status        VARCHAR(20) CHECK (status IN ('present','absent','pending')),
      marked_at     TIMESTAMP,
      fp_id         INT,
      confidence    INT,
      from_offline  BOOLEAN DEFAULT FALSE,
      UNIQUE (session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS fingerprints (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID REFERENCES users(id),
      fp_sensor_id    INT NOT NULL,
      device_id       VARCHAR(50) NOT NULL,
      registered_by   UUID REFERENCES users(id),
      registered_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE (user_id, device_id),
      UNIQUE (fp_sensor_id, device_id)
    );

    CREATE TABLE IF NOT EXISTS devices (
      id              VARCHAR(50) PRIMARY KEY,
      location        VARCHAR(200),
      last_seen       TIMESTAMP,
      session_active  BOOLEAN DEFAULT FALSE,
      offline_queue   INT DEFAULT 0,
      token           TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID REFERENCES users(id),
      type        VARCHAR(50),
      title       VARCHAR(200),
      message     TEXT,
      read        BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    -- Index for fast lookups
    CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_fingerprints_fp_id ON fingerprints(fp_sensor_id, device_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
  `;

  await db.query(sql);
  console.log('✅ Database migrated successfully');
  process.exit(0);
}

// Run migration if called directly
if (process.argv[2] === 'migrate') {
  migrate().catch(console.error);
}

// ============================================================
//  HEALTH CHECK ENDPOINT (for Railway.app)
// ============================================================
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await db.query('SELECT 1');
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      websocket: 'active'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

app.get('/api/health', async (req, res) => {
  res.redirect('/health');
});

// ============================================================
//  START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════╗
  ║   BUGEMA UNIVERSITY ATTENDANCE API         ║
  ║   Running on port ${PORT}                     ║
  ║   WebSocket: ws://localhost:${PORT}           ║
  ╚════════════════════════════════════════════╝
  `);
});

module.exports = app;
