<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireLogin();
$pageTitle = 'Generate Scheme of Work';
$db = getDB();

$action = $_POST['action'] ?? ($_GET['action'] ?? '');

if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $subjectId = (int)($_POST['subject_id'] ?? 0);
    $syllabusId = (int)($_POST['syllabus_id'] ?? 0);
    if (!canAccessSubject($subjectId)) {
        header("Location: generate_sow.php?msg=denied");
        exit;
    }
    $form = trim($_POST['form'] ?? '');
    $classStream = in_array(trim($_POST['class_stream'] ?? ''), ['A', 'B'], true) ? trim($_POST['class_stream']) : null;
    $term = trim($_POST['term'] ?? '');
    $year = trim($_POST['year'] ?? '');
    $schoolName = trim($_POST['school_name'] ?? '');
    $teacherName = trim($_POST['teacher_name'] ?? '');
    $title = trim($_POST['title'] ?? '');
    $sowRows = json_decode($_POST['sow_rows'] ?? '[]', true);
    if (!is_array($sowRows)) $sowRows = [];
    $sowBreaks = json_decode($_POST['sow_breaks'] ?? '[]', true);
    if (!is_array($sowBreaks)) $sowBreaks = [];

    $cleanRows = [];
    foreach ($sowRows as $r) {
        $cleanRows[] = [
            'main'      => trim((string)($r['main'] ?? '')),
            'spec'      => trim((string)($r['spec'] ?? '')),
            'main_act'  => trim((string)($r['main_act'] ?? '')),
            'spec_act'  => trim((string)($r['spec_act'] ?? '')),
            'month'     => trim((string)($r['month'] ?? '')),
            'week'      => trim((string)($r['week'] ?? '')),
            'periods'   => trim((string)($r['periods'] ?? '')),
            'methods'   => trim((string)($r['methods'] ?? '')),
            'resources' => trim((string)($r['resources'] ?? '')),
            'remarks'   => trim((string)($r['remarks'] ?? '')),
        ];
    }

    $cleanBreaks = [];
    foreach ($sowBreaks as $b) {
        $label = trim((string)($b['label'] ?? ''));
        if ($label !== '') {
            $cleanBreaks[] = ['position' => (int)($b['position'] ?? 0), 'label' => $label];
        }
    }

    $sowJson = json_encode([
        'rows' => $cleanRows,
        'breaks' => $cleanBreaks,
    ], JSON_UNESCAPED_UNICODE);

    $insertStmt = $db->prepare("
        INSERT INTO scheme_of_works (subject_id, syllabus_id, form, class_stream, term, year, school_name, teacher_name, title, sow_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $insertStmt->execute([$subjectId, $syllabusId, $form, $classStream, $term, $year, $schoolName, $teacherName, $title, $sowJson]);

    $sowId = $db->lastInsertId();
    header("Location: view_sow.php?id=" . $sowId);
    exit;
}

$subjects = scopedSubjects($db);
$forms = ['I', 'II', 'III', 'IV'];

include __DIR__ . '/includes/header.php';
?>

<div class="page-header no-print">
    <div class="page-header-left">
        <h1 class="page-title">Generate Scheme of Work</h1>
        <p class="page-subtitle">Create a termly Scheme of Work for a subject and form.</p>
    </div>
</div>

<div class="generate-sow-layout">
    <div class="sow-sidebar no-print">
        <div class="card">
            <div class="card-header">
                <span class="card-header-title"><i class="bi bi-gear"></i> Configuration</span>
            </div>
            <div style="padding:20px">
                <div class="form-group">
                    <label class="form-label">Class (Form)</label>
                    <select id="sow_form" class="form-control">
                        <option value="">— Select Form —</option>
                        <?php foreach ($forms as $f): ?>
                        <option value="<?= $f ?>">Form <?= $f ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Class Stream</label>
                    <select id="sow_stream" class="form-control">
                        <option value="">— Select Stream —</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Subject</label>
                    <select id="sow_subject_id" class="form-control">
                        <option value="">— Select Subject —</option>
                        <?php foreach ($subjects as $s): ?>
                        <option value="<?= $s['id'] ?>"><?= htmlspecialchars($s['name']) ?> (<?= $s['code'] ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Syllabus</label>
                    <select id="sow_syllabus_id" class="form-control" disabled>
                        <option value="">— Select subject first —</option>
                    </select>
                </div>
                <hr style="margin:16px 0">
                <div class="form-group">
                    <label class="form-label">School Name</label>
                    <input type="text" id="sow_school" class="form-control" placeholder="e.g. Mkwawa Secondary School">
                </div>
                <div class="form-row form-row-2">
                    <div class="form-group">
                        <label class="form-label">Teacher's Name</label>
                        <input type="text" id="sow_teacher" class="form-control" placeholder="Full name">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Title (optional)</label>
                        <input type="text" id="sow_title" class="form-control" placeholder="e.g. 2026 Term I">
                    </div>
                </div>
                <div class="form-row form-row-3">
                    <div class="form-group">
                        <label class="form-label">Year</label>
                        <select id="sow_year" class="form-control">
                            <?php for ($y = date('Y'); $y >= 2020; $y--): ?>
                            <option value="<?= $y ?>" <?= $y == date('Y') ? 'selected' : '' ?>><?= $y ?></option>
                            <?php endfor; ?>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Term</label>
                        <select id="sow_term" class="form-control">
                            <option value="Term I">Term I</option>
                            <option value="Term II">Term II</option>
                            <option value="Term III">Term III</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Total Weeks</label>
                        <select id="sow_weeks_total" class="form-control">
                            <?php for ($w = 1; $w <= 16; $w++): ?>
                            <option value="<?= $w ?>" <?= $w == 13 ? 'selected' : '' ?>><?= $w ?> weeks</option>
                            <?php endfor; ?>
                        </select>
                    </div>
                </div>
                <button id="sow_load_btn" class="btn btn-primary w-100" disabled>
                    <i class="bi bi-search"></i> Load Curriculum
                </button>
            </div>
        </div>
    </div>

    <div class="sow-main">
        <div id="sow_empty_state" class="card" style="min-height:500px;display:flex;align-items:center;justify-content:center">
            <div style="text-align:center;padding:60px 20px;color:#9ca3af">
                <i class="bi bi-table" style="font-size:56px;display:block;margin-bottom:20px;color:#d1d5db"></i>
                <h4 style="color:#374151;margin-bottom:8px">Scheme of Work Builder</h4>
                <p style="font-size:13.5px;max-width:420px;margin:0 auto">
                    Select a Form, Subject, and Syllabus from the left panel, then click <strong>"Load Curriculum"</strong> to start building your Scheme of Work.
                </p>
            </div>
        </div>

        <div id="sow_content" style="display:none">
            <form id="sow_form" method="post" action="generate_sow.php">
                <input type="hidden" name="action" value="save">
                <input type="hidden" name="subject_id" id="save_subject_id">
                <input type="hidden" name="syllabus_id" id="save_syllabus_id">
                <input type="hidden" name="form" id="save_form">
                <input type="hidden" name="class_stream" id="save_stream">
                <input type="hidden" name="term" id="save_term">
                <input type="hidden" name="year" id="save_year">
                <input type="hidden" name="school_name" id="save_school">
                <input type="hidden" name="teacher_name" id="save_teacher">
                <input type="hidden" name="title" id="save_title">
                <input type="hidden" name="sow_rows" id="sow_rows_hidden" value="">
                <input type="hidden" name="sow_breaks" id="sow_breaks_hidden" value="">

                <div class="card" style="margin-bottom:20px;overflow:visible">
                    <div class="card-header" style="background:#1e3a5f;color:white">
                        <span class="card-header-title" style="color:white"><i class="bi bi-journal-text"></i> <span id="sow_header_title">Scheme of Work</span></span>
                        <div style="display:flex;gap:8px">
                            <button type="button" id="sow_preview_btn" class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3)">
                                <i class="bi bi-eye"></i> Preview
                            </button>
                            <button type="submit" class="btn btn-sm" style="background:#10b981;color:white;font-weight:600">
                                <i class="bi bi-save"></i> Save SOW
                            </button>
                        </div>
                    </div>
                    <div class="card-body" style="padding:0;overflow-x:auto">
                        <div class="edit-note" style="margin:12px 16px;font-size:12px">
                            <i class="bi bi-pencil-square"></i>
                            <span>Cells are directly editable. Use the <strong>+</strong> button on any row to add a new row after it, or <strong>Add Row</strong> to append at the end. All edits and added rows are saved when you click <strong>Save</strong>.</span>
                        </div>
                        <div id="sow_table_wrapper"></div>
                    </div>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Preview Modal -->
<div class="modal fade" id="sowPreviewModal" tabindex="-1">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-file-text text-primary me-2"></i>Scheme of Work Preview</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" style="padding:0">
                <div id="sow_preview_content" style="padding:20px"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" data-bs-dismiss="modal">Close</button>
                <button type="button" id="sow_print_preview" class="btn btn-primary"><i class="bi bi-printer"></i> Print</button>
            </div>
        </div>
    </div>
</div>

<script>
const BASE = '/amalikitukutu/ajax.php';

document.getElementById('sow_form').addEventListener('change', function() {
    document.getElementById('save_form').value = document.getElementById('sow_form').value;
    document.getElementById('save_term').value = document.getElementById('sow_term').value;
    document.getElementById('save_year').value = document.getElementById('sow_year').value;
    document.getElementById('save_school').value = document.getElementById('sow_school').value;
    document.getElementById('save_teacher').value = document.getElementById('sow_teacher').value;
    document.getElementById('save_title').value = document.getElementById('sow_title').value;
    document.getElementById('save_stream').value = document.getElementById('sow_stream').value;
});

function canLoad() {
    const form = document.getElementById('sow_form').value;
    const subj = document.getElementById('sow_subject_id').value;
    const syll = document.getElementById('sow_syllabus_id').value;
    const btn = document.getElementById('sow_load_btn');
    btn.disabled = !(form && subj && syll);
}

document.getElementById('sow_form').addEventListener('change', canLoad);
document.getElementById('sow_subject_id').addEventListener('change', canLoad);
document.getElementById('sow_syllabus_id').addEventListener('change', canLoad);

document.getElementById('sow_subject_id').addEventListener('change', function() {
    const syllEl = document.getElementById('sow_syllabus_id');
    if (!syllEl) return;
    syllEl.innerHTML = '<option value="">Loading…</option>';
    syllEl.disabled = true;
    if (!this.value) {
        syllEl.innerHTML = '<option value="">— Select subject first —</option>';
        syllEl.disabled = true;
        canLoad();
        return;
    }
    fetch(BASE + '?action=syllabuses&subject_id=' + this.value)
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function(data) {
            syllEl.innerHTML = '<option value="">— Select syllabus —</option>';
            if (data.length === 0) {
                syllEl.innerHTML = '<option value="">— No syllabuses found —</option>';
            } else {
                data.forEach(function(d) {
                    var o = document.createElement('option');
                    o.value = d.id; o.textContent = d.label;
                    syllEl.appendChild(o);
                });
            }
            syllEl.disabled = false;
            canLoad();
        })
        .catch(function(err) {
            console.error('Syllabus load failed:', err);
            syllEl.innerHTML = '<option value="">— Error loading syllabuses —</option>';
            syllEl.disabled = false;
            canLoad();
        });
});

