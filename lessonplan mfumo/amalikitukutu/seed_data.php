<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireAdmin();
$pageTitle = 'Import SQL Data';
$db = getDB();
$results = null;

// Available built-in seed files
$seedFiles = [
    'seed_cs_form1.sql' => [
        'label'    => 'Computer Science — Form I (TIE 2023)',
        'desc'     => '8 modules, 35 units, 35 elements, 140 teaching stages. Full Computer Science Form I syllabus.',
        'subject'  => 'CS',
        'color'    => 'blue',
        'icon'     => 'cpu',
    ],
    'seed_ca_form1_4.sql' => [
        'label'    => 'Computer Application — Form I–IV (VETA 2025)',
        'desc'     => '6 modules, 8 units, 39 elements, 156 teaching stages. Full Computer Application VETA syllabus covering Word, Excel, Access, Publisher, Internet & Digital Marketing.',
        'subject'  => 'CA',
        'color'    => 'green',
        'icon'     => 'laptop',
    ],
    'seed_cp_form1.sql' => [
        'label'    => 'Computer Programming — Form I (VETA 2023)',
        'desc'     => '2 modules, 7 units, 267 elements, 1068 teaching stages. Full Computer Programming VETA syllabus covering hardware, office applications, and programming (conditions, loops, functions, arrays).',
        'subject'  => 'CP',
        'color'    => 'purple',
        'icon'     => 'code-slash',
    ],
];

// Load a built-in seed file into the textarea
$preload = '';
if (isset($_GET['load']) && array_key_exists($_GET['load'], $seedFiles)) {
    $path = __DIR__ . '/database/' . $_GET['load'];
    if (file_exists($path)) {
        $preload = file_get_contents($path);
    }
}

// Run migration if needed (add new columns to existing DB)
if (isset($_GET['migrate'])) {
    $mig = file_get_contents(__DIR__ . '/database/migrate.sql');
    $mstmts = array_filter(array_map('trim', explode(';', $mig)));
    $mok = 0; $mfail = 0;
    foreach ($mstmts as $s) {
        if (!trim($s) || str_starts_with(ltrim($s),'--') || str_starts_with(ltrim($s),'USE')) continue;
        try { $db->exec($s); $mok++; } catch (PDOException $e) { $mfail++; }
    }
    $migMsg = "Migration: $mok statement(s) run, $mfail skipped (columns may already exist).";
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $sql = trim($_POST['sql_input'] ?? '');
    if ($sql) {
        $statements = array_filter(array_map('trim', explode(';', $sql)));
        $ok = 0; $fail = 0; $errors = [];
        foreach ($statements as $stmt) {
            if (!preg_match('/\S/', $stmt)) continue;
            // Skip USE statements — we're already on the right DB
            if (preg_match('/^\s*USE\s+/i', $stmt)) continue;
            try {
                $db->exec($stmt);
                $ok++;
            } catch (PDOException $e) {
                $fail++;
                $errors[] = ['stmt' => substr($stmt, 0, 140), 'error' => $e->getMessage()];
            }
        }
        $results = compact('ok', 'fail', 'errors');
    }
}

$counts = [
    'subjects'      => ['count' => $db->query("SELECT COUNT(*) FROM subjects")->fetchColumn(),         'icon'=>'book',       'color'=>'blue'],
    'syllabuses'    => ['count' => $db->query("SELECT COUNT(*) FROM syllabuses")->fetchColumn(),       'icon'=>'journals',   'color'=>'teal'],
    'modules'       => ['count' => $db->query("SELECT COUNT(*) FROM modules")->fetchColumn(),          'icon'=>'folder2',    'color'=>'green'],
    'units'         => ['count' => $db->query("SELECT COUNT(*) FROM units")->fetchColumn(),            'icon'=>'collection', 'color'=>'orange'],
    'elements'      => ['count' => $db->query("SELECT COUNT(*) FROM elements")->fetchColumn(),         'icon'=>'list-task',  'color'=>'red'],
    'stage rows'    => ['count' => $db->query("SELECT COUNT(*) FROM element_methods")->fetchColumn(),  'icon'=>'clock',      'color'=>'purple'],
];

include __DIR__ . '/includes/header.php';
?>

<div class="page-header">
    <div class="page-header-left">
        <h1 class="page-title">Import SQL Data</h1>
        <p class="page-subtitle">Load a built-in syllabus seed or paste your own AI-generated INSERT statements.</p>
    </div>
    <div class="page-header-actions no-print">
        <a href="?migrate=1" class="btn btn-outline" title="Add new schema columns to existing databases">
            <i class="bi bi-wrench"></i> Run Migration
        </a>
    </div>
