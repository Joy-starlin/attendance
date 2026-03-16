-- ============================================================
-- Bugema University Attendance System - MySQL Schema
-- ============================================================

-- Create database (run this first, then use the database)
-- CREATE DATABASE IF NOT EXISTS bugema_attendance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE bugema_attendance;

-- ============================================================
-- USERS TABLE
-- ============================================================
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
    fingerprint_template TEXT,
    card_uid VARCHAR(50),
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active TINYINT(1) DEFAULT 1,
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_student_id (student_id),
    INDEX idx_employee_id (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- COURSES TABLE
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- STUDENT COURSES (ENROLLMENTS)
-- ============================================================
CREATE TABLE IF NOT EXISTS student_courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id CHAR(36) NOT NULL,
    course_id CHAR(36) NOT NULL,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_enrollment (student_id, course_id),
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- ATTENDANCE SESSIONS
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- ATTENDANCE RECORDS
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DEVICES (ESP32)
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    type ENUM('alert', 'info', 'success') DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SAMPLE DATA INSERTION
-- ============================================================

-- Insert sample lecturer
INSERT INTO users (id, name, email, password_hash, role, employee_id, department) VALUES
('550e8400-e29b-41d4-a716-446655440000', 'Dr. John Doe', 'john@bugema.ac.ug', '$2a$10$YourHashedPasswordHere', 'lecturer', 'EMP001', 'Computer Science');

-- Insert sample student
INSERT INTO users (id, name, email, password_hash, role, student_id, year_of_study) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Alice Johnson', 'alice@bugema.ac.ug', '$2a$10$YourHashedPasswordHere', 'student', '24/BSE/BU/R/0001', 2);

-- Insert sample course
INSERT INTO courses (id, code, name, lecturer_id, description) VALUES
('550e8400-e29b-41d4-a716-446655440010', 'CS101', 'Introduction to Programming', '550e8400-e29b-41d4-a716-446655440000', 'Basic programming concepts');

-- Insert sample device
INSERT INTO devices (id, name, location, type, status, battery_level) VALUES
('ESP32-LAB-A', 'Lab Device A', 'Computer Lab 1', 'lab', 'online', 85);