document.getElementById('sow_load_btn').addEventListener('click', function() {
    const form = document.getElementById('sow_form').value;
    const subjectId = document.getElementById('sow_subject_id').value;
    const syllabusId = document.getElementById('sow_syllabus_id').value;
    const school = document.getElementById('sow_school').value;
    const teacher = document.getElementById('sow_teacher').value;
    const title = document.getElementById('sow_title').value;
    const year = document.getElementById('sow_year').value;
    const term = document.getElementById('sow_term').value;
    const totalWeeks = parseInt(document.getElementById('sow_weeks_total').value) || 13;

    document.getElementById('save_subject_id').value = subjectId;
    document.getElementById('save_syllabus_id').value = syllabusId;
    document.getElementById('save_form').value = form;
    document.getElementById('save_stream').value = document.getElementById('sow_stream').value;
    document.getElementById('save_term').value = term;
    document.getElementById('save_year').value = year;
    document.getElementById('save_school').value = school;
    document.getElementById('save_teacher').value = teacher;
    document.getElementById('save_title').value = title;

    const headerTitle = (title ? title + ' — ' : '') + document.getElementById('sow_subject_id').options[document.getElementById('sow_subject_id').selectedIndex].text + ', Form ' + form;
    document.getElementById('sow_header_title').textContent = headerTitle;

    const wrapper = document.getElementById('sow_table_wrapper');
    wrapper.innerHTML = '<div style="text-align:center;padding:40px"><span class="spinner-border spinner-border-sm me-2"></span> Loading curriculum data…</div>';

    fetch(BASE + '?action=sow_data&syllabus_id=' + syllabusId + '&form=' + form)
        .then(r => r.json())
        .then(data => {
            if (!data || !data.modules || data.modules.length === 0) {
                wrapper.innerHTML = '<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i><div>No curriculum found for this subject and form.</div></div>';
                return;
            }
            buildSowTable(data, totalWeeks);
            document.getElementById('sow_content').style.display = 'block';
            document.getElementById('sow_empty_state').style.display = 'none';
        })
        .catch(err => {
            wrapper.innerHTML = '<div class="alert alert-danger"><i class="bi bi-x-circle-fill"></i><div>Failed to load curriculum: ' + err.message + '</div></div>';
        });
});

