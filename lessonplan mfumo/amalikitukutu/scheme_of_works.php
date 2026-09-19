<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireLogin();
$pageTitle = 'Saved Schemes of Work';
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'delete') {
    $id = (int)$_POST['id'];
    $chk = $db->prepare("SELECT subject_id FROM scheme_of_works WHERE id=?");
    $chk->execute([$id]);
    if (canAccessSubject((int)$chk->fetchColumn())) {
        $db->prepare("DELETE FROM scheme_of_works WHERE id=?")->execute([$id]);
    }
    header("Location: scheme_of_works.php?msg=deleted");
    exit;
}

$subjectFilter = (int)($_GET['subject_id'] ?? 0);
$formFilter = trim($_GET['form'] ?? '');
$streamFilter = trim($_GET['class_stream'] ?? '');
$ids = allowedSubjectIds();

$where = ['1=1'];
$params = [];
if (!empty($ids)) { $where[] = 'sow.subject_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'; array_push($params, ...$ids); }
if ($subjectFilter) { $where[] = 'sow.subject_id=?'; $params[] = $subjectFilter; }
if ($formFilter) { $where[] = 'sow.form=?'; $params[] = $formFilter; }
if ($streamFilter && in_array($streamFilter, ['A','B'], true)) { $where[] = 'sow.class_stream=?'; $params[] = $streamFilter; }

$sows = $db->prepare("
    SELECT sow.*, sub.name AS subject_name, sub.code AS subject_code
    FROM scheme_of_works sow
    JOIN subjects sub ON sub.id = sow.subject_id
    WHERE " . implode(' AND ', $where) . "
    ORDER BY sow.created_at DESC
");
$sows->execute($params);
$sowList = $sows->fetchAll();

$subjects = scopedSubjects($db);

include __DIR__ . '/includes/header.php';
?>

<div class="page-header">
    <div class="page-header-left">
        <h1 class="page-title">Saved Schemes of Work</h1>
        <p class="page-subtitle">View, download, or delete previously created Schemes of Work.</p>
    </div>
    <div class="page-header-actions">
        <a href="generate_sow.php" class="btn btn-primary"><i class="bi bi-plus-lg"></i> New Scheme of Work</a>
    </div>
</div>

<?php if (isset($_GET['msg']) && $_GET['msg'] === 'deleted'): ?>
<div class="alert alert-success"><i class="bi bi-check-circle-fill"></i><div class="alert-body">Scheme of Work deleted successfully.</div></div>
<?php endif; ?>

<div class="filter-bar">
    <form method="get" style="display:contents">
        <div class="filter-group">
            <label>Subject</label>
            <select name="subject_id" class="form-control">
                <option value="">All Subjects</option>
                <?php foreach ($subjects as $s): ?>
                <option value="<?= $s['id'] ?>" <?= $subjectFilter==$s['id']?'selected':'' ?>><?= htmlspecialchars($s['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="filter-group" style="max-width:120px">
            <label>Form</label>
            <input type="text" name="form" class="form-control" value="<?= htmlspecialchars($formFilter) ?>" placeholder="e.g. I">
        </div>
        <div class="filter-group" style="max-width:120px">
            <label>Stream</label>
            <select name="class_stream" class="form-control">
                <option value="">All</option>
                <option value="A" <?= $streamFilter==='A'?'selected':'' ?>>A</option>
                <option value="B" <?= $streamFilter==='B'?'selected':'' ?>>B</option>
            </select>
        </div>
        <button type="submit" class="btn btn-primary" style="align-self:flex-end"><i class="bi bi-search"></i> Filter</button>
        <a href="scheme_of_works.php" class="btn btn-outline" style="align-self:flex-end">Clear</a>
    </form>
</div>

<div class="card">
    <?php if (empty($sowList)): ?>
    <div class="empty-state">
        <i class="bi bi-file-earmark-x"></i>
        <div class="empty-state-title">No Schemes of Work found</div>
        <div class="empty-state-text"><?= ($subjectFilter || $formFilter) ? 'No results match your filters.' : 'Create your first Scheme of Work.' ?></div>
        <a href="generate_sow.php" class="btn btn-primary"><i class="bi bi-plus-lg"></i> Create New</a>
    </div>
    <?php else: ?>
    <table class="data-table">
        <thead>
            <tr>
                <th>#</th>
                <th>Title</th>
                <th>Subject</th>
                <th>Form</th>
                <th>Stream</th>
                <th>Term</th>
                <th>Year</th>
                <th>School</th>
                <th>Teacher</th>
                <th>Created</th>
                <th style="width:130px">Actions</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($sowList as $i => $s): ?>
            <tr>
                <td class="text-muted"><?= $i + 1 ?></td>
                <td class="fw-600"><?= htmlspecialchars($s['title'] ?: 'Scheme of Work') ?></td>
                <td><span class="badge badge-blue"><?= htmlspecialchars($s['subject_code']) ?></span></td>
                <td class="text-muted"><?= htmlspecialchars($s['form']) ?></td>
                <td class="text-muted"><?= htmlspecialchars($s['class_stream'] ?: '—') ?></td>
                <td><?= htmlspecialchars($s['term']) ?></td>
                <td><?= htmlspecialchars($s['year']) ?></td>
                <td style="font-size:12.5px"><?= htmlspecialchars($s['school_name'] ?: '—') ?></td>
                <td style="font-size:12.5px"><?= htmlspecialchars($s['teacher_name'] ?: '—') ?></td>
                <td style="font-size:12px;white-space:nowrap"><?= date('d M Y', strtotime($s['created_at'])) ?></td>
                <td>
                    <div style="display:flex;gap:6px">
                        <a href="view_sow.php?id=<?= $s['id'] ?>" class="btn btn-outline-primary btn-sm btn-icon" title="View">
                            <i class="bi bi-eye"></i>
                        </a>
                        <a href="download_sow_pdf.php?id=<?= $s['id'] ?>" class="btn btn-outline-danger btn-sm btn-icon" title="Download PDF" target="_blank">
                            <i class="bi bi-file-pdf"></i>
                        </a>
                        <form method="post" class="d-inline" onsubmit="return confirmDelete('Delete this Scheme of Work and all its data?')">
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
    <div class="card-footer"><?= count($sowList) ?> scheme(s) of work found</div>
    <?php endif; ?>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
