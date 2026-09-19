<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
$pageTitle = 'Dashboard';

try {
    $db = getDB();
    $ids = allowedSubjectIds();

    if (empty($ids)) {
        $stats = [
            'subjects'   => (int)$db->query("SELECT COUNT(*) FROM subjects")->fetchColumn(),
            'syllabuses' => (int)$db->query("SELECT COUNT(*) FROM syllabuses")->fetchColumn(),
            'modules'    => (int)$db->query("SELECT COUNT(*) FROM modules")->fetchColumn(),
            'units'      => (int)$db->query("SELECT COUNT(*) FROM units")->fetchColumn(),
            'elements'   => (int)$db->query("SELECT COUNT(*) FROM elements")->fetchColumn(),
            'plans'      => (int)$db->query("SELECT COUNT(*) FROM lesson_plans")->fetchColumn(),
            'sows'       => (int)$db->query("SELECT COUNT(*) FROM scheme_of_works")->fetchColumn(),
        ];
    } else {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $stats = [];
        $st = $db->prepare("SELECT COUNT(DISTINCT sy.id) FROM syllabuses sy WHERE sy.subject_id IN ($in)");
        $st->execute($ids);
        $stats['subjects'] = count($ids);
        $stats['syllabuses'] = (int)$st->fetchColumn();
        $st = $db->prepare("SELECT COUNT(DISTINCT m.id) FROM modules m JOIN syllabuses sy ON sy.id=m.syllabus_id WHERE sy.subject_id IN ($in)");
        $st->execute($ids);
        $stats['modules'] = (int)$st->fetchColumn();
        $st = $db->prepare("SELECT COUNT(DISTINCT u.id) FROM units u JOIN modules m ON m.id=u.module_id JOIN syllabuses sy ON sy.id=m.syllabus_id WHERE sy.subject_id IN ($in)");
        $st->execute($ids);
        $stats['units'] = (int)$st->fetchColumn();
        $st = $db->prepare("SELECT COUNT(DISTINCT e.id) FROM elements e JOIN units u ON u.id=e.unit_id JOIN modules m ON m.id=u.module_id JOIN syllabuses sy ON sy.id=m.syllabus_id WHERE sy.subject_id IN ($in)");
        $st->execute($ids);
        $stats['elements'] = (int)$st->fetchColumn();
        $st = $db->prepare("SELECT COUNT(*) FROM lesson_plans WHERE subject_id IN ($in)");
        $st->execute($ids);
        $stats['plans'] = (int)$st->fetchColumn();
        $st = $db->prepare("SELECT COUNT(*) FROM scheme_of_works WHERE subject_id IN ($in)");
        $st->execute($ids);
        $stats['sows'] = (int)$st->fetchColumn();
    }

    $recentStmt = $db->prepare("
        SELECT lp.id, lp.school_name, lp.teacher_name, lp.lesson_date, lp.form,
               s.name AS subject_name, s.code AS subject_code,
               e.code AS element_code, e.title AS element_title
        FROM lesson_plans lp
        JOIN subjects s ON s.id = lp.subject_id
        JOIN elements e ON e.id = lp.element_id
        " . (empty($ids) ? '' : 'WHERE lp.subject_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')') . "
        ORDER BY lp.created_at DESC LIMIT 6
    ");
    $recentStmt->execute($ids);
    $recentPlans = $recentStmt->fetchAll();

    $subjectsStmt = $db->prepare("
        SELECT s.id, s.name, s.code,
               COUNT(DISTINCT sy.id) AS syllabuses,
               COUNT(DISTINCT m.id)  AS modules,
               COUNT(DISTINCT e.id)  AS elements
        FROM subjects s
        LEFT JOIN syllabuses sy ON sy.subject_id = s.id
        LEFT JOIN modules m ON m.syllabus_id = sy.id
        LEFT JOIN units u ON u.module_id = m.id
        LEFT JOIN elements e ON e.unit_id = u.id
        " . (empty($ids) ? '' : 'WHERE s.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')') . "
        GROUP BY s.id ORDER BY s.name
    ");
    $subjectsStmt->execute($ids);
    $subjects = $subjectsStmt->fetchAll();

    $dbError = null;
} catch (PDOException $e) {
    $dbError = $e->getMessage();
    $stats = array_fill_keys(['subjects','syllabuses','modules','units','elements','plans','sows'], 0);
    $recentPlans = []; $subjects = [];
}

include __DIR__ . '/includes/header.php';
?>

<?php if ($dbError): ?>
<div class="alert alert-danger">
    <i class="bi bi-exclamation-triangle-fill"></i>
    <div class="alert-body">
        <strong>Database connection failed.</strong><br>
        <?= htmlspecialchars($dbError) ?><br><br>
        <a href="setup.php" class="btn btn-warning btn-sm"><i class="bi bi-wrench"></i> Run Setup</a>
    </div>
</div>
<?php else: ?>

<!-- Stat Cards -->
<div class="stat-cards-grid">
    <a href="subjects.php" class="stat-card c-blue">
        <div class="stat-card-icon"><i class="bi bi-book"></i></div>
        <div class="stat-card-value"><?= $stats['subjects'] ?></div>
        <div class="stat-card-label">Subjects</div>
    </a>
    <a href="syllabuses.php" class="stat-card c-teal">
        <div class="stat-card-icon"><i class="bi bi-journals"></i></div>
        <div class="stat-card-value"><?= $stats['syllabuses'] ?></div>
        <div class="stat-card-label">Syllabuses</div>
    </a>
    <a href="modules.php" class="stat-card c-green">
        <div class="stat-card-icon"><i class="bi bi-folder2"></i></div>
        <div class="stat-card-value"><?= $stats['modules'] ?></div>
        <div class="stat-card-label">Modules</div>
    </a>
    <a href="units.php" class="stat-card c-orange">
        <div class="stat-card-icon"><i class="bi bi-collection"></i></div>
        <div class="stat-card-value"><?= $stats['units'] ?></div>
        <div class="stat-card-label">Units</div>
    </a>
    <a href="elements.php" class="stat-card c-red">
        <div class="stat-card-icon"><i class="bi bi-list-task"></i></div>
        <div class="stat-card-value"><?= $stats['elements'] ?></div>
        <div class="stat-card-label">Elements</div>
    </a>
    <a href="lesson_plans.php" class="stat-card c-purple">
        <div class="stat-card-icon"><i class="bi bi-file-earmark-text"></i></div>
        <div class="stat-card-value"><?= $stats['plans'] ?></div>
        <div class="stat-card-label">Lesson Plans</div>
    </a>
    <a href="scheme_of_works.php" class="stat-card c-cyan">
        <div class="stat-card-icon"><i class="bi bi-calendar-week"></i></div>
        <div class="stat-card-value"><?= $stats['sows'] ?></div>
        <div class="stat-card-label">Schemes of Work</div>
    </a>
</div>

<!-- Main Row -->
<div class="dash-grid">

    <!-- Subjects -->
    <div class="card">
        <div class="card-header">
            <span class="card-header-title"><i class="bi bi-book"></i> Subjects Overview</span>
            <a href="subjects.php" class="btn btn-outline btn-sm">Manage</a>
        </div>
        <?php if (empty($subjects)): ?>
        <div class="empty-state">
            <i class="bi bi-inbox"></i>
            <div class="empty-state-title">No subjects yet</div>
            <div class="empty-state-text">Add subjects or import SQL data to get started.</div>
            <div style="display:flex;gap:10px;justify-content:center">
                <a href="subjects.php" class="btn btn-primary btn-sm"><i class="bi bi-plus"></i> Add Subject</a>
                <a href="seed_data.php" class="btn btn-outline btn-sm"><i class="bi bi-terminal"></i> Import SQL</a>
            </div>
        </div>
        <?php else: ?>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Code</th>
                    <th>Subject</th>
                    <th>Syllabuses</th>
                    <th>Modules</th>
                    <th>Elements</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($subjects as $s): ?>
                <tr>
                    <td><span class="badge badge-blue"><?= htmlspecialchars($s['code']) ?></span></td>
                    <td class="fw-600"><?= htmlspecialchars($s['name']) ?></td>
                    <td class="text-muted"><?= $s['syllabuses'] ?></td>
                    <td class="text-muted"><?= $s['modules'] ?></td>
                    <td><span class="badge badge-green"><?= $s['elements'] ?></span></td>
                    <td>
                        <a href="generate.php" class="btn btn-outline-primary btn-sm btn-icon" title="Generate Plan">
                            <i class="bi bi-magic"></i>
                        </a>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php endif; ?>
    </div>

    <!-- Recent Plans -->
    <div class="card">
        <div class="card-header">
            <span class="card-header-title"><i class="bi bi-clock-history"></i> Recent Lesson Plans</span>
            <a href="lesson_plans.php" class="btn btn-outline btn-sm">View All</a>
        </div>
        <?php if (empty($recentPlans)): ?>
        <div class="empty-state">
            <i class="bi bi-file-earmark-x"></i>
            <div class="empty-state-title">No plans generated yet</div>
            <div class="empty-state-text">Select an element and generate your first lesson plan.</div>
            <a href="generate.php" class="btn btn-primary btn-sm"><i class="bi bi-magic"></i> Generate Now</a>
        </div>
        <?php else: ?>
        <table class="data-table">
            <thead><tr><th>Subject</th><th>Form</th><th>Teacher</th><th>Date</th><th></th></tr></thead>
            <tbody>
                <?php foreach ($recentPlans as $p): ?>
                <tr>
                    <td>
                        <span class="badge badge-blue"><?= htmlspecialchars($p['subject_code']) ?></span>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:2px"><?= htmlspecialchars(substr($p['element_code'].' '.$p['element_title'],0,40)) ?>...</div>
                    </td>
                    <td class="text-muted"><?= htmlspecialchars($p['form']) ?></td>
                    <td style="font-size:12px"><?= htmlspecialchars($p['teacher_name']) ?></td>
                    <td style="font-size:12px;white-space:nowrap"><?= $p['lesson_date'] ? date('d M Y', strtotime($p['lesson_date'])) : '—' ?></td>
                    <td>
                        <a href="view_plan.php?id=<?= $p['id'] ?>" class="btn btn-outline btn-sm btn-icon" title="View Plan">
                            <i class="bi bi-eye"></i>
                        </a>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php endif; ?>
    </div>

</div>

<!-- Quick-Start Banner (only when empty) -->
<?php if ($stats['subjects'] == 0): ?>
<div class="card mt-4" style="border:2px dashed #3b82f6;background:#f0f7ff">
    <div class="card-body">
        <div style="display:flex;align-items:flex-start;gap:20px">
            <div style="background:#3b82f6;border-radius:12px;padding:14px;flex-shrink:0">
                <i class="bi bi-rocket-takeoff" style="font-size:28px;color:white"></i>
            </div>
            <div>
                <h5 style="margin:0 0 8px;font-weight:700;color:#1e3a5f">Getting Started</h5>
                <p style="color:#374151;margin:0 0 16px;font-size:13.5px">
                    This system works for <strong>all subjects</strong> — Mathematics, Biology, Computer Applications, Chemistry, and more.
                    Follow these steps to begin:
                </p>
                <div class="getstart-steps">
                    <?php $steps = [
                        ['1','Run Setup','Create the database tables','setup.php','bi-wrench'],
                        ['2','Import SQL','Paste AI-generated syllabus data','seed_data.php','bi-terminal'],
                        ['3','Verify Data','Check subjects and elements','subjects.php','bi-check2-circle'],
                        ['4','Generate','Create your first lesson plan','generate.php','bi-magic'],
                    ]; foreach ($steps as $s): ?>
                    <a href="<?= $s[3] ?>" style="background:white;border-radius:10px;padding:14px;text-decoration:none;border:1px solid #bfdbfe;display:block;transition:all .2s" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#bfdbfe'">
                        <div style="background:#1e3a5f;color:white;width:24px;height:24px;border-radius:50%;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:8px"><?= $s[0] ?></div>
                        <div style="font-weight:600;font-size:13px;color:#1e3a5f;margin-bottom:2px"><?= $s[1] ?></div>
                        <div style="font-size:11.5px;color:#6b7280"><?= $s[2] ?></div>
                    </a>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<?php endif; ?>

<?php include __DIR__ . '/includes/footer.php'; ?>
