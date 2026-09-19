<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireLogin();
$pageTitle = 'Generate Lesson Plan';
$db = getDB();

$preElementId = (int)($_GET['element_id'] ?? 0);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save') {
    $elementId = (int)($_POST['element_id'] ?? 0);
    $subjectId = (int)($_POST['subject_id'] ?? 0);
    if ($elementId && $subjectId && canAccessSubject($subjectId)) {
        $classStream = in_array(trim($_POST['class_stream'] ?? ''), ['A', 'B'], true) ? trim($_POST['class_stream']) : null;
        $db->prepare("
            INSERT INTO lesson_plans
                (element_id, school_name, teacher_name, form, class_stream, subject_id,
                 lesson_date, lesson_time, girls_registered, boys_registered,
                 girls_present, boys_present, remarks, reference)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ")->execute([
            $elementId,
            trim($_POST['school_name'] ?? ''),
            trim($_POST['teacher_name'] ?? ''),
            trim($_POST['form'] ?? ''),
            $classStream,
            $subjectId,
            $_POST['lesson_date'] ?: null,
            trim($_POST['lesson_time'] ?? ''),
            (int)($_POST['girls_registered'] ?? 0),
            (int)($_POST['boys_registered'] ?? 0),
            (int)($_POST['girls_present'] ?? 0),
            (int)($_POST['boys_present'] ?? 0),
            trim($_POST['remarks'] ?? ''),
            trim($_POST['reference'] ?? ''),
        ]);
        header("Location: view_plan.php?id=" . $db->lastInsertId());
        exit;
    }
}

$subjects = scopedSubjects($db);

$elementData = null;
if ($preElementId) {
    require_once __DIR__ . '/includes/plan_helpers.php';
    $elementData = loadElementData($db, $preElementId);
    if ($elementData && !canAccessSubject($elementData['subject_id'])) {
        $elementData = null;
        $preElementId = 0;
    }
}

include __DIR__ . '/includes/header.php';
?>

<div class="page-header no-print">
    <div class="page-header-left">
        <h1 class="page-title">Generate Lesson Plan</h1>
        <p class="page-subtitle">Select a subject and element to auto-generate a complete EduProx systems lesson plan.</p>
    </div>
</div>

<div class="generate-layout">

    <!-- Left panel: cascade selectors -->
    <div class="no-print">
        <div class="card">
            <div class="card-header">
                <span class="card-header-title"><i class="bi bi-funnel"></i> Select Element</span>
            </div>
            <div style="padding:20px">

                <div class="step">
                    <div class="step-number active">1</div>
                    <div class="step-content">
                        <div class="step-label">Class (Form)</div>
                        <select id="form_filter" class="form-control" <?= $preElementId ? 'disabled' : '' ?>>
                            <option value="">— All Forms —</option>
                            <option value="I"   <?= ($elementData && ($elementData['form']??'')==='I')   ? 'selected':'' ?>>Form I</option>
                            <option value="II"  <?= ($elementData && ($elementData['form']??'')==='II')  ? 'selected':'' ?>>Form II</option>
                            <option value="III" <?= ($elementData && ($elementData['form']??'')==='III') ? 'selected':'' ?>>Form III</option>
                            <option value="IV"  <?= ($elementData && ($elementData['form']??'')==='IV')  ? 'selected':'' ?>>Form IV</option>
                        </select>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <div class="step-label">Subject</div>
                        <select id="subject_id" class="form-control" <?= $preElementId ? 'disabled' : '' ?>>
                            <option value="">— Choose a subject —</option>
                            <?php foreach ($subjects as $s): ?>
                            <option value="<?= $s['id'] ?>" <?= ($elementData && $elementData['subject_id']==$s['id']) ? 'selected' : '' ?>>
                                <?= htmlspecialchars($s['name']) ?> (<?= $s['code'] ?>)
                            </option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <div class="step-label">Syllabus</div>
                        <select id="syllabus_id" class="form-control" disabled>
                            <option value="">— Select subject first —</option>
                        </select>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">4</div>
                    <div class="step-content">
                        <div class="step-label">Module (Main Competence)</div>
                        <select id="module_id" class="form-control" disabled>
                            <option value="">— Select syllabus first —</option>
                        </select>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">5</div>
                    <div class="step-content">
                        <div class="step-label">Unit (Specific Competence)</div>
                        <select id="unit_id" class="form-control" disabled>
                            <option value="">— Select module first —</option>
                        </select>
                    </div>
                </div>

                <div class="step" style="border-bottom:none;padding-bottom:0">
                    <div class="step-number active">6</div>
                    <div class="step-content">
                        <div class="step-label">Element (Learning Activity)</div>
                        <select id="element_id" class="form-control" <?= $preElementId ? '' : 'disabled' ?>>
                            <?php if ($preElementId && $elementData): ?>
                            <option value="<?= $preElementId ?>" selected><?= htmlspecialchars($elementData['code'].' '.$elementData['title']) ?></option>
                            <?php else: ?>
                            <option value="">— Select unit first —</option>
                            <?php endif; ?>
                        </select>
                    </div>
                </div>

            </div><!-- /steps -->
        </div>

        <?php if (!$elementData): ?>
        <div class="card mt-3" style="background:linear-gradient(135deg,#eff6ff,#f5f3ff);border-color:#bfdbfe">
            <div class="card-body" style="padding:16px">
                <div style="font-size:12px;color:#1e40af;font-weight:600;margin-bottom:6px"><i class="bi bi-lightbulb me-1"></i>TIP</div>
                <p style="font-size:12.5px;color:#374151;margin:0">Each element represents one 40-minute lesson. The system works for <strong>any subject</strong> in the database.</p>
            </div>
        </div>
        <?php endif; ?>
    </div>

    <!-- Right panel: live preview -->
    <div id="planPreview">
        <?php if ($elementData): ?>
            <?php require_once __DIR__ . '/includes/plan_helpers.php'; renderPlanForm($elementData, ['class_stream' => teacherClassStream($db, (int)$elementData['subject_id'], $elementData['form'] ?? '')]); ?>
        <?php else: ?>
        <div class="card" style="min-height:500px;display:flex;align-items:center;justify-content:center">
            <div style="text-align:center;padding:60px 20px;color:#9ca3af">
                <i class="bi bi-journal-text" style="font-size:56px;display:block;margin-bottom:20px;color:#d1d5db"></i>
                <h4 style="color:#374151;margin-bottom:8px">Your Lesson Plan Appears Here</h4>
                <p style="font-size:13.5px;max-width:320px;margin:0 auto">Use the panel on the left to select a subject and element. The lesson plan will load instantly.</p>
            </div>
        </div>
        <?php endif; ?>
    </div>

