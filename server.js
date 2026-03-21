/**
 * Unified Server for Bugema University Attendance System
 * Supports MySQL and PostgreSQL
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3008);

// Middleware
app.use(cors());
app.use(express.json());

const deviceCommands = new Map(); // id -> { command: string, student_id: string }

// Frontend serving
const FRONTEND_DIST = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(FRONTEND_DIST));
app.use(express.static(__dirname));

// DATABASE SELECTION
const isPostgres = !!process.env.DATABASE_URL || process.env.DB_TYPE === 'postgres';
let pool;

if (isPostgres) {
  console.log('🐘 Using PostgreSQL');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false
  });
} else {
  console.log('🐬 Using MySQL');
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bugema_attendance',
    waitForConnections: true,
    connectionLimit: 10
  });
}

// DB Wrapper to unify MySQL and Postgres queries
const db = {
  execute: async (sql, params = []) => {
    if (isPostgres) {
      // Convert ? to $1, $2, etc.
      let i = 1;
      const pgSql = sql.replace(/\?/g, () => `$${i++}`);
      const result = await pool.query(pgSql, params);
      return [result.rows, result];
    } else {
      return await pool.execute(sql, params);
    }
  }
};

// Test Connection
async function testConnection() {
  try {
    if (isPostgres) {
      const client = await pool.connect();
      console.log('✅ PostgreSQL connected');
      client.release();
    } else {
      const connection = await pool.getConnection();
      console.log('✅ MySQL connected');
      connection.release();
    }
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
}

// Initialize Tables
async function initDatabase() {
  try {
    const textType = isPostgres ? 'TEXT' : 'TEXT';
    const timestampType = isPostgres ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP';
    const uuidType = isPostgres ? 'CHAR(36)' : 'CHAR(36)';

    // Users
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id ${uuidType} PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL,
        employee_id VARCHAR(50),
        department VARCHAR(255),
        student_id VARCHAR(50),
        year_of_study INT,
        phone VARCHAR(20),
        created_at ${timestampType},
        updated_at ${timestampType},
        last_login ${timestampType},
        is_active INT DEFAULT 1
      )
    `);

    // Courses
    await db.execute(`
      CREATE TABLE IF NOT EXISTS courses (
        id ${uuidType} PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        lecturer_id ${uuidType},
        description ${textType},
        total_classes INT DEFAULT 0,
        pass_criteria INT DEFAULT 75,
        created_at ${timestampType},
        updated_at ${timestampType}
      )
    `);

    // Enrollment
    await db.execute(`
      CREATE TABLE IF NOT EXISTS student_courses (
        student_id ${uuidType} NOT NULL,
        course_id ${uuidType} NOT NULL,
        enrolled_at ${timestampType},
        PRIMARY KEY (student_id, course_id)
      )
    `);

    // Devices
    await db.execute(`
      CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255),
        location VARCHAR(255),
        status VARCHAR(20) DEFAULT 'offline',
        last_seen ${timestampType},
        firmware_version VARCHAR(50),
        token VARCHAR(255)
      )
    `);

    // Fingerprints
    await db.execute(`
      CREATE TABLE IF NOT EXISTS fingerprints (
        id ${uuidType} PRIMARY KEY,
        student_id ${uuidType} NOT NULL,
        finger_number INT NOT NULL,
        fp_template ${textType},
        quality_score INT DEFAULT 0,
        device_id VARCHAR(100),
        is_primary INT DEFAULT 0,
        created_at ${timestampType}
      )
    `);

    console.log('✅ Tables initialized');
  } catch (err) {
    console.error('❌ Init failed:', err.message);
  }
}

// JWT helpers
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const signToken = (p) => jwt.sign(p, JWT_SECRET, { expiresIn: '7d' });
const verifyToken = (t) => { try { return jwt.verify(t, JWT_SECRET); } catch { return null; } };

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'No token' });
  const t = h.split(' ')[1];
  const d = verifyToken(t);
  if (!d) return res.status(401).json({ error: 'Invalid token' });
  req.user = d;
  next();
}

// API Routes
app.get('/api', (req, res) => res.json({ status: 'running', database: isPostgres ? 'PostgreSQL' : 'MySQL' }));

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(401).json({ error: 'User not found' });
    const user = users[0];
    if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Wrong password' });
    res.json({ token: signToken({ id: user.id, name: user.name, role: user.role }), user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, student_id, year_of_study } = req.body;
  try {
    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    await db.execute('INSERT INTO users (id, name, email, password_hash, role, student_id, year_of_study) VALUES (?,?,?,?,?,?,?)', 
      [id, name, email, hash, role, student_id || null, year_of_study || null]);
    res.status(201).json({ token: signToken({ id, name, role }), user: { id, name, role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/students', authMiddleware, async (req, res) => {
  const [students] = await db.execute("SELECT id, name, email, student_id, year_of_study FROM users WHERE role = 'student'");
  res.json(students);
});

app.get('/api/students/:id', authMiddleware, async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM users WHERE id = ? AND role = 'student'", [req.params.id]);
  res.json(rows[0]);
});

app.get('/api/devices', authMiddleware, async (req, res) => {
  const [devices] = await db.execute('SELECT * FROM devices');
  res.json(devices);
});

// DEVICE COMMANDS (Live Enrollment)
app.post('/api/devices/:id/enroll', authMiddleware, async (req, res) => {
  deviceCommands.set(req.params.id, { command: 'ENROLL', student_id: req.body.student_id });
  res.json({ success: true });
});

app.post('/v1/device/heartbeat', async (req, res) => {
  const { device_id } = req.body;
  await db.execute("INSERT INTO devices (id, last_seen, status) VALUES (?, NOW(), 'online') ON DUPLICATE KEY UPDATE last_seen = NOW(), status = 'online'", [device_id]).catch(() => {
     // Postgres fallback for upsert if needed, but let's keep it simple for now
  });
  const pending = deviceCommands.get(device_id);
  if (pending) {
    deviceCommands.delete(device_id);
    return res.json({ command: pending.command, student_id: pending.student_id });
  }
  res.json({ status: 'ok' });
});

app.post('/v1/device/log', async (req, res) => {
  wss.clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(JSON.stringify({ type: 'device_log', ...req.body })));
  res.json({ ok: true });
});

// WebSocket
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => console.log('WS connected'));

// SPA Fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/v1')) return;
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) res.sendFile(path.join(__dirname, 'BugemaUniversity-AttendanceSystem.html'));
  });
});

async function start() {
  await testConnection();
  await initDatabase();
  server.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
}
start();
