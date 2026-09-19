-- Lesson Plan Generator Database Schema
-- Tanzania TIE/VETA Syllabus-based System

CREATE DATABASE IF NOT EXISTS lesson_plan_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lesson_plan_db;

-- Subjects (e.g. Computer Applications, Mathematics, Biology)
CREATE TABLE IF NOT EXISTS subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Syllabuses per subject
CREATE TABLE IF NOT EXISTS syllabuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    publisher VARCHAR(100) DEFAULT 'TIE',
    year VARCHAR(10),
    form_range VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Modules = Main Competences
CREATE TABLE IF NOT EXISTS modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    syllabus_id INT NOT NULL,
    code VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    form VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (syllabus_id) REFERENCES syllabuses(id) ON DELETE CASCADE
);

-- Units = Specific Competences
CREATE TABLE IF NOT EXISTS units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    module_id INT NOT NULL,
    code VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    periods_allocated INT DEFAULT 0,
    form VARCHAR(10) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

-- Elements = Learning Activities
CREATE TABLE IF NOT EXISTS elements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    unit_id INT NOT NULL,
    code VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
);

-- Teaching Methods
CREATE TABLE IF NOT EXISTS teaching_methods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

-- Resources
CREATE TABLE IF NOT EXISTS resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE
);

-- Element Methods (pivot) - 4 stages per element
CREATE TABLE IF NOT EXISTS element_methods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    element_id INT NOT NULL,
    method_id INT NOT NULL,
    stage ENUM('introduction','development','design','realisation') NOT NULL,
    time_minutes INT DEFAULT NULL,
    teaching_activity TEXT,
    learning_activity TEXT,
    assessment_criteria TEXT,
    FOREIGN KEY (element_id) REFERENCES elements(id) ON DELETE CASCADE,
    FOREIGN KEY (method_id) REFERENCES teaching_methods(id) ON DELETE CASCADE
);

-- Element Resources (pivot)
CREATE TABLE IF NOT EXISTS element_resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    element_id INT NOT NULL,
    resource_id INT NOT NULL,
    UNIQUE KEY unique_element_resource (element_id, resource_id),
    FOREIGN KEY (element_id) REFERENCES elements(id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

-- Saved Lesson Plans
CREATE TABLE IF NOT EXISTS lesson_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    element_id INT NOT NULL,
    school_name VARCHAR(200),
    teacher_name VARCHAR(150),
    form VARCHAR(20),
    class_stream VARCHAR(5) DEFAULT NULL,
    subject_id INT NOT NULL,
    lesson_date DATE,
    lesson_time VARCHAR(20),
    girls_registered INT DEFAULT 0,
    boys_registered INT DEFAULT 0,
    girls_present INT DEFAULT 0,
    boys_present INT DEFAULT 0,
    remarks TEXT,
    reference TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (element_id) REFERENCES elements(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Saved Scheme of Works
CREATE TABLE IF NOT EXISTS scheme_of_works (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject_id INT NOT NULL,
    form VARCHAR(10) NOT NULL,
    class_stream VARCHAR(5) DEFAULT NULL,
    syllabus_id INT DEFAULT NULL,
    term VARCHAR(50) DEFAULT '',
    year VARCHAR(10) DEFAULT '',
    school_name VARCHAR(200) DEFAULT '',
    teacher_name VARCHAR(150) DEFAULT '',
    title VARCHAR(255) DEFAULT '',
    sow_data JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (syllabus_id) REFERENCES syllabuses(id) ON DELETE SET NULL
);

-- App users (admins + teachers share one login table)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role ENUM('admin','teacher') NOT NULL DEFAULT 'teacher',
    first_name VARCHAR(50) DEFAULT NULL,
    last_name VARCHAR(50) DEFAULT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    sex VARCHAR(10) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teacher -> subject assignments (which subjects each teacher teaches)
CREATE TABLE IF NOT EXISTS teacher_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    subject_id INT NOT NULL,
    form_level VARCHAR(20) NOT NULL DEFAULT 'Form One',
    stream VARCHAR(20) DEFAULT NULL,
    class_stream ENUM('A','B') DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Seed standard teaching methods
INSERT IGNORE INTO teaching_methods (name) VALUES
('Demonstration'),
('Group Discussion'),
('Questions and Answers'),
('Hands-on Activity'),
('Brainstorming'),
('Think-Ink-Pair-Share'),
('Case Study'),
('Project Based Activity'),
('Practical Activity'),
('Role Play'),
('Field Visit'),
('Research Based Activity');

-- Seed standard resources
INSERT IGNORE INTO resources (name) VALUES
('Computer'),
('Overhead projector'),
('Internet access'),
('Microsoft Word program'),
('Microsoft Excel program'),
('Microsoft PowerPoint program'),
('Microsoft Access (database program)'),
('Microsoft Publisher program'),
('Printer'),
('Ethernet cables'),
('USB drives'),
('Handouts'),
('Video tutorials'),
('Textbook'),
('Whiteboard'),
('Markers'),
('Manila papers'),
('Projector'),
('Calculator'),
('Laboratory equipment'),
('Charts and diagrams'),
('Models');
