<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireLogin();
$db = getDB();

$planId = (int)($_GET['id'] ?? 0);
if (!$planId) { header("Location: lesson_plans.php"); exit; }

$p = $db->prepare("
    SELECT lp.*, s.name AS subject_name, s.code AS subject_code,
           e.id AS element_id, e.code AS element_code, e.title AS element_title,
           u.code AS unit_code, u.title AS unit_title,
           m.code AS module_code, m.title AS module_title, m.form AS m_form,
           sy.title AS syllabus_title
    FROM lesson_plans lp
    JOIN subjects s ON s.id = lp.subject_id
    JOIN elements e ON e.id = lp.element_id
    JOIN units u ON u.id = e.unit_id
    JOIN modules m ON m.id = u.module_id
    JOIN syllabuses sy ON sy.id = m.syllabus_id
    WHERE lp.id = ?
");
$p->execute([$planId]);
$plan = $p->fetch();
if (!$plan) { header("Location: lesson_plans.php"); exit; }
if (!canAccessSubject((int)$plan['subject_id'])) { header("Location: lesson_plans.php"); exit; }

$stages = $db->prepare("
    SELECT em.*, tm.name AS method_name
    FROM element_methods em
    JOIN teaching_methods tm ON tm.id = em.method_id
    WHERE em.element_id = ?
    ORDER BY FIELD(em.stage,'introduction','development','design','realisation')
");
$stages->execute([$plan['element_id']]);
$stageRows = [];
foreach ($stages->fetchAll() as $row) { $stageRows[$row['stage']] = $row; }

$res = $db->prepare("SELECT r.name FROM element_resources er JOIN resources r ON r.id=er.resource_id WHERE er.element_id=?");
$res->execute([$plan['element_id']]);
$resources = array_column($res->fetchAll(), 'name');

$stageOrder  = ['introduction','development','design','realisation'];
$stageLabels = [
    'introduction' => 'Introduction',
    'development'  => 'Competence Development',
    'design'       => 'Design',
    'realisation'  => 'Realisation',
];
$stageDefaults = ['introduction'=>5,'development'=>20,'design'=>10,'realisation'=>5];
$h = fn($v) => htmlspecialchars($v ?? '');

$girlsReg  = (int)$plan['girls_registered'];
$boysReg   = (int)$plan['boys_registered'];
$totalReg  = $girlsReg + $boysReg;
$girlsPres = (int)$plan['girls_present'];
$boysPres  = (int)$plan['boys_present'];
$totalPres = $girlsPres + $boysPres;
$girlsAbs  = $girlsReg - $girlsPres;
$boysAbs   = $boysReg  - $boysPres;
$totalAbs  = $totalReg - $totalPres;
$lessonDate = $plan['lesson_date'] ? date('d-m-Y', strtotime($plan['lesson_date'])) : '';

$pageTitle = 'View Lesson Plan';
include __DIR__ . '/includes/header.php';
?>

<!-- Toolbar -->
<div class="doc-toolbar no-print">
    <div class="doc-toolbar-left">
        <a href="lesson_plans.php" class="btn btn-outline"><i class="bi bi-arrow-left"></i> Plans</a>
        <span class="doc-toolbar-title">Lesson Plan #<?= $planId ?></span>
    </div>
    <div class="doc-toolbar-right">
        <button type="button" class="btn btn-outline" data-edit-toggle data-editing="1" onclick="togglePlanEditing(this)">
            <i class="bi bi-lock-fill"></i> <span class="edit-toggle-label">Lock Editing</span>
        </button>
        <a href="generate.php?element_id=<?= $plan['element_id'] ?>" class="btn btn-outline-primary"><i class="bi bi-copy"></i> Duplicate</a>
        <button type="button" class="btn btn-primary" onclick="saveDocAsPDF()"><i class="bi bi-file-pdf"></i> Save as PDF</button>
    </div>
</div>

<div class="edit-note" data-edit-note>
    <i class="bi bi-pencil-square"></i>
    <span>Editing is ON — click any value to change it (time, level, activities, remarks…). Changes appear only here / in print &amp; PDF and are <strong>never saved</strong> to the database.</span>
</div>

<div id="plan-document" class="plan-document">

    <!-- ══ TITLE ══════════════════════════════════════════════════════ -->
    <div class="vp-title">LESSON PLAN</div>

    <!-- ══ SCHOOL INFO — plain text ═══════════════════════════════════ -->
    <table class="vp-info-table">
        <tr>
            <td class="vp-lbl">Name of School:</td>
            <td class="vp-val"><span class="editable-cell" contenteditable="true"><?= $h($plan['school_name']) ?></span></td>
            <td class="vp-lbl">Teacher's Name:</td>
            <td class="vp-val"><span class="editable-cell" contenteditable="true"><?= $h($plan['teacher_name']) ?></span></td>
        </tr>
        <tr>
            <td class="vp-lbl">Form:</td>
            <td class="vp-val"><span class="editable-cell" contenteditable="true"><?= $h($plan['form']) ?></span></td>
            <td class="vp-lbl">Class Stream:</td>
            <td class="vp-val"><span class="editable-cell" contenteditable="true"><?= $h($plan['class_stream'] ?: '—') ?></span></td>
        </tr>
        <tr>
            <td class="vp-lbl">Subject:</td>
            <td class="vp-val"><span class="editable-cell" contenteditable="true"><?= $h($plan['subject_name']) ?></span></td>
            <td class="vp-lbl">Time:</td>
            <td class="vp-val"><span class="editable-cell" contenteditable="true"><?= $h($plan['lesson_time']) ?></span></td>
        </tr>
        <tr>
            <td class="vp-lbl">Date:</td>
            <td class="vp-val"><span class="editable-cell" contenteditable="true"><?= $lessonDate ?></span></td>
            <td class="vp-lbl"></td>
            <td class="vp-val"></td>
        </tr>
    </table>

    <!-- ══ ATTENDANCE TABLE ════════════════════════════════════════════ -->
    <div style="text-align:center; margin-bottom:10px;">
    <table class="vp-att-table">
        <tr><th colspan="9">Number of Students</th></tr>
        <tr>
            <th colspan="3">Registered</th>
            <th colspan="3">Present</th>
            <th colspan="3">Absentees</th>
        </tr>
        <tr>
            <th>Girls</th><th>Boys</th><th>Total</th>
            <th>Girls</th><th>Boys</th><th>Total</th>
            <th>Girls</th><th>Boys</th><th>Total</th>
        </tr>
        <tr>
            <td class="editable-cell" contenteditable="true"><?= $girlsReg ?></td><td class="editable-cell" contenteditable="true"><?= $boysReg ?></td><td class="editable-cell" contenteditable="true"><?= $totalReg ?></td>
            <td class="editable-cell" contenteditable="true"><?= $girlsPres ?></td><td class="editable-cell" contenteditable="true"><?= $boysPres ?></td><td class="editable-cell" contenteditable="true"><?= $totalPres ?></td>
            <td class="editable-cell" contenteditable="true"><?= $girlsAbs ?></td><td class="editable-cell" contenteditable="true"><?= $boysAbs ?></td><td class="editable-cell" contenteditable="true"><?= $totalAbs ?></td>
        </tr>
    </table>
    </div>

    <!-- ══ PLAIN TEXT INFO ════════════════════════════════════════════ -->
    <p class="vp-info-line"><strong>Main Competence:</strong> <span class="editable-cell" contenteditable="true"><?= $h($plan['module_code'].' '.$plan['module_title']) ?></span></p>
    <p class="vp-info-line"><strong>Specific Competence:</strong> <span class="editable-cell" contenteditable="true"><?= $h($plan['unit_code'].' '.$plan['unit_title']) ?></span></p>
    <p class="vp-info-line"><strong>Main Learning Activity:</strong> <span class="editable-cell" contenteditable="true"><?= $h($plan['unit_title']) ?></span></p>
    <p class="vp-info-line"><strong>Specific Learning Activity:</strong> <span class="editable-cell" contenteditable="true"><?= $h($plan['element_code'].' '.$plan['element_title']) ?></span></p>
    <p class="vp-info-line"><strong>Teaching and Learning Resources:</strong> <span class="editable-cell" contenteditable="true"><?= $resources ? $h(implode(', ', $resources)) : '—' ?></span></p>
    <p class="vp-info-line"><strong>References:</strong> <span class="editable-cell" contenteditable="true"><?= $h($plan['reference'] ?: ($plan['subject_name'].' Syllabus — '.$plan['syllabus_title'])) ?></span></p>

    <!-- ══ TEACHING AND LEARNING PROCESS ═════════════════════════════ -->
    <div class="vp-section-title">Teaching and Learning Process</div>
    <table class="vp-process-table">
        <thead>
            <tr>
                <th style="width:13%">Stages</th>
                <th style="width:7%">Time<br>(Minutes)</th>
                <th style="width:27%">Teaching Activities</th>
                <th style="width:27%">Learning Activities</th>
                <th style="width:26%">Assessment Criteria</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($stageOrder as $key):
                $stage = $stageRows[$key] ?? [];
                $mins  = !empty($stage['time_minutes']) ? (int)$stage['time_minutes'] : $stageDefaults[$key];
            ?>
            <tr>
                <td class="vp-stage-name editable-cell" contenteditable="true"><?= $stageLabels[$key] ?></td>
                <td class="vp-time-cell editable-cell" contenteditable="true"><?= $mins ?></td>
                <td class="editable-cell" contenteditable="true"><?= nl2br($h($stage['teaching_activity']   ?? '')) ?></td>
                <td class="editable-cell" contenteditable="true"><?= nl2br($h($stage['learning_activity']   ?? '')) ?></td>
                <td class="editable-cell" contenteditable="true"><?= nl2br($h($stage['assessment_criteria'] ?? '')) ?></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>

    <!-- ══ REMARKS — plain text ═══════════════════════════════════════ -->
    <p class="vp-remarks"><strong>Remarks:</strong> <span class="editable-cell" contenteditable="true"><?= nl2br($h($plan['remarks'] ?? '')) ?></span></p>
    <?php if (empty(trim($plan['remarks'] ?? ''))): ?>
    <div class="vp-remarks-line"></div>
    <div class="vp-remarks-line"></div>
    <div class="vp-remarks-line"></div>
    <?php endif; ?>

</div><!-- /plan-document -->

<div class="doc-bottom-bar no-print">
    <button type="button" class="btn btn-primary btn-lg" onclick="saveDocAsPDF()">
        <i class="bi bi-file-pdf"></i> Save as PDF
    </button>
    <button onclick="window.print()" class="btn btn-outline btn-lg">
        <i class="bi bi-printer"></i> Print
    </button>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
