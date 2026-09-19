<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireAdmin();
$pageTitle = 'Subjects';
$db = getDB();
$error = $success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'add') {
        $name = trim($_POST['name'] ?? '');
        $code = strtoupper(trim($_POST['code'] ?? ''));
        if ($name && $code) {
            try {
                $db->prepare("INSERT INTO subjects (name, code) VALUES (?, ?)")->execute([$name, $code]);
                $success = "Subject \"$name\" added successfully.";
            } catch (PDOException $e) {
                $error = $e->getCode() == 23000 ? "A subject with that code already exists." : $e->getMessage();
            }
        } else { $error = "Name and code are required."; }
    } elseif ($action === 'delete') {
        $db->prepare("DELETE FROM subjects WHERE id=?")->execute([(int)$_POST['id']]);
        $success = "Subject deleted.";
    } elseif ($action === 'edit') {
        $id = (int)$_POST['id'];
        $name = trim($_POST['name'] ?? '');
        $code = strtoupper(trim($_POST['code'] ?? ''));
        if ($name && $code && $id) {
            try {
                $db->prepare("UPDATE subjects SET name=?, code=? WHERE id=?")->execute([$name, $code, $id]);
                $success = "Subject updated.";
            } catch (PDOException $e) { $error = "Code already in use."; }
        }
    }
}

$subjects = $db->query("
    SELECT s.*, COUNT(DISTINCT sy.id) AS syllabuses,
           COUNT(DISTINCT m.id) AS modules,
           COUNT(DISTINCT u.id) AS units,
           COUNT(DISTINCT e.id) AS elements
    FROM subjects s
    LEFT JOIN syllabuses sy ON sy.subject_id = s.id
    LEFT JOIN modules m ON m.syllabus_id = sy.id
    LEFT JOIN units u ON u.module_id = m.id
    LEFT JOIN elements e ON e.unit_id = u.id
    GROUP BY s.id ORDER BY s.name
")->fetchAll();

include __DIR__ . '/includes/header.php';
?>

<div class="page-header">
    <div class="page-header-left">
        <h1 class="page-title">Subjects</h1>
        <p class="page-subtitle">Manage all subjects — each subject has its own syllabus, modules, units, and elements.</p>
    </div>
    <div class="page-header-actions no-print">
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addModal">
            <i class="bi bi-plus-lg"></i> Add Subject
        </button>
    </div>
</div>

<?php if ($error): ?>
<div class="alert alert-danger"><i class="bi bi-x-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($error) ?></div></div>
<?php endif; ?>
<?php if ($success): ?>
<div class="alert alert-success"><i class="bi bi-check-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($success) ?></div></div>
<?php endif; ?>

<div class="card">
    <?php if (empty($subjects)): ?>
    <div class="empty-state">
        <i class="bi bi-book"></i>
        <div class="empty-state-title">No subjects found</div>
        <div class="empty-state-text">Add your first subject to begin building the curriculum.</div>
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addModal"><i class="bi bi-plus-lg"></i> Add Subject</button>
    </div>
    <?php else: ?>
    <table class="data-table">
        <thead>
            <tr>
                <th>#</th>
                <th>Code</th>
                <th>Subject Name</th>
                <th>Syllabuses</th>
                <th>Modules</th>
                <th>Units</th>
                <th>Elements</th>
                <th style="width:100px">Actions</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($subjects as $i => $s): ?>
            <tr>
                <td class="text-muted"><?= $i + 1 ?></td>
                <td><span class="badge badge-blue"><?= htmlspecialchars($s['code']) ?></span></td>
                <td class="fw-600"><?= htmlspecialchars($s['name']) ?></td>
                <td class="text-muted"><?= $s['syllabuses'] ?></td>
                <td class="text-muted"><?= $s['modules'] ?></td>
                <td class="text-muted"><?= $s['units'] ?></td>
                <td><span class="badge badge-green"><?= $s['elements'] ?></span></td>
                <td>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-outline btn-sm btn-icon" title="Edit"
                            onclick="editSubject(<?= $s['id'] ?>,'<?= addslashes($s['name']) ?>','<?= addslashes($s['code']) ?>')">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <form method="post" class="d-inline" onsubmit="return confirm('Delete «<?= addslashes($s['name']) ?>» and ALL its data?')">
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="id" value="<?= $s['id'] ?>">
                            <button class="btn btn-outline-danger btn-sm btn-icon" title="Delete"><i class="bi bi-trash"></i></button>
                        </form>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <div class="card-footer"><?= count($subjects) ?> subject(s) total</div>
    <?php endif; ?>
</div>

<!-- Add Modal -->
<div class="modal fade" id="addModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="post" class="modal-content">
            <input type="hidden" name="action" value="add">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-plus-circle text-primary me-2"></i>Add Subject</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Subject Name</label>
                    <input type="text" name="name" class="form-control" placeholder="e.g. Computer Applications, Mathematics, Biology" required>
                </div>
                <div class="form-group mb-0">
                    <label class="form-label">Short Code</label>
                    <input type="text" name="code" class="form-control" placeholder="e.g. CA, MATH, BIO" required maxlength="20" style="text-transform:uppercase">
                    <div class="form-hint">Used as a short identifier badge throughout the system.</div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Save Subject</button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Modal -->
<div class="modal fade" id="editModal" tabindex="-1">
    <div class="modal-dialog">
        <form method="post" class="modal-content">
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="id" id="editId">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-pencil text-primary me-2"></i>Edit Subject</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Subject Name</label>
                    <input type="text" name="name" id="editName" class="form-control" required>
                </div>
                <div class="form-group mb-0">
                    <label class="form-label">Short Code</label>
                    <input type="text" name="code" id="editCode" class="form-control" required maxlength="20" style="text-transform:uppercase">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> Update</button>
            </div>
        </form>
    </div>
</div>

<script>
function editSubject(id, name, code) {
    document.getElementById('editId').value = id;
    document.getElementById('editName').value = name;
    document.getElementById('editCode').value = code;
    new bootstrap.Modal(document.getElementById('editModal')).show();
}
</script>

<?php include __DIR__ . '/includes/footer.php'; ?>
