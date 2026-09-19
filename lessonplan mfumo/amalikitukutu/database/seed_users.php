<?php
// Seed users (admins + teachers) and teacher-subject assignments into lesson_plan_db.
// Source: ezyro_41147622_orientation.sql (production school DB). Passwords reuse the
// original bcrypt hashes so existing school credentials keep working.
//
// Run:  php database/seed_users.php   (or C:\xampp\php\php.exe database\seed_users.php)

$pdo = new PDO('mysql:host=localhost;dbname=lesson_plan_db;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

// ezyro subjects.subject_id  =>  local lesson_plan_db.subjects.id (matched by name/code)
$subjectMap = [
    5  => 6,   // Math (GENERAL)              -> Mathematics
    14 => 6,   // Math (VOCATIONAL)           -> Mathematics
    9  => 4,   // B/Studies (GENERAL)         -> Business Studies
    15 => 4,   // B/Studies (VOCATIONAL)      -> Business Studies
    26 => 5,   // Historia ya TZ (GENERAL)    -> Historia ya Tanzania na Maadili
    18 => 5,   // Historia ya TZ (VOCATIONAL) -> Historia ya Tanzania na Maadili
    27 => 1,   // Computer Science            -> Computer Science
    20 => 2,   // Computer Application with CAD -> Computer Application
    24 => 3,   // Computer Programming        -> Computer Programming
];

// Source admins (ezyro `admins`)
$admins = [
    ['admin@gmail.com', '$2y$10$i134udk.HXhL2mMKlKHtje8cU0zfeZCx853A2386V8wvkXnTpKpYe', 'admin'],
    ['ngaillahgasper@gmail.com', '$2y$10$ZCI.UDrudW3ZfDNf7qUeIe7YD0zcjcWfg9fUOtqzVRobeF/XSJDMi', 'admin'],
];

// Source teachers (ezyro `teachers`) — id => [first, second, last, sex, email, phone, password]
$teachers = [
    2  => ['GODLOVE', 'EMMANUEL', 'KIZENGA', '', 'kizengagodlove5@gmail.com', '255749069075', '$2y$10$nQ42Z9C81rmZ9OruBT.i4ez5mMXMkb952rC3QnXj179j15rUmvmA6'],
    3  => ['Ramadhan', 'Ally', 'Makinda', 'Male', 'ramadhanimakinda27@gmail.com', null, '$2y$10$z1XRk7.VwiVnIJygwEIoue8eSt6n3XFYKqEnZUaypuK4K5uJQtuI.'],
    4  => ['Sabrina', 'Ayoub', 'Jumbe', 'Female', 'sabrinaayoub41@gmail.com', null, '$2y$10$0vO3zbgdFUjkNhCvsML0Cu1TTPFgo9UdmiTyb8bcZkf212G54f/jm'],
    5  => ['Dickson', 'Leonard', 'Mory', 'Male', 'dicksonmory5@gmail.com', null, '$2y$10$mie10IONIYZQ23hH6psYheUwYK4KTEEsYQv4sjoJDb4ynvARhJDs2'],
    6  => ['Elia', 'Zacharia', 'Elia', 'Male', 'godwinelia852@gmail.com', null, '$2y$10$29Gr9Rst8MePoK8XkHWzduk.esGATm9cztuNbMeA/YArJR3jXp1.O'],
    7  => ['Joyce', 'Emanuel', 'Salimu', 'Female', 'emmanueljoyce572@gmail.com', null, '$2y$10$nRDWBpHGXNS5VDE5nMahzeXJoa13XODpFAm/GqVC5N.MWAKvcxVjG'],
    8  => ['Landelino', 'Vitus', 'Stephano', 'Male', 'vituslandelino7@gmail.com', null, '$2y$10$6G.Nwzs4fHpU/styaE0RZOb0E99vzb1Vl7BUkSniRltm7gE2/QR3.'],
    10 => ['AMON', 'KAIZA', 'ALCHARD', 'Male', 'amonkaiza77@gmail.com', '255752463910', '$2y$10$RGEpAr.kuPXe2poEDxO46eSHq8NMhutyJ7ec91Y/OopQz9S/bJYme'],
    12 => ['Emmanuel', 'Betuel', 'Sumari', 'Male', 'emmanuel.bethuel@gmail.com', '255759569282', '$2y$10$jqhNENLxuHL9WzKcAMOk3ev5b9HuEsxt1fSBOTimQKQ49w0DxjzV6'],
    13 => ['VICTORIA', 'ASHERI', 'KILIMBA', 'Female', 'victoriakilimba@gmail.com', '255673121815', '$2y$10$GFaE.NK1iOmt61GWDUtA4uUAtwb6LSt3g7bkUYCgYE0ZA64gNi6bW'],
    14 => ['Gasper', 'Benard', 'Ngaillah', 'Male', 'ngaillahgasper@gmail.com', '255712345678', '$2y$10$hFEdudbQmdRFfUMXEbnNsOArZDMtkResiJ3WSWJ7i2IkI4XIHeM1C'],
    15 => ['Rehema', 'Msina', 'Msina', '', 'msinarehema28@gmail.com', '255789081503', '$2y$10$1wEEQBuHSI9Lfv3aCW0uDO./ZhwkTHLiWpe86jWKmGW.LcU.iD2/2'],
];

// Source teacher_assignments (ezyro) — [teacher_id, subject_id, form_level, stream, class_stream]
$assignments = [
    [8, 11, 'Form One', 'GENERAL', 'B'],
    [7, 14, 'Form One', 'VOCATIONAL', 'A'],
    [6, 8, 'Form One', 'GENERAL', 'B'],
    [6, 21, 'Form One', 'VOCATIONAL', 'A'],
    [5, 12, 'Form One', 'GENERAL', 'B'],
    [4, 13, 'Form One', 'GENERAL', 'B'],
    [4, 9, 'Form One', 'GENERAL', 'B'],
    [4, 15, 'Form One', 'VOCATIONAL', 'A'],
    [3, 7, 'Form One', 'GENERAL', 'B'],
    [3, 26, 'Form One', 'GENERAL', 'B'],
    [3, 16, 'Form One', 'VOCATIONAL', 'A'],
    [3, 18, 'Form One', 'VOCATIONAL', 'A'],
    [12, 9, 'Form One', 'GENERAL', 'B'],
    [12, 15, 'Form One', 'VOCATIONAL', 'A'],
    [13, 22, 'Form One', 'VOCATIONAL', 'A'],
    [14, 17, 'Form One', 'VOCATIONAL', 'A'],
    [10, 5, 'Form One', 'GENERAL', 'B'],
    [10, 14, 'Form One', 'VOCATIONAL', 'A'],
    [2, 27, 'Form One', 'GENERAL', 'B'],
    [2, 20, 'Form One', 'VOCATIONAL', 'A'],
    [2, 24, 'Form One', 'VOCATIONAL', 'A'],
    [2, 17, 'Form One', 'VOCATIONAL', 'A'],
    [2, 19, 'Form One', 'VOCATIONAL', 'A'],
    [15, 26, 'Form One', 'GENERAL', 'B'],
    [15, 6, 'Form One', 'GENERAL', 'B'],
    [15, 18, 'Form One', 'VOCATIONAL', 'A'],
];

echo "Seeding users and teacher assignments into lesson_plan_db...\n";

$pdo->exec('SET FOREIGN_KEY_CHECKS=0');
$pdo->exec('TRUNCATE TABLE teacher_assignments');
$pdo->exec('TRUNCATE TABLE users');
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');

$userInsert = $pdo->prepare(
    'INSERT INTO users (role, first_name, last_name, email, password, phone, sex) VALUES (?,?,?,?,?,?,?)'
);
$teacherUserId = []; // ezyro teacher id => local users.id
$usedEmails = [];    // emails already inserted (admin+teacher overlap)

$count = 0;
foreach ($admins as [$email, $pass, $role]) {
    $userInsert->execute([$role, null, null, $email, $pass, null, null]);
    $usedEmails[$email] = true;
    $count++;
    echo "  admin: {$email}\n";
}
foreach ($teachers as $ezyroId => [$first, $second, $last, $sex, $email, $phone, $pass]) {
    if (isset($usedEmails[$email])) {
        echo "  skip (already admin): {$email}\n";
        continue;
    }
    $userInsert->execute(['teacher', trim("$first $second"), $last, $email, $pass, $phone, $sex ?: null]);
    $usedEmails[$email] = true;
    $teacherUserId[$ezyroId] = (int)$pdo->lastInsertId();
    $count++;
    echo "  teacher: {$email}\n";
}

$assignInsert = $pdo->prepare(
    'INSERT INTO teacher_assignments (teacher_id, subject_id, form_level, stream, class_stream) VALUES (?,?,?,?,?)'
);
$assignCount = 0;
$skipped = 0;
foreach ($assignments as [$tId, $sId, $form, $stream, $classStream]) {
    if (!isset($subjectMap[$sId])) { $skipped++; continue; }   // subject has no local curriculum
    if (!isset($teacherUserId[$tId])) { $skipped++; continue; }
    $assignInsert->execute([$teacherUserId[$tId], $subjectMap[$sId], $form, $stream, $classStream]);
    $assignCount++;
}

echo "\nDone.\n";
echo "  users created: {$count}\n";
echo "  assignments created: {$assignCount} (skipped {$skipped} for subjects with no local curriculum)\n";
