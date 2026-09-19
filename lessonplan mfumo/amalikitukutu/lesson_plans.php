<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireLogin();
$pageTitle = 'Saved Lesson Plans';
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'delete') {
    $id = (int)$_POST['id'];
    $chk = $db->prepare("SELECT subject_id FROM lesson_plans WHERE id=?");
    $chk->execute([$id]);
    if (canAccessSubject((int)$chk->fetchColumn())) {
        $db->prepare("DELETE FROM lesson_plans WHERE id=?")->execute([$id]);
    }
    header("Location: lesson_plans.php?msg=deleted");
    exit;
}

$filterSubject = (int)($_GET['subject_id'] ?? 0);
$filterForm    = trim($_GET['form'] ?? '');
$filterStream  = trim($_GET['class_stream'] ?? '');
$filterTeacher = trim($_GET['teacher'] ?? '');
$ids = allowedSubjectIds();

$where  = ['1=1'];
$params = [];
if (!empty($ids)) { $where[] = 'lp.subject_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'; array_push($params, ...$ids); }
if ($filterSubject) { $where[] = 'lp.subject_id=?'; $params[] = $filterSubject; }
if ($filterForm)    { $where[] = 'lp.form=?'; $params[] = $filterForm; }
if ($filterStream && in_array($filterStream, ['A','B'], true)) { $where[] = 'lp.class_stream=?'; $params[] = $filterStream; }
if ($filterTeacher) { $where[] = 'lp.teacher_name LIKE ?'; $params[] = "%$filterTeacher%"; }