function buildSowTable(data, totalWeeks) {
    let html = '<table class="sow-table" id="sowTable">';
    html += '<thead><tr>';
    html += '<th style="min-width:160px">Main Competence</th>';
    html += '<th style="min-width:160px">Specific Competence</th>';
    html += '<th style="min-width:180px">Main Learning Activities</th>';
    html += '<th style="min-width:180px">Specific Learning Activities</th>';
    html += '<th style="min-width:80px">Month</th>';
    html += '<th style="min-width:60px">Week</th>';
    html += '<th style="min-width:50px">Periods</th>';
    html += '<th style="min-width:160px">Methods</th>';
    html += '<th style="min-width:160px">Resources</th>';
    html += '<th style="min-width:100px">Remarks</th>';
    html += '<th style="width:40px" class="no-print"></th>';
    html += '</tr></thead><tbody>';

    let globalRowIdx = 0;

    data.modules.forEach(function(mod, mi) {
        let totalRows = 0;
        mod.rows.forEach(function(r) { totalRows++; });

        if (mi > 0) {
            const breakHtml = getBreakRowHtml(mi, globalRowIdx);
            if (breakHtml) html += breakHtml;
        }

        mod.rows.forEach(function(row, ri) {
            html += '<tr class="sow-row" data-module="' + mi + '" data-unit="' + row.unit_id + '">';

            if (ri === 0) {
                html += '<td class="sow-merged editable-cell" rowspan="' + totalRows + '" contenteditable="true">';
                html += '<strong>' + escapeHtml(mod.module_code) + '</strong><br>';
                html += '<span style="font-size:12px">' + escapeHtml(mod.module_title) + '</span>';
                html += '</td>';
            }

            const isFirstInUnit = (ri === 0 || mod.rows[ri - 1].unit_id !== row.unit_id);
            if (isFirstInUnit) {
                let unitSpan = 1;
                for (let j = ri + 1; j < mod.rows.length; j++) {
                    if (mod.rows[j].unit_id === row.unit_id) unitSpan++;
                    else break;
                }
                html += '<td class="sow-merged editable-cell" rowspan="' + unitSpan + '" contenteditable="true">';
                html += '<strong>' + escapeHtml(row.unit_code) + '</strong><br>';
                html += '<span style="font-size:12px">' + escapeHtml(row.unit_title) + '</span>';
                html += '</td>';
            }

            html += '<td class="editable-cell" contenteditable="true">' + escapeHtml(row.unit_title) + '</td>';
            html += '<td class="editable-cell" contenteditable="true">' + escapeHtml(row.element_code + ' ' + row.element_title) + '</td>';
            html += '<td class="sow-center"><input type="text" name="month[' + globalRowIdx + ']" class="sow-input sow-input-sm" placeholder="Month" value="' + escapeHtml(row.month || '') + '"></td>';
            html += '<td class="sow-center"><input type="text" name="week[' + globalRowIdx + ']" class="sow-input sow-input-sm" placeholder="Week" value="' + escapeHtml(row.week || '') + '"></td>';
            html += '<td class="sow-center"><input type="text" name="periods[' + globalRowIdx + ']" class="sow-input sow-input-sm" placeholder="P" value="' + escapeHtml(row.periods || '') + '" style="width:40px"></td>';
            html += '<td class="editable-cell" style="font-size:12px" contenteditable="true">' + escapeHtml(row.methods || '') + '</td>';
            html += '<td class="editable-cell" style="font-size:12px" contenteditable="true">' + escapeHtml(row.resources || '') + '</td>';
            html += '<td><input type="text" name="remarks[' + globalRowIdx + ']" class="sow-input" placeholder="_____" value="' + escapeHtml(row.remarks || '') + '"></td>';
            html += '<td class="no-print" style="white-space:nowrap">';
            html += '<button type="button" class="btn btn-outline-primary btn-sm btn-icon" onclick="addSowRow(this)" title="Add row after this one"><i class="bi bi-plus-lg"></i></button> ';
            html += '<button type="button" class="btn btn-outline-danger btn-sm btn-icon" onclick="removeSowRow(this)" title="Remove row"><i class="bi bi-x"></i></button>';
            html += '</td>';
            html += '</tr>';

            globalRowIdx++;
        });
    });

    html += '</tbody></table>';

    html += '<div style="padding:12px 16px;display:flex;gap:10px;align-items:center;border-top:1px solid #e5e7eb" class="no-print">';
    html += '<button type="button" class="btn btn-outline-primary btn-sm" onclick="addSowRow()"><i class="bi bi-plus-lg"></i> Add Row</button>';
    html += '<button type="button" class="btn btn-outline btn-sm" onclick="addBreakRow()"><i class="bi bi-dash-lg"></i> Add Break Row</button>';
    html += '<span style="font-size:12px;color:#6b7280">Total rows: <strong id="sow_total_rows">' + globalRowIdx + '</strong></span>';
    html += '</div>';

    document.getElementById('sow_table_wrapper').innerHTML = html;
}

