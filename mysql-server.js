/**
 * MySQL Development Server for Bugema University Attendance System
 * Replaces SQLite with MySQL database
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const path = require('path');

const app = express();
// Frontend (`BugemaUniversity-AttendanceSystem.html`) expects localhost:3008
const PORT = Number(process.env.PORT || 3008);

// Middleware
app.use(cors());
app.use(express.json());
const deviceCommands = new Map(); // id -> { command: string, student_id: string }

// Serve the built React frontend if present (prod mode)
const FRONTEND_DIST = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(FRONTEND_DIST));

// Back-compat: serve legacy static assets from repo root
app.use(express.static(__dirname));

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bugema_attendance',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    connection.release();
    return true;
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    console.log('\n💡 Make sure you have:');
    console.log('   1. Installed MySQL server');
    console.log('   2. Created the database: CREATE DATABASE bugema_attendance');
    console.log('   3. Set correct DB credentials in .env file');
    return false;
  }
}

// JWT helpers
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// Auth middleware
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });

  const token = header.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  req.user = decoded;
  next();
}

// Initialize database tables
async function initDatabase() {
  try {
    // Users table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('lecturer', 'student', 'admin') NOT NULL,
        employee_id VARCHAR(50),
        department VARCHAR(255),
        student_id VARCHAR(50),
        year_of_study INT,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        is_active TINYINT(1) DEFAULT 1,
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_student_id (student_id),
        INDEX idx_employee_id (employee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Courses table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS courses (
        id CHAR(36) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        lecturer_id CHAR(36),
        description TEXT,
        total_classes INT DEFAULT 0,
        pass_criteria INT DEFAULT 75,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (lecturer_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_code (code),
        INDEX idx_lecturer (lecturer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Student courses
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS student_courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id CHAR(36) NOT NULL,
        course_id CHAR(36) NOT NULL,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_enrollment (student_id, course_id),
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Attendance sessions
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS attendance_sessions (
        id CHAR(36) PRIMARY KEY,
        course_id CHAR(36) NOT NULL,
        lecturer_id CHAR(36) NOT NULL,
        device_id VARCHAR(100),
        session_type VARCHAR(60) DEFAULT 'attendance',
        session_code VARCHAR(20),
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL,
        duration_minutes INT DEFAULT 60,
        status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
        location VARCHAR(255),
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY (lecturer_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_course (course_id),
        INDEX idx_status (status),
        INDEX idx_started (started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Attendance records
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id CHAR(36) NOT NULL,
        student_id CHAR(36) NOT NULL,
        course_id CHAR(36) NOT NULL,
        status ENUM('present', 'absent', 'late', 'excused') DEFAULT 'present',
        verification_method ENUM('fingerprint', 'card', 'manual', 'qr') DEFAULT 'fingerprint',
        confidence_score DECIMAL(5,2),
        marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        marked_by CHAR(36),
        device_id VARCHAR(100),
        sync_status ENUM('synced', 'pending', 'failed') DEFAULT 'synced',
        offline_queue TINYINT(1) DEFAULT 0,
        UNIQUE KEY unique_attendance (session_id, student_id),
        FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        INDEX idx_student (student_id),
        INDEX idx_course (course_id),
        INDEX idx_status (status),
        INDEX idx_marked (marked_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Devices
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255),
        location VARCHAR(255),
        type ENUM('lecture', 'lab', 'office') DEFAULT 'lecture',
        status ENUM('online', 'offline', 'maintenance') DEFAULT 'offline',
        last_seen TIMESTAMP NULL,
        battery_level INT,
        signal_strength INT,
        firmware_version VARCHAR(50),
        total_scans INT DEFAULT 0,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        token VARCHAR(255),
        INDEX idx_status (status),
        INDEX idx_location (location)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Fingerprints (for UI + ESP32 linking)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS fingerprints (
        id CHAR(36) PRIMARY KEY,
        student_id CHAR(36) NOT NULL,
        finger_number INT NOT NULL,
        fp_template TEXT,
        quality_score INT DEFAULT 0,
        device_id VARCHAR(100),
        is_primary TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_student (student_id),
        INDEX idx_primary (student_id, is_primary)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('✅ MySQL tables initialized');
  } catch (err) {
    console.error('❌ Failed to initialize tables:', err.message);
  }
}

// Skip sample data insertion
async function insertSampleData() {
  console.log('✅ Skipping sample data - starting with clean database');
}

// Routes
app.get('/', (req, res) => {
  // Prefer React build if it exists, otherwise fall back to legacy HTML.
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) res.sendFile(path.join(__dirname, 'BugemaUniversity-AttendanceSystem.html'));
  });
});

// SPA fallback (only when the React build exists)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) return next();
  });
});

// API info (what you pasted)
app.get('/api', (req, res) => {
  res.json({
    status: 'running',
    message: 'Bugema University Attendance API (MySQL)',
    version: '2.0',
    database: 'MySQL',
    endpoints: [
      '/api/auth/login',
      '/api/auth/register',
      '/api/courses',
      '/api/lecturers/:id/course-units',
      '/api/course-units/:id/students',
      '/api/sessions',
      '/api/students',
      '/api/students/:id',
      '/api/students/:id/fingerprints',
      '/api/fingerprints',
      '/api/fingerprints/:id',
      '/api/fingerprints/:id/set-primary',
      '/api/fingerprints/export',
      '/api/notifications',
      '/api/devices'
    ]
  });
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(401).json({ error: 'User not found' });
    
    const user = users[0];
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Wrong password' });

    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
    
    // Update last login
    await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DEVICE LIVE COMMANDS & ENROLLMENT
app.post('/api/devices/:id/enroll', authMiddleware, async (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: 'student_id is required' });
  
  deviceCommands.set(req.params.id, { command: 'ENROLL', student_id });
  console.log(`[DEVICE] Enrollment queued for device ${req.params.id}, student ${student_id}`);
  res.json({ success: true, message: 'Enrollment command sent to device' });
});

app.post('/v1/device/heartbeat', async (req, res) => {
  const { device_id, session_active, offline_queue } = req.body;
  
  // Update device status in DB
  try {
    await pool.execute(
      `INSERT INTO devices (id, last_seen, status) VALUES (?, NOW(), 'online')
       ON DUPLICATE KEY UPDATE last_seen = NOW(), status = 'online'`,
      [device_id]
    );
  } catch (err) {
    console.error('Heartbeat DB error:', err);
  }

  // Check for pending commands
  const pending = deviceCommands.get(device_id);
  if (pending) {
    deviceCommands.delete(device_id); // One-time command
    return res.json({ command: pending.command, student_id: pending.student_id });
  }

  res.json({ status: 'ok', server_time: new Date().toISOString() });
});

app.post('/v1/device/log', async (req, res) => {
  const { device_id, status, message, student_id } = req.body;
  console.log(`[LIVE-LOG] ${device_id}: ${status} - ${message}`);
  
  // Global broadcast to all WebSockets (or filter by specific session/student if needed)
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'device_log',
        device_id,
        status,
        message,
        student_id,
        timestamp: new Date().toISOString()
      }));
    }
  });
  
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, employee_id, department, student_id, year_of_study } = req.body;
  
  try {
    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    
    await pool.execute(
      `INSERT INTO users (id, name, email, password_hash, role, employee_id, department, student_id, year_of_study) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, email, hash, role, employee_id || null, department || null, student_id || null, year_of_study || null]
    );
    
    const token = signToken({ id, name, email, role });
    res.status(201).json({ token, user: { id, name, email, role } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Protected routes
app.get('/api/courses', authMiddleware, async (req, res) => {
  try {
    const [courses] = await pool.execute(`
      SELECT c.*, u.name as lecturer_name 
      FROM courses c 
      LEFT JOIN users u ON c.lecturer_id = u.id
    `);
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Aliases used by the HTML UI
app.get('/api/lecturers/:id/course-units', authMiddleware, async (req, res) => {
  try {
    const lecturerId = req.params.id;
    const [courseUnits] = await pool.execute(
      `SELECT id, code, name, lecturer_id
       FROM courses
       WHERE lecturer_id = ?
       ORDER BY code`,
      [lecturerId]
    );
    res.json(courseUnits);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/course-units/:id/students', authMiddleware, async (req, res) => {
  try {
    const courseId = req.params.id;
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.student_id, u.year_of_study,
              EXISTS(SELECT 1 FROM fingerprints f WHERE f.student_id = u.id) AS has_fingerprint
       FROM student_courses sc
       JOIN users u ON u.id = sc.student_id
       WHERE sc.course_id = ? AND u.role = 'student'
       ORDER BY u.name`,
      [courseId]
    );
    res.json(rows.map(r => ({ ...r, has_fingerprint: !!r.has_fingerprint })));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Sessions
app.post('/api/sessions', authMiddleware, async (req, res) => {
  const { course_unit_id, course_id, duration_minutes, device_id, session_type } = req.body || {};
  const resolvedCourseId = course_unit_id || course_id;
  if (!resolvedCourseId) return res.status(400).json({ error: 'course_unit_id is required' });

  try {
    const sessionId = uuidv4();
    const lecturerId = req.user.id;
    await pool.execute(
      `INSERT INTO attendance_sessions (id, course_id, lecturer_id, device_id, duration_minutes, status, session_type)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [sessionId, resolvedCourseId, lecturerId, device_id || null, Number(duration_minutes || 60), session_type || 'attendance']
    );
    res.json({
      session_id: sessionId,
      course_unit_id: resolvedCourseId,
      device_id: device_id || null,
      duration_minutes: Number(duration_minutes || 60),
      session_type: session_type || 'attendance',
      status: 'active'
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/sessions/:id/stop', authMiddleware, async (req, res) => {
  try {
    await pool.execute(
      `UPDATE attendance_sessions SET status = 'completed', ended_at = NOW() WHERE id = ?`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/students', authMiddleware, async (req, res) => {
  try {
    const [students] = await pool.execute(`
      SELECT id, name, email, student_id, year_of_study, phone, created_at 
      FROM users WHERE role = 'student'
    `);
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/students/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, email, student_id, year_of_study, phone, created_at
       FROM users WHERE id = ? AND role = 'student'`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/students/:id/fingerprints', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, finger_number, quality_score, is_primary, device_id, created_at
       FROM fingerprints WHERE student_id = ?
       ORDER BY is_primary DESC, created_at DESC`,
      [req.params.id]
    );
    res.json(rows.map(r => ({ ...r, is_primary: !!r.is_primary })));
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Fingerprints CRUD used by UI
app.post('/api/fingerprints', authMiddleware, async (req, res) => {
  const { student_id, finger_number, fp_template, quality_score, device_id } = req.body || {};
  if (!student_id || !finger_number) return res.status(400).json({ error: 'student_id and finger_number are required' });
  try {
    const id = uuidv4();
    // If this is the first fingerprint for the student, set it as primary
    const [existing] = await pool.execute(`SELECT COUNT(*) as c FROM fingerprints WHERE student_id = ?`, [student_id]);
    const isPrimary = existing?.[0]?.c ? 0 : 1;
    await pool.execute(
      `INSERT INTO fingerprints (id, student_id, finger_number, fp_template, quality_score, device_id, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, student_id, Number(finger_number), fp_template || null, Number(quality_score || 0), device_id || null, isPrimary]
    );
    res.status(201).json({ id, student_id, finger_number: Number(finger_number), quality_score: Number(quality_score || 0), is_primary: !!isPrimary });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/fingerprints/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT student_id, is_primary FROM fingerprints WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Fingerprint not found' });
    const fp = rows[0];
    await pool.execute(`DELETE FROM fingerprints WHERE id = ?`, [req.params.id]);
    // If primary was deleted, promote the most recent remaining one
    if (fp.is_primary) {
      const [next] = await pool.execute(
        `SELECT id FROM fingerprints WHERE student_id = ? ORDER BY created_at DESC LIMIT 1`,
        [fp.student_id]
      );
      if (next.length) {
        await pool.execute(`UPDATE fingerprints SET is_primary = 1 WHERE id = ?`, [next[0].id]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/fingerprints/:id/set-primary', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT student_id FROM fingerprints WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Fingerprint not found' });
    const studentId = rows[0].student_id;
    await pool.execute(`UPDATE fingerprints SET is_primary = 0 WHERE student_id = ?`, [studentId]);
    await pool.execute(`UPDATE fingerprints SET is_primary = 1 WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Sync is a no-op placeholder for now (ESP32 integration can call this later)
app.post('/api/sync-fingerprints', authMiddleware, async (req, res) => {
  res.json({ success: true });
});

// Export fingerprints as downloadable CSV (no filesystem required)
app.get('/api/fingerprints/export', authMiddleware, async (req, res) => {
  res.json({ download_url: `/api/fingerprints/export.csv?ts=${Date.now()}` });
});

app.get('/api/fingerprints/export.csv', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.student_id as student_number, u.name as student_name,
              f.finger_number, f.quality_score, f.is_primary, f.device_id, f.created_at
       FROM fingerprints f
       JOIN users u ON u.id = f.student_id
       ORDER BY u.student_id, f.is_primary DESC, f.created_at DESC`
    );
    const header = ['student_number','student_name','finger_number','quality_score','is_primary','device_id','created_at'];
    const csv = [
      header.join(','),
      ...rows.map(r => header.map(k => {
        const v = r[k];
        const s = v === null || v === undefined ? '' : String(v);
        const escaped = s.replace(/"/g, '""');
        return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
      }).join(','))
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fingerprints.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/devices', authMiddleware, async (req, res) => {
  try {
    const [devices] = await pool.execute('SELECT * FROM devices');
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/notifications', authMiddleware, async (req, res) => {
  res.json([]);
});

// WebSocket server for real-time attendance
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const sessionId = req.url.split('/').pop();
  console.log('WebSocket connected for session:', sessionId);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // Broadcast to all connected clients for this session
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (e) {
      console.error('Invalid WebSocket message:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket disconnected');
  });
});

// Start server
async function startServer() {
  const connected = await testConnection();
  if (!connected) {
    console.log('\n⚠️  Starting without database connection...');
    console.log('   Fix MySQL connection and restart the server.\n');
  } else {
    await initDatabase();
    await insertSampleData();
  }

  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║  🚀 Bugema University Attendance API       ║
║  MySQL Version                             ║
╠════════════════════════════════════════════╣
║  Server: http://localhost:${PORT}           ║
║  Status: ${connected ? '✅ Connected' : '⚠️  No DB'}              ║
╚════════════════════════════════════════════╝
    `);
  });
}

startServer();
