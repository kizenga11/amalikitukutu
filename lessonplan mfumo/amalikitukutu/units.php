<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireAdmin();
$pageTitle = 'Units (Specific Competences)';
$db = getDB();
$error = $success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'add') {
        $mid = (int)($_POST['module_id']??0); $code = trim($_POST['code']??''); $title = trim($_POST['title']??'');
        if ($mid && $code && $title) {
            $db->prepare("INSERT INTO units (module_id,code,title,periods_allocated,form) VALUES (?,?,?,?,?)")->execute([$mid,$code,$title,(int)($_POST['periods_allocated']??0),trim($_POST['form']??'')]);
            $success = "Unit added.";
        } else { $error = "Module, code and title required."; }
    } elseif ($action === 'delete') {
        $db->prepare("DELETE FROM units WHERE id=?")->execute([(int)$_POST['id']]);
        $success = "Unit deleted.";
    } elseif ($action === 'edit') {
        $db->prepare("UPDATE units SET module_id=?,code=?,title=?,periods_allocated=?,form=? WHERE id=?")
           ->execute([(int)$_POST['module_id'],trim($_POST['code']),trim($_POST['title']),(int)$_POST['periods_allocated'],trim($_POST['form']??''),(int)$_POST['id']]);
        $success = "Unit updated.";
    }
}