let breakCount = 0;
function addBreakRow() {
    const table = document.getElementById('sowTable');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const tr = document.createElement('tr');
    tr.className = 'sow-break-row';
    const colspan = table.querySelector('thead tr').children.length;
    tr.innerHTML = '<td colspan="' + colspan + '" style="background:#fff9db;text-align:center;padding:8px 12px;border:1px solid #fde68a;font-weight:600;font-size:13px">' +
        '<input type="hidden" name="break[' + breakCount + '][position]" value="-1">' +
        '<input type="text" name="break[' + breakCount + '][label]" class="sow-input" style="background:transparent;border:1px dashed #d1d5db;text-align:center;font-weight:600;width:80%" placeholder="--- MIDTERM BREAK Date: DD/MM/YYYY ---">' +
        ' <button type="button" class="btn btn-outline-danger btn-sm btn-icon" onclick="this.closest(\'td\').closest(\'tr\').remove()" title="Remove break"><i class="bi bi-x"></i></button>' +
        '</td>';
    tbody.appendChild(tr);
    breakCount++;
}

let manualRowCount = 0;
function addSowRow(btn) {
    const table = document.getElementById('sowTable');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const tr = document.createElement('tr');
    tr.className = 'sow-row sow-manual-row';
    tr.innerHTML =
        '<td class="editable-cell" contenteditable="true"></td>' +
        '<td class="editable-cell" contenteditable="true"></td>' +
        '<td class="editable-cell" contenteditable="true"></td>' +
        '<td class="editable-cell" contenteditable="true"></td>' +
        '<td class="sow-center"><input type="text" name="month[' + manualRowCount + ']" class="sow-input sow-input-sm" placeholder="Month"></td>' +
        '<td class="sow-center"><input type="text" name="week[' + manualRowCount + ']" class="sow-input sow-input-sm" placeholder="Week"></td>' +
        '<td class="sow-center"><input type="text" name="periods[' + manualRowCount + ']" class="sow-input sow-input-sm" placeholder="P" style="width:40px"></td>' +
        '<td class="editable-cell" style="font-size:12px" contenteditable="true"></td>' +
        '<td class="editable-cell" style="font-size:12px" contenteditable="true"></td>' +
        '<td><input type="text" name="remarks[' + manualRowCount + ']" class="sow-input" placeholder="_____"></td>' +
        '<td class="no-print" style="white-space:nowrap">' +
        '<button type="button" class="btn btn-outline-primary btn-sm btn-icon" onclick="addSowRow(this)" title="Add row after this one"><i class="bi bi-plus-lg"></i></button> ' +
        '<button type="button" class="btn btn-outline-danger btn-sm btn-icon" onclick="removeSowRow(this)" title="Remove row"><i class="bi bi-x"></i></button>' +
        '</td>';
    if (btn && btn.closest('tr')) {
        btn.closest('tr').after(tr);
    } else {
        tbody.appendChild(tr);
    }
    manualRowCount++;
    updateTotalRows();
    const cell = tr.querySelector('.editable-cell');
    if (cell) { try { cell.focus(); } catch (e) {} }
}

