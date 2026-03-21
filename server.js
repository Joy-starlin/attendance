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
const isPostgres = process.env.DB_TYPE === 'postgres' || (process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('postgres') || process.env.DATABASE_URL.startsWith('postgresql')));
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

    // Sessions
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id ${uuidType} PRIMARY KEY,
        course_id ${uuidType} NOT NULL,
        lecturer_id ${uuidType} NOT NULL,
        device_id VARCHAR(100),
        started_at ${timestampType},
        ended_at ${timestampType},
        duration_minutes INT,
        status VARCHAR(20) DEFAULT 'active'
      )
    `);

    // Attendance
    await db.execute(`
      CREATE TABLE IF NOT EXISTS attendance (
        id ${uuidType} PRIMARY KEY,
        session_id ${uuidType} NOT NULL,
        course_id ${uuidType} NOT NULL,
        student_id ${uuidType} NOT NULL,
        status VARCHAR(20) DEFAULT 'present',
        marked_at ${timestampType},
        fp_id INT,
        confidence INT,
        from_offline INT DEFAULT 0
      )
    `);

    // Student-Course enrollment linking table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS student_courses (
        student_id ${uuidType} NOT NULL,
        course_id ${uuidType} NOT NULL,
        enrolled_at ${timestampType},
        PRIMARY KEY (student_id, course_id)
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
  const { name, email, password, role } = req.body;
  // Only lecturers and admins can self-register. Students are added by lecturers.
  const allowedRoles = ['lecturer', 'admin'];
  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ error: 'Students cannot self-register. Ask your lecturer to add you.' });
  }
  try {
    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    await db.execute('INSERT INTO users (id, name, email, password_hash, role) VALUES (?,?,?,?,?)',
      [id, name, email, hash, role]);
    res.status(201).json({ token: signToken({ id, name, role }), user: { id, name, role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// COURSES
app.get('/api/courses', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT c.*, u.name as lecturer_name FROM courses c LEFT JOIN users u ON c.lecturer_id = u.id ORDER BY c.created_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/courses', authMiddleware, async (req, res) => {
  const { code, name, total_classes, pass_criteria } = req.body;
  const id = uuidv4();
  try {
    await db.execute(
      'INSERT INTO courses (id, code, name, lecturer_id, total_classes, pass_criteria) VALUES (?,?,?,?,?,?)',
      [id, code, name, req.user.id, total_classes || 42, pass_criteria || 75]
    );
    res.status(201).json({ id, code, name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/courses/:id', authMiddleware, async (req, res) => {
  const { code, name, total_classes, pass_criteria } = req.body;
  try {
    await db.execute(
      'UPDATE courses SET code = ?, name = ?, total_classes = ?, pass_criteria = ? WHERE id = ?',
      [code, name, total_classes, pass_criteria, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/courses/:id', authMiddleware, async (req, res) => {
  try {
    const course_id = req.params.id;
    // Cleanup related records first
    await db.execute('DELETE FROM attendance WHERE course_id = ?', [course_id]);
    await db.execute('DELETE FROM sessions WHERE course_id = ?', [course_id]);
    await db.execute('DELETE FROM student_courses WHERE course_id = ?', [course_id]);
    await db.execute('DELETE FROM courses WHERE id = ?', [course_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// STUDENTS
app.get('/api/students', authMiddleware, async (req, res) => {
  const [students] = await db.execute("SELECT id, name, email, student_id, year_of_study FROM users WHERE role = 'student'");
  res.json(students);
});

app.get('/api/students/:id', authMiddleware, async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM users WHERE id = ? AND role = 'student'", [req.params.id]);
  res.json(rows[0]);
});

// STUDENTS per COURSE
app.get('/api/courses/:id/students', authMiddleware, async (req, res) => {
  try {
    const [students] = await db.execute(
      `SELECT u.id, u.name, u.student_id,
        (SELECT COUNT(*) FROM attendance a 
         JOIN sessions s ON a.session_id = s.id 
         WHERE a.student_id = u.id AND s.course_id = ?) as classes_attended,
        (SELECT COUNT(*) FROM sessions WHERE course_id = ? AND status = 'completed') as total_sessions,
        (SELECT COUNT(*) FROM fingerprints WHERE student_id = u.id) as has_fingerprint
       FROM users u
       JOIN student_courses sc ON sc.student_id = u.id
       WHERE sc.course_id = ? AND u.role = 'student'
       ORDER BY u.name`,
      [req.params.id, req.params.id, req.params.id]
    );
    res.json(students);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// BULK CSV IMPORT
app.post('/api/courses/:id/students/bulk', authMiddleware, async (req, res) => {
  const { students } = req.body; // [{ name, student_id }]
  const course_id = req.params.id;
  let added = 0, skipped = 0;
  for (const s of students) {
    try {
      const id = uuidv4();
      const hash = bcrypt.hashSync(s.student_id || 'changeme123', 10); // temp password = reg no
      await db.execute(
        'INSERT INTO users (id, name, student_id, password_hash, role) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE name = ?',
        [id, s.name, s.student_id, hash, 'student', s.name]
      );
      const [usr] = await db.execute('SELECT id FROM users WHERE student_id = ?', [s.student_id]);
      if (usr.length > 0) {
        await db.execute(
          'INSERT INTO student_courses (student_id, course_id) VALUES (?,?) ON DUPLICATE KEY UPDATE student_id = student_id',
          [usr[0].id, course_id]
        );
        added++;
      }
    } catch { skipped++; }
  }
  res.json({ added, skipped });
});

app.delete('/api/courses/:id/students/:student_id', authMiddleware, async (req, res) => {
  try {
    await db.execute('DELETE FROM student_courses WHERE course_id = ? AND student_id = ?', [req.params.id, req.params.student_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/courses/:id/students', authMiddleware, async (req, res) => {
  const { name, student_id } = req.body;
  const course_id = req.params.id;
  try {
    const id = uuidv4();
    const hash = bcrypt.hashSync(student_id || 'changeme123', 10);
    await db.execute(
      'INSERT INTO users (id, name, student_id, password_hash, role) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE name = ?',
      [id, name, student_id, hash, 'student', name]
    );
    const [usr] = await db.execute('SELECT id FROM users WHERE student_id = ?', [student_id]);
    await db.execute(
      'INSERT INTO student_courses (student_id, course_id) VALUES (?,?) ON DUPLICATE KEY UPDATE student_id = student_id',
      [usr[0].id, course_id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ATTENDANCE REPORT per COURSE
app.get('/api/courses/:id/report', authMiddleware, async (req, res) => {
  try {
    const [course] = await db.execute('SELECT * FROM courses WHERE id = ?', [req.params.id]);
    const [students] = await db.execute(
      `SELECT u.name, u.student_id,
        COUNT(DISTINCT a.session_id) as attended,
        (SELECT COUNT(*) FROM sessions WHERE course_id = ? AND status = 'completed') as total
       FROM users u
       JOIN student_courses sc ON sc.student_id = u.id
       LEFT JOIN attendance a ON a.student_id = u.id AND a.course_id = ?
       WHERE sc.course_id = ? AND u.role = 'student'
       GROUP BY u.id, u.name, u.student_id
       ORDER BY u.name`,
      [req.params.id, req.params.id, req.params.id]
    );
    const passCriteria = course[0]?.pass_criteria || 75;
    const report = students.map(s => ({
      ...s,
      percentage: s.total > 0 ? Math.round((s.attended / s.total) * 100) : 0,
      passed: s.total > 0 && (s.attended / s.total * 100) >= passCriteria
    }));
    res.json({ course: course[0], students: report });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// STUDENT FINGERPRINT lookup
app.get('/api/students/:id/fingerprints', authMiddleware, async (req, res) => {
  const [fps] = await db.execute('SELECT * FROM fingerprints WHERE student_id = ?', [req.params.id]);
  res.json(fps);
});

app.get('/api/devices', authMiddleware, async (req, res) => {
  const [devices] = await db.execute('SELECT * FROM devices');
  res.json(devices);
});


// DEVICE COMMANDS (Live Enrollment)
app.post('/api/devices/:id/enroll', authMiddleware, async (req, res) => {
  const { student_id } = req.body;
  // Get student name for the OLED display
  const [students] = await db.execute('SELECT name FROM users WHERE id = ?', [student_id]);
  const studentName = students.length > 0 ? students[0].name : "Unknown Student";
  
  deviceCommands.set(req.params.id, { 
    command: 'ENROLL', 
    student_id: student_id,
    student_name: studentName 
  });
  res.json({ success: true, student_name: studentName });
});

// SESSIONS
app.post('/api/sessions', authMiddleware, async (req, res) => {
  const { course_id, device_id, duration_minutes } = req.body;
  const id = uuidv4();
  try {
    await db.execute(
      'INSERT INTO sessions (id, course_id, lecturer_id, device_id, duration_minutes, status) VALUES (?,?,?,?,?,?)',
      [id, course_id, req.user.id, device_id, duration_minutes || 60, 'active']
    );
    res.status(201).json({ session_id: id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions/:id/stop', authMiddleware, async (req, res) => {
  try {
    await db.execute('UPDATE sessions SET status = "completed", ended_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/v1/session/active', async (req, res) => {
  const { device_id } = req.query;
  try {
    const [sessions] = await db.execute(
      `SELECT s.id as session_id, s.course_id, c.name as course_name 
       FROM sessions s 
       JOIN courses c ON s.course_id = c.id 
       WHERE s.device_id = ? AND s.status = 'active' 
       ORDER BY s.started_at DESC LIMIT 1`, 
      [device_id]
    );
    if (sessions.length === 0) return res.status(404).json({ error: 'No active session' });
    res.json(sessions[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/v1/device/heartbeat', async (req, res) => {
  const { device_id, session_active, offline_queue } = req.body;
  await db.execute(
    "INSERT INTO devices (id, last_seen, status) VALUES (?, NOW(), 'online') ON DUPLICATE KEY UPDATE last_seen = NOW(), status = 'online'", 
    [device_id]
  ).catch(() => {});
  
  const pending = deviceCommands.get(device_id);
  if (pending) {
    deviceCommands.delete(device_id);
    return res.json({ 
      command: pending.command, 
      student_id: pending.student_id,
      student_name: pending.student_name 
    });
  }
  res.json({ status: 'ok' });
});

app.post('/v1/attendance', async (req, res) => {
  const { device_id, fp_id, session_id, course_id, status, timestamp, confidence } = req.body;
  try {
    // Find student_id from fp_id
    const [fps] = await db.execute('SELECT student_id FROM fingerprints WHERE finger_number = ? AND device_id = ?', [fp_id, device_id]);
    if (fps.length === 0) return res.status(404).json({ error: 'Fingerprint not linked to any student' });
    
    const student_id = fps[0].student_id;
    const id = uuidv4();
    await db.execute(
      'INSERT INTO attendance (id, session_id, course_id, student_id, status, marked_at, fp_id, confidence) VALUES (?,?,?,?,?,?,?,?)',
      [id, session_id, course_id, student_id, status || 'present', timestamp || new Date(), fp_id, confidence]
    );
    res.status(201).json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/v1/fingerprint/register', async (req, res) => {
  const { device_id, fp_id, student_id } = req.body;
  const id = uuidv4();
  try {
    await db.execute(
      'INSERT INTO fingerprints (id, student_id, finger_number, device_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE student_id = ?',
      [id, student_id, fp_id, device_id, student_id]
    );
    res.status(201).json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
