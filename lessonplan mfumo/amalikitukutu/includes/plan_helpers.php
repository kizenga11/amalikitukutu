<?php
function loadElementData(PDO $db, int $elementId): ?array {
    $stmt = $db->prepare("
        SELECT e.*, u.id AS unit_id, u.code AS unit_code, u.title AS unit_title,
               u.form AS unit_form,
               m.id AS module_id, m.code AS module_code, m.title AS module_title, m.form AS form,
               sy.id AS syllabus_id, sy.title AS syllabus_title, sy.publisher, sy.year,
               s.id AS subject_id, s.name AS subject_name, s.code AS subject_code
        FROM elements e
        JOIN units u ON u.id = e.unit_id
        JOIN modules m ON m.id = u.module_id
        JOIN syllabuses sy ON sy.id = m.syllabus_id
        JOIN subjects s ON s.id = sy.subject_id
        WHERE e.id = ?
    ");
    $stmt->execute([$elementId]);
    $data = $stmt->fetch();
    if (!$data) return null;

    // Prefer unit.form, fallback to module.form
    if (empty($data['form'])) {
        $data['form'] = $data['unit_form'] ?? '';
    }

    $stages = $db->prepare("
        SELECT em.*, tm.name AS method_name
        FROM element_methods em
        JOIN teaching_methods tm ON tm.id = em.method_id
        WHERE em.element_id = ?
        ORDER BY FIELD(em.stage,'introduction','development','design','realisation')
    ");
    $stages->execute([$elementId]);
    $data['stages'] = [];
    foreach ($stages->fetchAll() as $row) {
        $data['stages'][$row['stage']] = $row;
    }

    $res = $db->prepare("SELECT r.name FROM element_resources er JOIN resources r ON r.id=er.resource_id WHERE er.element_id=?");
    $res->execute([$elementId]);
    $data['resources'] = array_column($res->fetchAll(), 'name');

    return $data;
}

// Default times per stage (used when time_minutes column is NULL or 0)
function stageTime(array $stage, string $key): string {
    $defaults = ['introduction'=>5,'development'=>20,'design'=>10,'realisation'=>5];
    $mins = !empty($stage['time_minutes']) ? (int)$stage['time_minutes'] : ($defaults[$key] ?? 0);
    return $mins . ' min';
}

// The class stream (A/B) the current teacher is assigned for a subject/form, if any.
function teacherClassStream(PDO $db, int $subjectId, string $form): string {
    $u = currentUser();
    if (!$u || $u['role'] !== 'teacher') return '';
    $formNum = trim((string)$form);
    $st = $db->prepare("
        SELECT class_stream FROM teacher_assignments
        WHERE teacher_id=? AND subject_id=?
          AND (form_level LIKE ? OR ? = '')
        ORDER BY class_stream ASC LIMIT 1
    ");
    $st->execute([(int)$u['id'], $subjectId, "%$formNum%", $formNum]);
    return (string)($st->fetchColumn() ?? '');
}

function renderPlanForm(array $d, array $savedPlan = []): void {
    $stageOrder = [
        'introduction' => 'Introduction',
        'development'  => 'Competence Development',
        'design'       => 'Design',
        'realisation'  => 'Realisation',
    ];
    $h   = fn($v) => htmlspecialchars($v ?? '');
    $val = fn($k) => $h($savedPlan[$k] ?? '');

    // Reference string from syllabus
    $defaultRef = $h($d['subject_name']) . ' Syllabus for Secondary Schools, '
                . $h($d['publisher'] ?? 'TIE') . ' '
                . $h($d['year'] ?? '');
    ?>
    <div class="card">
        <div class="card-header" style="background:#1e3a5f">
            <span class="card-header-title" style="color:white">
                <i class="bi bi-journal-check"></i>
                Lesson Plan — <?= $h($d['subject_name']) ?>, Form <?= $h($d['form']) ?>
            </span>
            <span style="background:rgba(255,255,255,0.15);color:white;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600">
                <?= $h($d['code']) ?>
            </span>
        </div>

        <div class="card-body" style="font-family:'Times New Roman',Times,serif;font-size:13px;color:#000;padding:20px 24px">
            <form method="post" action="/amalikitukutu/generate.php">
                <input type="hidden" name="action" value="save">
                <input type="hidden" name="element_id" value="<?= $d['id'] ?>">
                <input type="hidden" name="subject_id" value="<?= $d['subject_id'] ?>">

                <!-- ── School Info — borderless ── -->
                <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
                    <tr>
                        <td style="font-weight:bold;white-space:nowrap;width:20%;padding:3px 4px">Name of School:</td>
                        <td style="width:30%;padding:3px 4px"><input type="text" name="school_name" class="plan-input" placeholder="School name" value="<?= $val('school_name') ?>" required></td>
                        <td style="font-weight:bold;white-space:nowrap;width:20%;padding:3px 4px">Teacher's Name:</td>
                        <td style="padding:3px 4px"><input type="text" name="teacher_name" class="plan-input" placeholder="Full name" value="<?= $val('teacher_name') ?>" required></td>
                    </tr>
                    <tr>
                        <td style="font-weight:bold;padding:3px 4px">Form:</td>
                        <td style="padding:3px 4px"><input type="text" name="form" class="plan-input" value="<?= $val('form') ?: $h($d['form']) ?>"></td>
                        <td style="font-weight:bold;padding:3px 4px">Subject:</td>
                        <td style="font-weight:bold;padding:3px 4px"><span class="editable-cell" contenteditable="true"><?= $h($d['subject_name']) ?></span></td>
                    </tr>
                    <tr>
                        <td style="font-weight:bold;padding:3px 4px">Class Stream:</td>
                        <td style="padding:3px 4px">
                            <select name="class_stream" class="plan-input" style="min-width:120px">
                                <option value="" <?= empty($val('class_stream')) ? 'selected' : '' ?>>— Select —</option>
                                <option value="A" <?= $val('class_stream') === 'A' ? 'selected' : '' ?>>A</option>
                                <option value="B" <?= $val('class_stream') === 'B' ? 'selected' : '' ?>>B</option>
                            </select>
                        </td>
                        <td style="font-weight:bold;padding:3px 4px">Time:</td>
                        <td style="padding:3px 4px"><input type="text" name="lesson_time" class="plan-input" placeholder="08:00 – 08:40" value="<?= $val('lesson_time') ?>"></td>
                    </tr>
                        <td style="font-weight:bold;padding:3px 4px">Date:</td>
                        <td style="padding:3px 4px"><input type="date" name="lesson_date" class="plan-input" value="<?= $val('lesson_date') ?>"></td>
                    </tr>
                </table>

                <!-- ── Attendance ── -->
                <div style="text-align:center;margin-bottom:14px">
                    <table style="border-collapse:collapse;display:inline-table">
                        <tr>
                            <th colspan="9" style="border:1px solid #000;padding:4px 10px;font-weight:bold;text-align:center">Number of Students</th>
                        </tr>
                        <tr>
                            <th colspan="3" style="border:1px solid #000;padding:3px 10px;text-align:center">Registered</th>
                            <th colspan="3" style="border:1px solid #000;padding:3px 10px;text-align:center">Present</th>
                            <th colspan="3" style="border:1px solid #000;padding:3px 10px;text-align:center">Absentees</th>
                        </tr>
                        <tr>
                            <th style="border:1px solid #000;padding:3px 10px;text-align:center">Girls</th>
                            <th style="border:1px solid #000;padding:3px 10px;text-align:center">Boys</th>
                            <th style="border:1px solid #000;padding:3px 10px;text-align:center">Total</th>
                            <th style="border:1px solid #000;padding:3px 10px;text-align:center">Girls</th>
                            <th style="border:1px solid #000;padding:3px 10px;text-align:center">Boys</th>
                            <th style="border:1px solid #000;padding:3px 10px;text-align:center">Total</th>
                            <th style="border:1px solid #000;padding:3px 10px;text-align:center">Girls</th>
                            <th style="border:1px solid #000;padding:3px 10px;text-align:center">Boys</th>
                            <th style="border:1px solid #000;padding:3px 10px;text-align:center">Total</th>
                        </tr>
                        <tr>
                            <td style="border:1px solid #000;padding:3px 10px;text-align:center"><input type="number" name="girls_registered" class="plan-input" style="width:40px;text-align:center" min="0" value="<?= $val('girls_registered') ?: 0 ?>"></td>
                            <td style="border:1px solid #000;padding:3px 10px;text-align:center"><input type="number" name="boys_registered" class="plan-input" style="width:40px;text-align:center" min="0" value="<?= $val('boys_registered') ?: 0 ?>"></td>
                            <td style="border:1px solid #000;padding:3px 10px;text-align:center" id="total_reg">—</td>
                            <td style="border:1px solid #000;padding:3px 10px;text-align:center"><input type="number" name="girls_present" class="plan-input" style="width:40px;text-align:center" min="0" value="<?= $val('girls_present') ?: 0 ?>"></td>
                            <td style="border:1px solid #000;padding:3px 10px;text-align:center"><input type="number" name="boys_present" class="plan-input" style="width:40px;text-align:center" min="0" value="<?= $val('boys_present') ?: 0 ?>"></td>
                            <td style="border:1px solid #000;padding:3px 10px;text-align:center" id="total_pres">—</td>
                            <td style="border:1px solid #000;padding:3px 10px;text-align:center" id="abs_girls">—</td>
                            <td style="border:1px solid #000;padding:3px 10px;text-align:center" id="abs_boys">—</td>
                            <td style="border:1px solid #000;padding:3px 10px;text-align:center" id="abs_total">—</td>
                        </tr>
                    </table>
                </div>

                <!-- ── Plain text info ── -->
                <p style="margin-bottom:7px"><strong>Main Competence:</strong> <span class="editable-cell" contenteditable="true"><?= $h($d['module_code'].' '.$d['module_title']) ?></span></p>
                <p style="margin-bottom:7px"><strong>Specific Competence:</strong> <span class="editable-cell" contenteditable="true"><?= $h($d['unit_code'].' '.$d['unit_title']) ?></span></p>
                <p style="margin-bottom:7px"><strong>Main Learning Activity:</strong> <span class="editable-cell" contenteditable="true"><?= $h($d['unit_title']) ?></span></p>
                <p style="margin-bottom:7px"><strong>Specific Learning Activity:</strong> <span class="editable-cell" contenteditable="true"><?= $h($d['code'].' '.$d['title']) ?></span></p>
                <p style="margin-bottom:7px"><strong>Teaching and Learning Resources:</strong> <span class="editable-cell" contenteditable="true"><?= $h(implode(', ', $d['resources'])) ?: '<em style="color:#9ca3af">None specified</em>' ?></span></p>
                <p style="margin-bottom:14px"><strong>References:</strong>
                    <input type="text" name="reference" class="plan-input" style="display:inline;width:70%"
                        value="<?= $val('reference') ?: $defaultRef ?>"
                        placeholder="e.g. Computer Science Syllabus, 2023">
                </p>

                <!-- ── Teaching and Learning Process ── -->
                <div style="text-align:center;font-size:14px;font-weight:bold;text-decoration:underline;margin:16px 0 8px">Teaching and Learning Process</div>
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
                        <?php foreach ($stageOrder as $key => $label):
                            $stage = $d['stages'][$key] ?? [];
                            $mins  = !empty($stage['time_minutes']) ? (int)$stage['time_minutes'] : ['introduction'=>5,'development'=>20,'design'=>10,'realisation'=>5][$key];
                        ?>
                        <tr>
                            <td class="vp-stage-name editable-cell" contenteditable="true"><?= $label ?></td>
                            <td class="vp-time-cell editable-cell" contenteditable="true"><?= $mins ?></td>
                            <td class="editable-cell" contenteditable="true"><?= nl2br($h($stage['teaching_activity'] ?? '')) ?></td>
                            <td class="editable-cell" contenteditable="true"><?= nl2br($h($stage['learning_activity'] ?? '')) ?></td>
                            <td class="editable-cell" contenteditable="true"><?= nl2br($h($stage['assessment_criteria'] ?? '')) ?></td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>

                <!-- ── Remarks ── -->
                <p style="margin-bottom:4px"><strong>Remarks:</strong></p>
                <textarea name="remarks" class="form-control" rows="3"
                    style="font-family:'Times New Roman',serif;font-size:13px;border-radius:4px"
                    placeholder="Any notes about how the lesson went..."><?= $h($savedPlan['remarks'] ?? '') ?></textarea>

                <!-- ── Actions ── -->
                <div class="edit-note" data-edit-note style="margin-top:20px">
                    <i class="bi bi-pencil-square"></i>
                    <span>Editing is ON — click any curriculum content (competences, time, activities, resources) to change it for print/PDF. Those edits are <strong>not saved</strong> to the database.</span>
                </div>
                <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;gap:12px" class="no-print">
                    <button type="button" class="btn btn-outline" data-edit-toggle data-editing="1" onclick="togglePlanEditing(this)">
                        <i class="bi bi-lock-fill"></i> <span class="edit-toggle-label">Lock Editing</span>
                    </button>
                    <button type="submit" class="btn btn-primary btn-lg">
                        <i class="bi bi-save"></i> Save Lesson Plan
                    </button>
                    <a href="/amalikitukutu/generate.php" class="btn btn-outline btn-lg">
                        <i class="bi bi-arrow-repeat"></i> Start Over
                    </a>
                </div>
            </form>

            <script>
            (function() {
                function recalc() {
                    var gr = parseInt(document.querySelector('[name=girls_registered]')?.value) || 0;
                    var br = parseInt(document.querySelector('[name=boys_registered]')?.value) || 0;
                    var gp = parseInt(document.querySelector('[name=girls_present]')?.value)    || 0;
                    var bp = parseInt(document.querySelector('[name=boys_present]')?.value)     || 0;
                    document.getElementById('total_reg').textContent  = gr + br;
                    document.getElementById('total_pres').textContent = gp + bp;
                    document.getElementById('abs_girls').textContent  = gr - gp;
                    document.getElementById('abs_boys').textContent   = br - bp;
                    document.getElementById('abs_total').textContent  = (gr + br) - (gp + bp);
                }
                document.querySelectorAll('[name=girls_registered],[name=boys_registered],[name=girls_present],[name=boys_present]')
                    .forEach(function(el) { el.addEventListener('input', recalc); });
                recalc();
            })();
            </script>
        </div>
    </div>
    <?php
}
