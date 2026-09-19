<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireAdmin();
$pageTitle = 'Modules (Main Competences)';
$db = getDB();
$error = $success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'add') {
        $sid = (int)($_POST['syllabus_id']??0); $code = trim($_POST['code']??''); $title = trim($_POST['title']??'');
        if ($sid && $code && $title) {
            $db->prepare("INSERT INTO modules (syllabus_id,code,title,form) VALUES (?,?,?,?)")->execute([$sid,$code,$title,trim($_POST['form']??'')]);
            $success = "Module added.";
        } else { $error = "Syllabus, code and title required."; }
    } elseif ($action === 'delete') {
        $db->prepare("DELETE FROM modules WHERE id=?")->execute([(int)$_POST['id']]);
        $success = "Module deleted.";
    } elseif ($action === 'edit') {
        $db->prepare("UPDATE modules SET syllabus_id=?,code=?,title=?,form=? WHERE id=?")
           ->execute([(int)$_POST['syllabus_id'],trim($_POST['code']),trim($_POST['title']),trim($_POST['form']),(int)$_POST['id']]);
        $success = "Module updated.";
    }
}

$modules = $db->query("
    SELECT m.*, sy.title AS syllabus_title, s.name AS subject_name, s.code AS subject_code,
           COUNT(DISTINCT u.id) AS units, COUNT(DISTINCT e.id) AS elements
    FROM modules m
    JOIN syllabuses sy ON sy.id=m.syllabus_id
    JOIN subjects s ON s.id=sy.subject_id
    LEFT JOIN units u ON u.module_id=m.id
    LEFT JOIN elements e ON e.unit_id=u.id
    GROUP BY m.id ORDER BY s.name, m.code
")->fetchAll();

$syllabuses = $db->query("SELECT sy.id, CONCAT(s.name,' — ',sy.title) AS label FROM syllabuses sy JOIN subjects s ON s.id=sy.subject_id ORDER BY s.name, sy.title")->fetchAll();

include __DIR__ . '/includes/header.php';
?>
<div class="page-header">
    <div class="page-header-left">
        <h1 class="page-title">Modules <span style="font-weight:400;color:var(--text-muted);font-size:16px">(Main Competences)</span></h1>
        <p class="page-subtitle">Modules are the top-level competences within each syllabus.</p>
    </div>
    <div class="page-header-actions no-print">
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addModal"><i class="bi bi-plus-lg"></i> Add Module</button>
    </div>
</div>
<?php if ($error): ?><div class="alert alert-danger"><i class="bi bi-x-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($error) ?></div></div><?php endif; ?>
<?php if ($success): ?><div class="alert alert-success"><i class="bi bi-check-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($success) ?></div></div><?php endif; ?>

<div class="card">
    <?php if (empty($modules)): ?>
    <div class="empty-state"><i class="bi bi-folder2"></i><div class="empty-state-title">No modules yet</div><div class="empty-state-text">Add modules or import SQL data.</div><button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addModal"><i class="bi bi-plus-lg"></i> Add Module</button></div>
    <?php else: ?>
    <table class="data-table">
        <thead><tr><th>#</th><th>Subject</th><th>Syllabus</th><th>Code</th><th>Form</th><th>Title (Main Competence)</th><th>Units</th><th>Elements</th><th style="width:90px">Actions</th></tr></thead>
        <tbody>
            <?php foreach ($modules as $i => $m): ?>
            <tr>
                <td class="text-muted"><?= $i+1 ?></td>
                <td><span class="badge badge-blue"><?= htmlspecialchars($m['subject_code']) ?></span></td>
                <td style="font-size:12px;color:#6b7280;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><?= htmlspecialchars($m['syllabus_title']) ?></td>
                <td><span class="badge badge-gray"><?= htmlspecialchars($m['code']) ?></span></td>
                <td class="text-muted"><?= htmlspecialchars($m['form']) ?></td>
                <td style="font-size:13px"><?= htmlspecialchars(substr($m['title'],0,70)) ?><?= strlen($m['title'])>70?'…':'' ?></td>
                <td class="text-muted"><?= $m['units'] ?></td>
                <td><span class="badge badge-green"><?= $m['elements'] ?></span></td>
                <td><div style="display:flex;gap:6px">
                    <button class="btn btn-outline btn-sm btn-icon" onclick="editRow(<?= $m['id'] ?>,<?= $m['syllabus_id'] ?>,'<?= addslashes($m['code']) ?>','<?= addslashes($m['title']) ?>','<?= addslashes($m['form']) ?>')"><i class="bi bi-pencil"></i></button>
                    <form method="post" class="d-inline" onsubmit="return confirm('Delete module and all its units/elements?')"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= $m['id'] ?>"><button class="btn btn-outline-danger btn-sm btn-icon"><i class="bi bi-trash"></i></button></form>
                </div></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <div class="card-footer"><?= count($modules) ?> module(s) total</div>
    <?php endif; ?>
</div>

<!-- Add Modal -->
<div class="modal fade" id="addModal" tabindex="-1"><div class="modal-dialog modal-lg"><form method="post" class="modal-content"><input type="hidden" name="action" value="add">
    <div class="modal-header"><h5 class="modal-title"><i class="bi bi-folder2 text-primary me-2"></i>Add Module (Main Competence)</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
        <div class="form-group"><label class="form-label">Syllabus</label><select name="syllabus_id" class="form-select" required><option value="">— Select Syllabus —</option><?php foreach ($syllabuses as $sy): ?><option value="<?= $sy['id'] ?>"><?= htmlspecialchars($sy['label']) ?></option><?php endforeach; ?></select></div>
        <div class="form-row form-row-3">
            <div class="form-group mb-0"><label class="form-label">Code</label><input type="text" name="code" class="form-control" placeholder="e.g. 1.0" required></div>
            <div class="form-group mb-0"><label class="form-label">Form</label><input type="text" name="form" class="form-control" placeholder="e.g. 1"></div>
            <div class="form-group mb-0"><label class="form-label">Title</label><input type="text" name="title" class="form-control" required placeholder="Main competence name"></div>
        </div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Save</button></div>
</form></div></div>

<!-- Edit Modal -->
<div class="modal fade" id="editModal" tabindex="-1"><div class="modal-dialog modal-lg"><form method="post" class="modal-content"><input type="hidden" name="action" value="edit"><input type="hidden" name="id" id="editId">
    <div class="modal-header"><h5 class="modal-title"><i class="bi bi-pencil text-primary me-2"></i>Edit Module</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
        <div class="form-group"><label class="form-label">Syllabus</label><select name="syllabus_id" id="editSylId" class="form-select" required><?php foreach ($syllabuses as $sy): ?><option value="<?= $sy['id'] ?>"><?= htmlspecialchars($sy['label']) ?></option><?php endforeach; ?></select></div>
        <div class="form-row form-row-3"><div class="form-group mb-0"><label class="form-label">Code</label><input type="text" name="code" id="editCode" class="form-control" required></div><div class="form-group mb-0"><label class="form-label">Form</label><input type="text" name="form" id="editForm" class="form-control"></div><div class="form-group mb-0"><label class="form-label">Title</label><input type="text" name="title" id="editTitle" class="form-control" required></div></div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Update</button></div>
</form></div></div>
<script>
function editRow(id,sid,code,title,form){
    document.getElementById('editId').value=id; document.getElementById('editSylId').value=sid;
    document.getElementById('editCode').value=code; document.getElementById('editTitle').value=title; document.getElementById('editForm').value=form;
    new bootstrap.Modal(document.getElementById('editModal')).show();
}
</script>
<?php include __DIR__ . '/includes/footer.php'; ?>
