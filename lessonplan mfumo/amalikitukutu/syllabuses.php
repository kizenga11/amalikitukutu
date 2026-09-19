<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireAdmin();
$pageTitle = 'Syllabuses';
$db = getDB();
$error = $success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'add') {
        $sid = (int)($_POST['subject_id'] ?? 0);
        $title = trim($_POST['title'] ?? '');
        if ($sid && $title) {
            $db->prepare("INSERT INTO syllabuses (subject_id,title,publisher,year,form_range) VALUES (?,?,?,?,?)")
               ->execute([$sid, $title, trim($_POST['publisher']??'TIE'), trim($_POST['year']??''), trim($_POST['form_range']??'')]);
            $success = "Syllabus added.";
        } else { $error = "Subject and title are required."; }
    } elseif ($action === 'delete') {
        $db->prepare("DELETE FROM syllabuses WHERE id=?")->execute([(int)$_POST['id']]);
        $success = "Syllabus deleted.";
    } elseif ($action === 'edit') {
        $db->prepare("UPDATE syllabuses SET subject_id=?,title=?,publisher=?,year=?,form_range=? WHERE id=?")
           ->execute([(int)$_POST['subject_id'],trim($_POST['title']),trim($_POST['publisher']),trim($_POST['year']),trim($_POST['form_range']),(int)$_POST['id']]);
        $success = "Syllabus updated.";
    }
}