function serializeSowRows() {
    const table = document.getElementById('sowTable');
    if (!table) return;
    const rows = [];
    const breaks = [];
    let rowIdx = 0;
    let curMain = '';
    let curSpec = '';
    table.querySelectorAll('tbody tr').forEach(function(tr) {
        if (tr.classList.contains('sow-break-row')) {
            const inp = tr.querySelector('input[name*="[label]"]');
            const label = inp ? inp.value.trim() : '';
            breaks.push({ position: rowIdx, label: label });
            return;
        }
        if (!tr.classList.contains('sow-row')) return;
        const tds = tr.querySelectorAll('td');
        const readText = function(c) { return c ? c.innerText.trim() : ''; };
        const readVal = function(c) { return (c && c.querySelector('input')) ? c.querySelector('input').value.trim() : ''; };
        let main = null, spec = null, mainAct, specAct, month, week, periods, methods, resources, remarks;
        if (tr.classList.contains('sow-manual-row')) {
            main = tds[0]; spec = tds[1];
            mainAct = tds[2]; specAct = tds[3];
            month = tds[4]; week = tds[5]; periods = tds[6];
            methods = tds[7]; resources = tds[8]; remarks = tds[9];
        } else {
            let i = 0;
            if (tds[i] && tds[i].classList.contains('sow-merged')) { main = tds[i]; i++; }
            if (tds[i] && tds[i].classList.contains('sow-merged')) { spec = tds[i]; i++; }
            mainAct = tds[i]; i++;
            specAct = tds[i]; i++;
            month = tds[i]; i++;
            week = tds[i]; i++;
            periods = tds[i]; i++;
            methods = tds[i]; i++;
            resources = tds[i]; i++;
            remarks = tds[i];
        }
        if (main) curMain = readText(main);
        if (spec) curSpec = readText(spec);
        rows.push({
            main: curMain,
            spec: curSpec,
            main_act: readText(mainAct),
            spec_act: readText(specAct),
            month: readVal(month),
            week: readVal(week),
            periods: readVal(periods),
            methods: readText(methods),
            resources: readText(resources),
            remarks: readVal(remarks)
        });
        rowIdx++;
    });
    const rowHidden = document.getElementById('sow_rows_hidden');
    const breakHidden = document.getElementById('sow_breaks_hidden');
    if (rowHidden) rowHidden.value = JSON.stringify(rows);
    if (breakHidden) breakHidden.value = JSON.stringify(breaks);
}

