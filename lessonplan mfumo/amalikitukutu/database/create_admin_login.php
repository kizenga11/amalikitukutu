<?php
$pdo = new PDO('mysql:host=localhost;dbname=lesson_plan;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

$pdo->exec("CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role ENUM('admin','teacher') NOT NULL DEFAULT 'teacher',
    first_name VARCHAR(50) DEFAULT NULL,
    last_name VARCHAR(50) DEFAULT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    sex VARCHAR(10) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");

$pdo->exec("CREATE TABLE IF NOT EXISTS teacher_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    subject_id INT NOT NULL,
    form_level VARCHAR(20) NOT NULL DEFAULT 'Form One',
    stream VARCHAR(20) DEFAULT NULL,
    class_stream ENUM('A','B') DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
)");

$email = 'admin@gmail.com';
$pass  = password_hash('Admin@2026', PASSWORD_BCRYPT);

$st = $pdo->prepare("SELECT id FROM users WHERE email = ?");
$st->execute([$email]);
if ($st->fetch()) {
    $up = $pdo->prepare("UPDATE users SET role='admin', password=? WHERE email=?");
    $up->execute([$pass, $email]);
    echo "Updated existing admin: {$email}\n";
} else {
    $ins = $pdo->prepare("INSERT INTO users (role, first_name, last_name, email, password) VALUES ('admin','Admin','System',?,?)");
    $ins->execute([$email, $pass]);
    echo "Created admin: {$email}\n";
}

foreach ($pdo->query("SELECT id, role, email FROM users") as $u) {
    echo "  [{$u['id']}] {$u['role']} — {$u['email']}\n";
}