</div>

<?php if (!empty($migMsg)): ?>
<div class="alert alert-info"><i class="bi bi-info-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($migMsg) ?></div></div>
<?php endif; ?>

<?php if ($results !== null): ?>
<div class="alert <?= $results['fail'] === 0 ? 'alert-success' : 'alert-warning' ?>">
    <i class="bi bi-<?= $results['fail'] === 0 ? 'check-circle-fill' : 'exclamation-triangle-fill' ?>"></i>
    <div class="alert-body">
        <strong><?= $results['ok'] ?> statement(s) executed successfully<?= $results['fail'] > 0 ? ", {$results['fail']} skipped/failed" : '' ?>.</strong>
        <?php if (!empty($results['errors'])): ?>
        <div style="margin-top:10px">
            <?php foreach (array_slice($results['errors'], 0, 8) as $err): ?>
            <div style="background:rgba(239,68,68,0.08);border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:12px">
                <div style="font-family:monospace;color:#374151;margin-bottom:2px;word-break:break-all"><?= htmlspecialchars(substr($err['stmt'],0,120)) ?>...</div>
                <div style="color:#dc2626"><?= htmlspecialchars($err['error']) ?></div>
            </div>
            <?php endforeach; ?>
            <?php if (count($results['errors']) > 8): ?>
            <div style="color:#6b7280;font-size:12px">...and <?= count($results['errors']) - 8 ?> more. Common cause: duplicate IDs — use ON DUPLICATE KEY UPDATE or clear existing data first.</div>
            <?php endif; ?>
        </div>
        <?php endif; ?>
    </div>
</div>
<?php endif; ?>

<!-- Quick-load built-in seeds -->
<div class="card mb-4">
    <div class="card-header">
        <span class="card-header-title"><i class="bi bi-collection-play"></i> Built-in Syllabus Seeds</span>
        <span style="font-size:12px;color:var(--text-muted)">Click Load to pre-fill the editor below, then Execute</span>
    </div>
    <div style="padding:16px 20px">
        <?php foreach ($seedFiles as $file => $seed): ?>
        <div style="display:flex;align-items:center;gap:16px;padding:14px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb">
            <div style="width:44px;height:44px;background:#eff6ff;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="bi bi-<?= $seed['icon'] ?>" style="font-size:20px;color:#3b82f6"></i>
            </div>
            <div style="flex:1">
                <div style="font-weight:600;font-size:14px;color:#111827"><?= htmlspecialchars($seed['label']) ?></div>
                <div style="font-size:12.5px;color:#6b7280;margin-top:2px"><?= htmlspecialchars($seed['desc']) ?></div>
            </div>
            <a href="?load=<?= urlencode($file) ?>#sql-editor" class="btn btn-primary btn-sm">
                <i class="bi bi-download"></i> Load into Editor
            </a>
        </div>
        <?php endforeach; ?>
        <div style="font-size:12px;color:#9ca3af;margin-top:12px;padding:0 4px">
            <i class="bi bi-info-circle me-1"></i>
            If your database already exists, click <strong>Run Migration</strong> (top right) first to add new columns, then load and execute the seed.
        </div>
    </div>
</div>

<div class="seed-layout">

    <!-- Left: SQL Editor -->
    <div>
        <div class="card" id="sql-editor">
            <div class="card-header">
                <span class="card-header-title"><i class="bi bi-terminal"></i> SQL Editor</span>
                <?php if (!empty($preload) && isset($_GET['load'], $seedFiles[$_GET['load']])): ?>
                <span class="badge badge-green">Loaded: <?= htmlspecialchars($seedFiles[$_GET['load']]['label']) ?></span>
                <?php endif; ?>
            </div>
            <div class="card-body">
                <form method="post" action="#sql-editor">
                    <div class="form-group">
                        <label class="form-label">Paste INSERT statements or load a built-in seed above</label>
                        <textarea name="sql_input" class="form-control" rows="22"
                            style="font-family:'Courier New',monospace;font-size:12.5px;background:#0f172a;color:#e2e8f0;border-color:#334155;resize:vertical;line-height:1.6"
                            placeholder="-- Paste AI-generated INSERT statements here, or click 'Load into Editor' above.
-- Statements are separated by semicolons.
-- USE statements are ignored (the system uses lesson_plan_db automatically).