$syllabuses = $db->query("
    SELECT sy.*, s.name AS subject_name, s.code AS subject_code,
           COUNT(DISTINCT m.id) AS modules, COUNT(DISTINCT u.id) AS units, COUNT(DISTINCT e.id) AS elements
    FROM syllabuses sy
    JOIN subjects s ON s.id = sy.subject_id
    LEFT JOIN modules m ON m.syllabus_id = sy.id
    LEFT JOIN units u ON u.module_id = m.id
    LEFT JOIN elements e ON e.unit_id = u.id
    GROUP BY sy.id ORDER BY s.name, sy.title
")->fetchAll();

$subjects = $db->query("SELECT id, name, code FROM subjects ORDER BY name")->fetchAll();
include __DIR__ . '/includes/header.php';
?>
<div class="page-header">
    <div class="page-header-left">
        <h1 class="page-title">Syllabuses</h1>
        <p class="page-subtitle">Syllabuses link a subject to its curriculum content (modules, units, elements).</p>
    </div>
    <div class="page-header-actions no-print">
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addModal"><i class="bi bi-plus-lg"></i> Add Syllabus</button>
    </div>
</div>

<?php if ($error): ?><div class="alert alert-danger"><i class="bi bi-x-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($error) ?></div></div><?php endif; ?>
<?php if ($success): ?><div class="alert alert-success"><i class="bi bi-check-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($success) ?></div></div><?php endif; ?>

<div class="card">
    <?php if (empty($syllabuses)): ?>
    <div class="empty-state">
        <i class="bi bi-journals"></i>
        <div class="empty-state-title">No syllabuses yet</div>
        <div class="empty-state-text">Add a syllabus and then seed modules, units, and elements.</div>
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addModal"><i class="bi bi-plus-lg"></i> Add Syllabus</button>
    </div>
    <?php else: ?>
    <table class="data-table">
        <thead>
            <tr><th>#</th><th>Subject</th><th>Syllabus Title</th><th>Publisher</th><th>Year</th><th>Form Range</th><th>Modules</th><th>Units</th><th>Elements</th><th style="width:90px">Actions</th></tr>
        </thead>
        <tbody>
            <?php foreach ($syllabuses as $i => $sy): ?>
            <tr>
                <td class="text-muted"><?= $i+1 ?></td>
                <td><span class="badge badge-blue"><?= htmlspecialchars($sy['subject_code']) ?></span><div style="font-size:11px;color:#9ca3af;margin-top:2px"><?= htmlspecialchars($sy['subject_name']) ?></div></td>
                <td class="fw-600"><?= htmlspecialchars($sy['title']) ?></td>
                <td class="text-muted"><?= htmlspecialchars($sy['publisher']) ?></td>
                <td class="text-muted"><?= htmlspecialchars($sy['year']) ?></td>
                <td class="text-muted"><?= htmlspecialchars($sy['form_range']) ?></td>
                <td class="text-muted"><?= $sy['modules'] ?></td>
                <td class="text-muted"><?= $sy['units'] ?></td>
                <td><span class="badge badge-green"><?= $sy['elements'] ?></span></td>
                <td>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-outline btn-sm btn-icon"
                            onclick="editRow(<?= $sy['id'] ?>,<?= $sy['subject_id'] ?>,'<?= addslashes($sy['title']) ?>','<?= addslashes($sy['publisher']) ?>','<?= addslashes($sy['year']) ?>','<?= addslashes($sy['form_range']) ?>')">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <form method="post" class="d-inline" onsubmit="return confirm('Delete this syllabus and all its modules/units/elements?')">
                            <input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= $sy['id'] ?>">
                            <button class="btn btn-outline-danger btn-sm btn-icon"><i class="bi bi-trash"></i></button>
                        </form>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <div class="card-footer"><?= count($syllabuses) ?> syllabus(es) total</div>
    <?php endif; ?>
</div>

<!-- Add Modal -->
<div class="modal fade" id="addModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <form method="post" class="modal-content">
            <input type="hidden" name="action" value="add">
            <div class="modal-header"><h5 class="modal-title"><i class="bi bi-journals text-primary me-2"></i>Add Syllabus</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Subject</label>
                    <select name="subject_id" class="form-select" required>
                        <option value="">— Select Subject —</option>
                        <?php foreach ($subjects as $s): ?><option value="<?= $s['id'] ?>"><?= htmlspecialchars($s['name']) ?> (<?= $s['code'] ?>)</option><?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">Syllabus Title</label><input type="text" name="title" class="form-control" required placeholder="e.g. Computer Applications Syllabus for Secondary Schools"></div>
                <div class="form-row form-row-3">
                    <div class="form-group mb-0"><label class="form-label">Publisher</label><input type="text" name="publisher" class="form-control" value="TIE"></div>
                    <div class="form-group mb-0"><label class="form-label">Year</label><input type="text" name="year" class="form-control" placeholder="e.g. 2023"></div>
                    <div class="form-group mb-0"><label class="form-label">Form Range</label><input type="text" name="form_range" class="form-control" placeholder="e.g. Form 1-4"></div>
                </div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Save</button></div>
        </form>
    </div>
</div>

<!-- Edit Modal -->
<div class="modal fade" id="editModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <form method="post" class="modal-content">
            <input type="hidden" name="action" value="edit"><input type="hidden" name="id" id="editId">
            <div class="modal-header"><h5 class="modal-title"><i class="bi bi-pencil text-primary me-2"></i>Edit Syllabus</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Subject</label>
                    <select name="subject_id" id="editSubjectId" class="form-select" required>
                        <?php foreach ($subjects as $s): ?><option value="<?= $s['id'] ?>"><?= htmlspecialchars($s['name']) ?> (<?= $s['code'] ?>)</option><?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">Title</label><input type="text" name="title" id="editTitle" class="form-control" required></div>
                <div class="form-row form-row-3">
                    <div class="form-group mb-0"><label class="form-label">Publisher</label><input type="text" name="publisher" id="editPublisher" class="form-control"></div>
                    <div class="form-group mb-0"><label class="form-label">Year</label><input type="text" name="year" id="editYear" class="form-control"></div>
                    <div class="form-group mb-0"><label class="form-label">Form Range</label><input type="text" name="form_range" id="editFormRange" class="form-control"></div>
                </div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Update</button></div>
        </form>
    </div>
</div>
<script>
function editRow(id,sid,title,pub,yr,fr){
    document.getElementById('editId').value=id;
    document.getElementById('editSubjectId').value=sid;
    document.getElementById('editTitle').value=title;
    document.getElementById('editPublisher').value=pub;
    document.getElementById('editYear').value=yr;
    document.getElementById('editFormRange').value=fr;
    new bootstrap.Modal(document.getElementById('editModal')).show();
}
</script>
<?php include __DIR__ . '/includes/footer.php'; ?>