</div>

<script>
const BASE = '/amalikitukutu/ajax.php';

function resetFrom(sel) {
    const order = ['syllabus_id','module_id','unit_id','element_id'];
    let clear = false;
    order.forEach(id => {
        if (id === sel) clear = true;
        if (clear) {
            const el = document.getElementById(id);
            el.innerHTML = '<option value="">— ' + el.options[0].text.replace(/^— /,'').replace(/ —$/,'') + ' —</option>';
            el.disabled = true;
        }
    });
    document.getElementById('planPreview').innerHTML = `
        <div class="card" style="min-height:400px;display:flex;align-items:center;justify-content:center">
            <div style="text-align:center;padding:40px;color:#9ca3af">
                <i class="bi bi-journal-text" style="font-size:48px;display:block;margin-bottom:16px;color:#d1d5db"></i>
                <p style="font-size:13.5px">Select an element to preview the lesson plan.</p>
            </div>
        </div>`;
}

function loadSelect(url, targetId, placeholder) {
    const el = document.getElementById(targetId);
    el.innerHTML = '<option value="">Loading…</option>';
    el.disabled = true;
    fetch(url).then(r => r.json()).then(data => {
        el.innerHTML = `<option value="">— ${placeholder} —</option>`;
        data.forEach(d => {
            const o = document.createElement('option');
            o.value = d.id; o.textContent = d.label;
            el.appendChild(o);
        });
        el.disabled = false;
    });
}

document.getElementById('form_filter').addEventListener('change', function () {
    resetFrom('syllabus_id');
    // Re-trigger subject if already selected
    const subj = document.getElementById('subject_id').value;
    if (subj) document.getElementById('subject_id').dispatchEvent(new Event('change'));
});

document.getElementById('subject_id').addEventListener('change', function () {
    resetFrom('syllabus_id');
    if (!this.value) return;
    loadSelect(`${BASE}?action=syllabuses&subject_id=${this.value}`, 'syllabus_id', 'Choose syllabus');
});

document.getElementById('syllabus_id').addEventListener('change', function () {
    resetFrom('module_id');
    if (!this.value) return;
    const form = document.getElementById('form_filter').value;
    loadSelect(`${BASE}?action=modules&syllabus_id=${this.value}&form=${form}`, 'module_id', 'Choose competence');
});

document.getElementById('module_id').addEventListener('change', function () {
    resetFrom('unit_id');
    if (!this.value) return;
    loadSelect(`${BASE}?action=units&module_id=${this.value}`, 'unit_id', 'Choose topic');
});

document.getElementById('unit_id').addEventListener('change', function () {
    resetFrom('element_id');
    if (!this.value) return;
    loadSelect(`${BASE}?action=elements&unit_id=${this.value}`, 'element_id', 'Choose activity');
});

document.getElementById('element_id').addEventListener('change', function () {
    if (!this.value) return;
    document.getElementById('planPreview').innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;min-height:400px;font-size:14px;color:#6b7280"><span class="spinner-border spinner-border-sm me-2"></span> Loading lesson plan…</div>';
    fetch(`${BASE}?action=plan_preview&element_id=${this.value}`)
        .then(r => r.text())
        .then(html => { document.getElementById('planPreview').innerHTML = html; })
        .catch(() => { document.getElementById('planPreview').innerHTML =
            '<div class="alert alert-danger"><i class="bi bi-exclamation-circle"></i><div>Failed to load plan preview.</div></div>'; });
});
</script>

<?php include __DIR__ . '/includes/footer.php'; ?>
