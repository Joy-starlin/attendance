/**
 * Bugema University Attendance System - Development Server
 * Uses SQLite for easy local testing
 */

'use strict';
require('dotenv').config();
const express = require('express');
const { Database } = require('sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);

// SQLite Database
const db = new Database('./bugema_attendance.db');

// Create tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('lecturer','student')),
    student_id TEXT UNIQUE,
    employee_id TEXT UNIQUE,
    department TEXT,
    phone TEXT,
    school TEXT,
    year TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Courses table
  db.run(`CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    lecturer_id TEXT,
    total_classes INTEGER DEFAULT 42,
    pass_criteria INTEGER DEFAULT 75,
    attendance_weight INTEGER DEFAULT 20,
    credit_hours INTEGER DEFAULT 3,
    days TEXT,
    start_time TEXT,
    end_time TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(code, lecturer_id)
  )`);

  // Sessions table
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    course_id TEXT,
    lecturer_id TEXT,
    device_id TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    duration_minutes INTEGER,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','completed'))
  )`);

  // Attendance table
  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    course_id TEXT,
    student_id TEXT,
    status TEXT CHECK (status IN ('present','absent','pending')),
    marked_at DATETIME,
    fp_id INTEGER,
    confidence INTEGER,
    from_offline INTEGER DEFAULT 0,
    UNIQUE (session_id, student_id)
  )`);

  // Devices table
  db.run(`CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    location TEXT,
    last_seen DATETIME,
    session_active INTEGER DEFAULT 0,
    offline_queue INTEGER DEFAULT 0,
    token TEXT
  )`);

  console.log('✅ SQLite database initialized');
});

// Middleware
app.use(cors());
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    message: 'Bugema University Attendance API',
    version: '2.0',
    endpoints: ['/api/auth/login', '/api/auth/register', '/api/courses', '/api/students', '/api/devices']
  });
});

// JWT helpers
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

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

// Sample data insertion
function insertSampleData() {
  // Check if data exists
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (err || row.count > 0) return;

    // Insert sample lecturer
    const lecturerId = uuidv4();
    const lecturerHash = bcrypt.hashSync('password123', 10);
    db.run(`INSERT INTO users (id, name, email, password_hash, role, employee_id, department) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [lecturerId, 'Dr. John Doe', 'john@bugema.ac.ug', lecturerHash, 'lecturer', 'EMP001', 'Computer Science']);

    // Insert sample student
    const studentId = uuidv4();
    const studentHash = bcrypt.hashSync('password123', 10);
    db.run(`INSERT INTO users (id, name, email, password_hash, role, student_id) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [studentId, 'Alice Johnson', 'alice@bugema.ac.ug', studentHash, 'student', '24/BSE/BU/R/0001']);

    // Insert sample course
    const courseId = uuidv4();
    db.run(`INSERT INTO courses (id, code, name, lecturer_id) 
            VALUES (?, ?, ?, ?)`,
            [courseId, 'CS101', 'Introduction to Programming', lecturerId]);

    console.log('✅ Sample data inserted');
  });
}

// Routes
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'User not found' });
    
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Wrong password' });

    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, student_id, employee_id, department } = req.body;
  
  const hash = bcrypt.hashSync(password, 10);
  const id = uuidv4();
  
  db.run(`INSERT INTO users (id, name, email, password_hash, role, student_id, employee_id, department)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, name, email, hash, role, student_id || null, employee_id || null, department || null],
          function(err) {
            if (err) return res.status(400).json({ error: 'Registration failed' });
            
            const token = signToken({ id, name, email, role });
            res.json({ token, user: { id, name, email, role } });
          });
});

app.get('/api/courses', authMiddleware, (req, res) => {
  if (req.user.role === 'lecturer') {
    db.all('SELECT * FROM courses WHERE lecturer_id = ?', [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    });
  } else {
    db.all(`SELECT c.* FROM courses c
            JOIN enrollments e ON e.course_id = c.id
            WHERE e.student_id = ?`, [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    });
  }
});

app.get('/api/students', authMiddleware, (req, res) => {
  if (req.user.role !== 'lecturer') return res.status(403).json({ error: 'Lecturers only' });
  
  db.all(`SELECT DISTINCT u.id, u.name, u.email, u.student_id
          FROM users u
          WHERE u.role = 'student'
          ORDER BY u.name`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.get('/api/devices', authMiddleware, (req, res) => {
  if (req.user.role !== 'lecturer') return res.status(403).json({ error: 'Lecturers only' });
  
  db.all('SELECT * FROM devices ORDER BY id', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════╗
  ║   BUGEMA UNIVERSITY ATTENDANCE API         ║
  ║   Running on port ${PORT}                     ║
  ║   SQLite Database (Development)           ║
  ╚════════════════════════════════════════════╝
  `);
  
  // Insert sample data after server starts
  setTimeout(insertSampleData, 1000);
});

module.exports = app;