-- Example:
INSERT INTO subjects (id, name, code) VALUES (1, 'Mathematics', 'MATH')
  ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO syllabuses (id, subject_id, title, publisher, year, form_range)
  VALUES (1, 1, 'Mathematics Syllabus', 'TIE', '2023', 'Form 1-4')
  ON DUPLICATE KEY UPDATE title=VALUES(title);"><?= htmlspecialchars($preload ?: ($_POST['sql_input'] ?? '')) ?></textarea>
                    </div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap">
                        <button type="submit" class="btn btn-primary btn-lg">
                            <i class="bi bi-play-fill"></i> Execute Statements
                        </button>
                        <a href="seed_data.php" class="btn btn-outline btn-lg">
                            <i class="bi bi-x-lg"></i> Clear
                        </a>
                        <?php if ($counts['elements']['count'] > 0): ?>
                        <a href="generate.php" class="btn btn-success btn-lg">
                            <i class="bi bi-magic"></i> Generate Lesson Plan
                        </a>
                        <?php endif; ?>
                    </div>
                </form>
            </div>
        </div>

        <!-- Tips -->
        <div class="card mt-4" style="background:#f8fafc">
            <div class="card-header"><span class="card-header-title"><i class="bi bi-lightbulb"></i> Tips</span></div>
            <div class="card-body">
                <ul style="padding-left:18px;margin:0;font-size:13.5px;color:#374151;line-height:2">
                    <li>Use <strong>ON DUPLICATE KEY UPDATE</strong> in your INSERTs to re-run safely without duplicate errors.</li>
                    <li><strong>USE statements</strong> are automatically skipped — the system always uses <code style="background:#f1f5f9;padding:1px 5px;border-radius:4px">lesson_plan_db</code>.</li>
                    <li>Run <strong>Migration</strong> first if you're adding data to an older database.</li>
                    <li>Insert order: subjects → syllabuses → modules → units → elements → element_methods → element_resources.</li>
                    <li>Method IDs: 1=Demonstration, 2=Group Discussion, 3=Q&amp;A, 4=Hands-on, 5=Brainstorming, 6=Think-Ink-Pair-Share, 7=Case Study, 8=Project Based, 9=Practical, 10=Role Play, 11=Field Visit, 12=Research Based.</li>
                </ul>
            </div>
        </div>
    </div>

    <!-- Right: Stats -->
    <div>
        <div class="card">
            <div class="card-header"><span class="card-header-title"><i class="bi bi-database"></i> Database Status</span></div>
            <div style="padding:4px 0">
                <?php foreach ($counts as $table => $info): ?>
                <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid #f3f4f6">
                    <div style="width:32px;height:32px;border-radius:8px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#6b7280;flex-shrink:0">
                        <i class="bi bi-<?= $info['icon'] ?>"></i>
                    </div>
                    <div style="flex:1;font-size:13px;font-weight:500;color:#374151;text-transform:capitalize"><?= $table ?></div>
                    <div style="font-size:20px;font-weight:700;color:<?= $info['count'] > 0 ? '#10b981' : '#d1d5db' ?>"><?= $info['count'] ?></div>
                </div>
                <?php endforeach; ?>
            </div>
            <?php if ($counts['elements']['count'] > 0): ?>
            <div style="padding:16px">
                <a href="generate.php" class="btn btn-primary w-100"><i class="bi bi-magic"></i> Generate Lesson Plan</a>
            </div>
            <?php else: ?>
            <div style="padding:16px">
                <a href="setup.php" class="btn btn-outline w-100"><i class="bi bi-wrench"></i> Run Database Setup</a>
            </div>
            <?php endif; ?>
        </div>

        <div class="card mt-4">
            <div class="card-header"><span class="card-header-title"><i class="bi bi-diagram-3"></i> Table Hierarchy</span></div>
            <div class="card-body">
                <div style="font-family:'Courier New',monospace;font-size:12px;line-height:1.9">
                    <div style="color:#3b82f6">subjects</div>
                    <div style="padding-left:16px;color:#10b981">└── syllabuses</div>
                    <div style="padding-left:32px;color:#10b981">└── modules</div>
                    <div style="padding-left:48px;color:#8b5cf6">└── units <span style="color:#9ca3af">(+form)</span></div>
                    <div style="padding-left:64px;color:#8b5cf6">└── elements</div>
                    <div style="padding-left:80px;color:#9ca3af">├── element_methods <span style="color:#f59e0b">(+time_minutes)</span></div>
                    <div style="padding-left:80px;color:#9ca3af">└── element_resources</div>
                    <div style="margin-top:8px;color:#3b82f6">lesson_plans <span style="color:#f59e0b">(+reference)</span></div>
                </div>
            </div>
        </div>
    </div>

</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
