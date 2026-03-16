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

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

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
  res.json({ 
    status: 'running', 
    message: 'Bugema University Attendance API (MySQL)',
    version: '2.0',
    database: 'MySQL',
    endpoints: ['/api/auth/login', '/api/auth/register', '/api/courses', '/api/students', '/api/devices']
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

app.get('/api/devices', authMiddleware, async (req, res) => {
  try {
    const [devices] = await pool.execute('SELECT * FROM devices');
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
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