document.getElementById('sow_content').addEventListener('submit', function() {
    serializeSowRows();
});

function removeSowRow(btn) {
    if (!confirm('Remove this activity row?')) return;
    const tr = btn.closest('tr');
    tr.parentNode.removeChild(tr);
    updateTotalRows();
    recalcRowspans();
}

function updateTotalRows() {
    const el = document.getElementById('sow_total_rows');
    if (el) el.textContent = document.querySelectorAll('#sowTable tbody tr.sow-row').length;
}

function recalcRowspans() {
}

function getBreakRowHtml(moduleIdx, rowIdx) {
    return '';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Preview
document.getElementById('sow_preview_btn').addEventListener('click', function() {
    const table = document.getElementById('sowTable');
    if (!table) { alert('No data to preview.'); return; }
    const previewContent = document.getElementById('sow_preview_content');
    const school = document.getElementById('sow_school').value || '[School Name]';
    const teacher = document.getElementById('sow_teacher').value || '[Teacher Name]';
    const subject = document.getElementById('sow_subject_id').options[document.getElementById('sow_subject_id').selectedIndex]?.text || '[Subject]';
    const form = document.getElementById('sow_form').value;
    const stream = document.getElementById('sow_stream').value;
    const year = document.getElementById('sow_year').value;
    const term = document.getElementById('sow_term').value;

    let html = '<div class="sow-preview-doc">';
    html += '<div style="text-align:center;font-size:20px;font-weight:bold;text-decoration:underline;margin-bottom:16px;letter-spacing:1px">SCHEME OF WORK</div>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:14px"><tr>';
    html += '<td style="font-weight:bold;white-space:nowrap;padding:2px 4px;width:20%">Name of School:</td><td style="padding:2px 4px;width:30%">' + escapeHtml(school) + '</td>';
    html += '<td style="font-weight:bold;white-space:nowrap;padding:2px 4px;width:20%">Teacher\'s Name:</td><td style="padding:2px 4px;width:30%">' + escapeHtml(teacher) + '</td>';
    html += '</tr><tr>';
    html += '<td style="font-weight:bold;padding:2px 4px">Subject:</td><td style="padding:2px 4px">' + escapeHtml(subject) + '</td>';
    html += '<td style="font-weight:bold;padding:2px 4px">Class:</td><td style="padding:2px 4px">' + escapeHtml('Form ' + form + (stream ? ' ' + stream : '')) + '</td>';
    html += '</tr><tr>';
    html += '<td style="font-weight:bold;padding:2px 4px">Year:</td><td style="padding:2px 4px">' + escapeHtml(year) + '</td>';
    html += '<td style="font-weight:bold;padding:2px 4px">Term:</td><td style="padding:2px 4px">' + escapeHtml(term) + '</td>';
    html += '</tr></table>';

    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr style="background:#2E86C1;color:white">';
    html += '<th style="padding:6px;border:1px solid #000;text-align:center;font-weight:bold">Main Competence</th>';
    html += '<th style="padding:6px;border:1px solid #000;text-align:center;font-weight:bold">Specific Competence</th>';
    html += '<th style="padding:6px;border:1px solid #000;text-align:center;font-weight:bold">Main Learning Activities</th>';
    html += '<th style="padding:6px;border:1px solid #000;text-align:center;font-weight:bold">Specific Learning Activities</th>';
    html += '<th style="padding:6px;border:1px solid #000;text-align:center;font-weight:bold">Month</th>';
    html += '<th style="padding:6px;border:1px solid #000;text-align:center;font-weight:bold">Week</th>';
    html += '<th style="padding:6px;border:1px solid #000;text-align:center;font-weight:bold">Periods</th>';
    html += '<th style="padding:6px;border:1px solid #000;text-align:center;font-weight:bold">Methods</th>';
    html += '<th style="padding:6px;border:1px solid #000;text-align:center;font-weight:bold">Resources</th>';
    html += '<th style="padding:6px;border:1px solid #000;text-align:center;font-weight:bold">Remarks</th>';
    html += '</tr></thead><tbody>';

    const clone = table.cloneNode(true);
    const rows = clone.querySelectorAll('tbody tr');
    rows.forEach(function(tr) {
        if (tr.classList.contains('sow-break-row')) {
            const td = tr.querySelector('td');
            const inp = td ? td.querySelector('input[name*="[label]"]') : null;
            const label = inp ? inp.value : '--- BREAK ---';
            html += '<tr><td colspan="10" style="background:#fff9db;border:1px solid #fde68a;text-align:center;padding:8px;font-weight:bold;font-size:12px">' + escapeHtml(label) + '</td></tr>';
            return;
        }
        const tds = tr.querySelectorAll('td');
        if (tds.length < 10) return;
        html += '<tr>';
        for (let i = 0; i < 10; i++) {
            if (tds[i].classList.contains('sow-merged')) {
                html += '<td style="border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:left">' + tds[i].innerHTML + '</td>';
            } else if (tds[i].classList.contains('sow-center')) {
                const inp = tds[i].querySelector('input');
                const val = inp ? inp.value : '';
                html += '<td style="border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:center">' + escapeHtml(val) + '</td>';
            } else if (tds[i].querySelector('input')) {
                const inp = tds[i].querySelector('input');
                const val = inp ? inp.value : '';
                html += '<td style="border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:left">' + escapeHtml(val) + '</td>';
            } else {
                html += '<td style="border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:left">' + tds[i].innerHTML + '</td>';
            }
        }
        html += '</tr>';
    });

    html += '</tbody></table>';
    html += '</div>';

    previewContent.innerHTML = html;
    new bootstrap.Modal(document.getElementById('sowPreviewModal')).show();
});

document.getElementById('sow_print_preview').addEventListener('click', function() {
    const content = document.getElementById('sow_preview_content').innerHTML;
    const w = window.open('', '_blank');
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Scheme of Work Preview</title>');
    w.document.write('<style>');
    w.document.write('* { box-sizing: border-box; }');
    w.document.write('body { font-family: "Times New Roman", Times, serif; padding: 20px; color: #000; }');
    w.document.write('table { page-break-inside: auto; }');
    w.document.write('tr { page-break-inside: avoid; }');
    w.document.write('thead { display: table-header-group; }');
    w.document.write('@media print { body { padding: 0; } }');
    w.document.write('</style>');
    w.document.write('</head><body>');
    w.document.write(content);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
});

// Auto-sync hidden fields
['sow_form','sow_subject_id','sow_syllabus_id','sow_stream','sow_term','sow_year','sow_school','sow_teacher','sow_title'].forEach(function(id) {
    document.getElementById(id).addEventListener('change', function() {
        const map = {'sow_form':'save_form','sow_stream':'save_stream','sow_term':'save_term','sow_year':'save_year','sow_school':'save_school','sow_teacher':'save_teacher','sow_title':'save_title'};
        if (map[id]) document.getElementById(map[id]).value = this.value;
    });
});
</script>

<style>
.generate-sow-layout { display: grid; grid-template-columns: 320px 1fr; gap: 24px; align-items: start; }
.sow-sidebar { position: sticky; top: 92px; }
.sow-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.sow-table th { background: #2E86C1; color: white; padding: 8px 10px; text-align: center; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; border: 1px solid #1a5a8a; white-space: nowrap; }
.sow-table td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; }
.sow-table tbody tr:hover { background: #f8fafc; }
.sow-merged { background: #f0f7ff; vertical-align: top; font-size: 12px; }
.sow-input { border: none; outline: none; background: transparent; font-size: 12px; font-family: inherit; width: 100%; padding: 2px; }
.sow-input:focus { background: #f0f9ff; border-radius: 3px; }
.sow-input-sm { text-align: center; }
.sow-center { text-align: center; }
.sow-break-row td { background: #fff9db !important; }
.sow-preview-doc { font-family: 'Times New Roman', Times, serif; color: #000; }
.sow-preview-doc table td, .sow-preview-doc table th { font-size: 11px; }
@media (max-width: 1024px) {
    .generate-sow-layout { grid-template-columns: 1fr; }
    .sow-sidebar { position: static; }
}
</style>

<?php include __DIR__ . '/includes/footer.php'; ?>