$stmt = $db->prepare("
    SELECT lp.id, lp.school_name, lp.teacher_name, lp.form, lp.class_stream,
           lp.lesson_date, lp.lesson_time, lp.girls_present, lp.boys_present, lp.created_at,
           s.name AS subject_name, s.code AS subject_code,
           e.code AS element_code, e.title AS element_title
    FROM lesson_plans lp
    JOIN subjects s ON s.id = lp.subject_id
    JOIN elements e ON e.id = lp.element_id
    WHERE " . implode(' AND ', $where) . "
    ORDER BY lp.created_at DESC
");
$stmt->execute($params);
$plans = $stmt->fetchAll();

$subjects = scopedSubjects($db);

include __DIR__ . '/includes/header.php';
?>

<div class="page-header">
    <div class="page-header-left">
        <h1 class="page-title">Saved Lesson Plans</h1>
        <p class="page-subtitle">All generated lesson plans. Filter, view, print, or delete.</p>
    </div>
    <div class="page-header-actions">
        <a href="generate.php" class="btn btn-primary"><i class="bi bi-magic"></i> Generate New</a>
    </div>
</div>

<?php if (isset($_GET['msg']) && $_GET['msg'] === 'deleted'): ?>
<div class="alert alert-success"><i class="bi bi-check-circle-fill"></i><div class="alert-body">Lesson plan deleted successfully.</div></div>
<?php endif; ?>

<!-- Filter Bar -->
<div class="filter-bar">
    <form method="get" style="display:contents">
        <div class="filter-group">
            <label>Subject</label>
            <select name="subject_id" class="form-control">
                <option value="">All Subjects</option>
                <?php foreach ($subjects as $s): ?>
                <option value="<?= $s['id'] ?>" <?= $filterSubject==$s['id']?'selected':'' ?>>
                    <?= htmlspecialchars($s['name']) ?>
                </option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="filter-group" style="max-width:120px">
            <label>Form</label>
            <input type="text" name="form" class="form-control" value="<?= htmlspecialchars($filterForm) ?>" placeholder="e.g. 1">
        </div>
        <div class="filter-group" style="max-width:120px">
            <label>Stream</label>
            <select name="class_stream" class="form-control">
                <option value="">All</option>
                <option value="A" <?= $filterStream==='A'?'selected':'' ?>>A</option>
                <option value="B" <?= $filterStream==='B'?'selected':'' ?>>B</option>
            </select>
        </div>
        <div class="filter-group">
            <label>Teacher Name</label>
            <input type="text" name="teacher" class="form-control" value="<?= htmlspecialchars($filterTeacher) ?>" placeholder="Search...">
        </div>
        <button type="submit" class="btn btn-primary" style="flex-shrink:0;align-self:flex-end"><i class="bi bi-search"></i> Filter</button>
        <a href="lesson_plans.php" class="btn btn-outline" style="flex-shrink:0;align-self:flex-end">Clear</a>
    </form>
</div>

<div class="card">
    <?php if (empty($plans)): ?>
    <div class="empty-state">
        <i class="bi bi-file-earmark-x"></i>
        <div class="empty-state-title">No lesson plans found</div>
        <div class="empty-state-text"><?= ($filterSubject || $filterForm || $filterTeacher) ? 'No results match your filters.' : 'Generate your first lesson plan to see it here.' ?></div>
        <?php if (!$filterSubject && !$filterForm && !$filterTeacher): ?>
        <a href="generate.php" class="btn btn-primary"><i class="bi bi-magic"></i> Generate Now</a>
        <?php endif; ?>
    </div>
    <?php else: ?>
    <table class="data-table">
        <thead>
            <tr>
                <th>#</th>
                <th>Subject</th>
                <th>Form</th>
                <th>Stream</th>
                <th>Element (Learning Activity)</th>
                <th>Teacher</th>
                <th>School</th>
                <th>Date</th>
                <th>Present</th>
                <th style="width:100px">Actions</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($plans as $i => $p): ?>
            <tr>
                <td class="text-muted"><?= $i + 1 ?></td>
                <td>
                    <span class="badge badge-blue"><?= htmlspecialchars($p['subject_code']) ?></span>
                    <div style="font-size:11px;color:#9ca3af;margin-top:2px"><?= htmlspecialchars($p['subject_name']) ?></div>
                </td>
                <td class="text-muted"><?= htmlspecialchars($p['form']) ?></td>
                <td class="text-muted"><?= htmlspecialchars($p['class_stream'] ?: '—') ?></td>
                <td>
                    <span style="font-size:12px;font-weight:600"><?= htmlspecialchars($p['element_code']) ?></span>
                    <div style="font-size:11.5px;color:#6b7280"><?= htmlspecialchars(substr($p['element_title'],0,55)) ?><?= strlen($p['element_title'])>55?'…':'' ?></div>
                </td>
                <td style="font-size:13px"><?= htmlspecialchars($p['teacher_name']) ?></td>
                <td style="font-size:12.5px;color:#6b7280"><?= htmlspecialchars($p['school_name']) ?></td>
                <td style="font-size:12px;white-space:nowrap"><?= $p['lesson_date'] ? date('d M Y', strtotime($p['lesson_date'])) : '—' ?></td>
                <td>
                    <span class="badge badge-gray" style="font-size:11px">G:<?= $p['girls_present'] ?> B:<?= $p['boys_present'] ?></span>
                </td>
                <td>
                    <div style="display:flex;gap:6px">
                        <a href="view_plan.php?id=<?= $p['id'] ?>" class="btn btn-outline-primary btn-sm btn-icon" title="View / Print">
                            <i class="bi bi-eye"></i>
                        </a>
                        <a href="download_pdf.php?id=<?= $p['id'] ?>" class="btn btn-outline-danger btn-sm btn-icon" title="Download PDF">
                            <i class="bi bi-file-pdf"></i>
                        </a>
                        <form method="post" class="d-inline" onsubmit="return confirm('Delete this lesson plan?')">
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="id" value="<?= $p['id'] ?>">
                            <button class="btn btn-outline-danger btn-sm btn-icon" title="Delete"><i class="bi bi-trash"></i></button>
                        </form>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <div class="card-footer"><?= count($plans) ?> plan(s) found</div>
    <?php endif; ?>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
