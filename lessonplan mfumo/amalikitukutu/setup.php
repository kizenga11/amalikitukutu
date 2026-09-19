<?php
require_once __DIR__ . '/includes/auth.php';
requireAdmin();
$host = 'localhost'; $user = 'root'; $pass = '';

try {
    $pdo = new PDO("mysql:host=$host", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

    // Run schema (creates DB + tables)
    $sql = file_get_contents(__DIR__ . '/database/schema.sql');
    $stmts = array_filter(array_map('trim', explode(';', $sql)));
    foreach ($stmts as $s) { if (trim($s)) $pdo->exec($s); }

    // Run migration (safely adds new columns to existing DB)
    $pdo->exec("USE lesson_plan_db");
    $migration = file_get_contents(__DIR__ . '/database/migrate.sql');
    $mstmts = array_filter(array_map('trim', explode(';', $migration)));
    foreach ($mstmts as $s) {
        if (trim($s) && !str_starts_with(ltrim($s), '--') && !str_starts_with(ltrim($s), 'USE')) {
            try { $pdo->exec($s); } catch (PDOException $e) { /* column may already exist */ }
        }
    }

    $success = true;
    $message = "Database <strong>lesson_plan_db</strong> is ready with the latest schema.";
} catch (PDOException $e) {
    $success = false; $message = $e->getMessage();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Setup — Lesson Plan Generator</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; background: #f3f4f6; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .card { background: white; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.1); padding: 40px; max-width: 520px; width: 100%; }
        .icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 26px; margin-bottom: 20px; }
        .icon-success { background: #ecfdf5; }
        .icon-error   { background: #fef2f2; }
        h2 { font-size: 22px; font-weight: 700; margin: 0 0 8px; color: #111827; }
        p  { color: #6b7280; font-size: 14px; margin: 0 0 20px; }
        .msg { padding: 12px 16px; border-radius: 8px; font-size: 13.5px; margin-bottom: 24px; line-height: 1.5; }
        .msg-success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
        .msg-error   { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
        .btn { display: inline-block; background: #3b82f6; color: white; padding: 11px 24px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px; margin-right: 10px; }
        .btn:hover { background: #1d4ed8; }
        .btn-sec { background: #f3f4f6; color: #374151; }
        .btn-sec:hover { background: #e5e7eb; color: #111827; }
        ul { color: #374151; font-size: 13.5px; padding-left: 18px; margin: 0; }
        ul li { margin-bottom: 6px; }
    </style>
</head>
<body>
<div class="card">
    <div class="icon <?= $success ? 'icon-success' : 'icon-error' ?>">
        <?= $success ? '✓' : '✕' ?>
    </div>
    <h2><?= $success ? 'Setup Complete' : 'Setup Failed' ?></h2>
    <p><?= $success ? 'The database and all tables are ready.' : 'An error occurred during setup.' ?></p>
    <div class="msg <?= $success ? 'msg-success' : 'msg-error' ?>"><?= $message ?></div>
    <?php if ($success): ?>
    <ul style="margin-bottom:24px">
        <li>Tables created: subjects, syllabuses, modules, units, elements</li>
        <li>Tables created: element_methods (with time_minutes), element_resources</li>
        <li>Tables created: lesson_plans (with reference), teaching_methods, resources</li>
        <li>Tables created: scheme_of_works (Scheme of Work generator)</li>
        <li>Standard teaching methods and resources seeded</li>
    </ul>
    <a href="/amalikitukutu/" class="btn">Go to Dashboard &rarr;</a>
    <a href="/amalikitukutu/seed_data.php" class="btn btn-sec">Load Seed Data</a>
    <?php else: ?>
    <a href="setup.php" class="btn">Retry Setup</a>
    <?php endif; ?>
</div>
</body>
</html>