$units = $db->query("
    SELECT u.*, m.code AS module_code, m.form, s.name AS subject_name, s.code AS subject_code,
           COUNT(DISTINCT e.id) AS elements
    FROM units u
    JOIN modules m ON m.id=u.module_id
    JOIN syllabuses sy ON sy.id=m.syllabus_id
    JOIN subjects s ON s.id=sy.subject_id
    LEFT JOIN elements e ON e.unit_id=u.id
    GROUP BY u.id ORDER BY s.name, m.code, u.code
")->fetchAll();

$modules = $db->query("SELECT m.id, CONCAT(s.name,' — ',m.code,' ',m.title) AS label FROM modules m JOIN syllabuses sy ON sy.id=m.syllabus_id JOIN subjects s ON s.id=sy.subject_id ORDER BY s.name, m.code")->fetchAll();

include __DIR__ . '/includes/header.php';
?>
<div class="page-header">
    <div class="page-header-left">
        <h1 class="page-title">Units <span style="font-weight:400;color:var(--text-muted);font-size:16px">(Specific Competences)</span></h1>
        <p class="page-subtitle">Units define specific competences within each module and carry period allocations.</p>
    </div>
    <div class="page-header-actions no-print">
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addModal"><i class="bi bi-plus-lg"></i> Add Unit</button>
    </div>
</div>
<?php if ($error): ?><div class="alert alert-danger"><i class="bi bi-x-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($error) ?></div></div><?php endif; ?>
<?php if ($success): ?><div class="alert alert-success"><i class="bi bi-check-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($success) ?></div></div><?php endif; ?>

<div class="card">
    <?php if (empty($units)): ?>
    <div class="empty-state"><i class="bi bi-collection"></i><div class="empty-state-title">No units yet</div><div class="empty-state-text">Units are created under modules.</div><button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addModal"><i class="bi bi-plus-lg"></i> Add Unit</button></div>
    <?php else: ?>
    <table class="data-table">
        <thead><tr><th>#</th><th>Subject</th><th>Module</th><th>Code</th><th>Form</th><th>Title (Specific Competence)</th><th>Periods</th><th>Elements</th><th style="width:90px">Actions</th></tr></thead>
        <tbody>
            <?php foreach ($units as $i => $u): ?>
            <tr>
                <td class="text-muted"><?= $i+1 ?></td>
                <td><span class="badge badge-blue"><?= htmlspecialchars($u['subject_code']) ?></span></td>
                <td><span class="badge badge-gray"><?= htmlspecialchars($u['module_code']) ?></span></td>
                <td><span class="badge badge-gray"><?= htmlspecialchars($u['code']) ?></span></td>
                <td class="text-muted"><?= htmlspecialchars($u['form']) ?></td>
                <td style="font-size:13px"><?= htmlspecialchars(substr($u['title'],0,70)) ?><?= strlen($u['title'])>70?'…':'' ?></td>
                <td><span class="badge badge-orange"><?= $u['periods_allocated'] ?></span></td>
                <td><span class="badge badge-green"><?= $u['elements'] ?></span></td>
                <td><div style="display:flex;gap:6px">
                    <button class="btn btn-outline btn-sm btn-icon" onclick="editRow(<?= $u['id'] ?>,<?= $u['module_id'] ?>,'<?= addslashes($u['code']) ?>','<?= addslashes($u['title']) ?>',<?= (int)$u['periods_allocated'] ?>,'<?= addslashes($u['form']??'') ?>')"><i class="bi bi-pencil"></i></button>
                    <form method="post" class="d-inline" onsubmit="return confirm('Delete unit and all its elements?')"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= $u['id'] ?>"><button class="btn btn-outline-danger btn-sm btn-icon"><i class="bi bi-trash"></i></button></form>
                </div></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <div class="card-footer"><?= count($units) ?> unit(s) total</div>
    <?php endif; ?>
</div>

<!-- Add Modal -->
<div class="modal fade" id="addModal" tabindex="-1"><div class="modal-dialog modal-lg"><form method="post" class="modal-content"><input type="hidden" name="action" value="add">
    <div class="modal-header"><h5 class="modal-title"><i class="bi bi-collection text-primary me-2"></i>Add Unit (Specific Competence)</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
        <div class="form-group"><label class="form-label">Module (Main Competence)</label><select name="module_id" class="form-select" required><option value="">— Select Module —</option><?php foreach ($modules as $m): ?><option value="<?= $m['id'] ?>"><?= htmlspecialchars($m['label']) ?></option><?php endforeach; ?></select></div>
        <div class="form-row form-row-4">
            <div class="form-group mb-0"><label class="form-label">Code</label><input type="text" name="code" class="form-control" placeholder="e.g. 1.1" required></div>
            <div class="form-group mb-0"><label class="form-label">Form</label><input type="text" name="form" class="form-control" placeholder="e.g. I"></div>
            <div class="form-group mb-0"><label class="form-label">Periods</label><input type="number" name="periods_allocated" class="form-control" min="0" value="0"></div>
            <div class="form-group mb-0"><label class="form-label">Title</label><input type="text" name="title" class="form-control" required placeholder="Specific competence name"></div>
        </div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Save</button></div>
</form></div></div>

<!-- Edit Modal -->
<div class="modal fade" id="editModal" tabindex="-1"><div class="modal-dialog modal-lg"><form method="post" class="modal-content"><input type="hidden" name="action" value="edit"><input type="hidden" name="id" id="editId">
    <div class="modal-header"><h5 class="modal-title"><i class="bi bi-pencil text-primary me-2"></i>Edit Unit</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
        <div class="form-group"><label class="form-label">Module</label><select name="module_id" id="editModId" class="form-select" required><?php foreach ($modules as $m): ?><option value="<?= $m['id'] ?>"><?= htmlspecialchars($m['label']) ?></option><?php endforeach; ?></select></div>
        <div class="form-row form-row-4"><div class="form-group mb-0"><label class="form-label">Code</label><input type="text" name="code" id="editCode" class="form-control" required></div><div class="form-group mb-0"><label class="form-label">Form</label><input type="text" name="form" id="editUnitForm" class="form-control"></div><div class="form-group mb-0"><label class="form-label">Periods</label><input type="number" name="periods_allocated" id="editPeriods" class="form-control" min="0"></div><div class="form-group mb-0"><label class="form-label">Title</label><input type="text" name="title" id="editTitle" class="form-control" required></div></div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Update</button></div>
</form></div></div>
<script>
function editRow(id,mid,code,title,periods,form){
    document.getElementById('editId').value=id; document.getElementById('editModId').value=mid;
    document.getElementById('editCode').value=code; document.getElementById('editTitle').value=title;
    document.getElementById('editPeriods').value=periods; document.getElementById('editUnitForm').value=form||'';
    new bootstrap.Modal(document.getElementById('editModal')).show();
}
</script>
<?php include __DIR__ . '/includes/footer.php'; ?>
