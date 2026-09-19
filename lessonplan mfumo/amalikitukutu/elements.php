<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireAdmin();
$pageTitle = 'Elements (Learning Activities)';
$db = getDB();
$error = $success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'add') {
        $uid = (int)($_POST['unit_id']??0); $code = trim($_POST['code']??''); $title = trim($_POST['title']??'');
        if ($uid && $code && $title) {
            $db->prepare("INSERT INTO elements (unit_id,code,title) VALUES (?,?,?)")->execute([$uid,$code,$title]);
            $eid = $db->lastInsertId();
            foreach (['introduction','development','design','realisation'] as $stage) {
                $mid = (int)($_POST["method_$stage"]??0);
                if ($mid) {
                    $db->prepare("INSERT INTO element_methods (element_id,method_id,stage,teaching_activity,learning_activity,assessment_criteria) VALUES (?,?,?,?,?,?)")
                       ->execute([$eid,$mid,$stage,trim($_POST["teaching_$stage"]??''),trim($_POST["learning_$stage"]??''),trim($_POST["assessment_$stage"]??'')]);
                }
            }
            foreach ($_POST['resource_ids'] ?? [] as $rid) {
                $rid = (int)$rid;
                if ($rid) $db->prepare("INSERT IGNORE INTO element_resources (element_id,resource_id) VALUES (?,?)")->execute([$eid,$rid]);
            }
            $success = "Element \"$title\" saved with teaching stages and resources.";
        } else { $error = "Unit, code and title required."; }
    } elseif ($action === 'delete') {
        $db->prepare("DELETE FROM elements WHERE id=?")->execute([(int)$_POST['id']]);
        $success = "Element deleted.";
    }
}

$elements = $db->query("
    SELECT e.*, u.code AS unit_code, m.code AS module_code, s.name AS subject_name, s.code AS subject_code,
           COUNT(DISTINCT em.id) AS stage_count, COUNT(DISTINCT er.id) AS resource_count
    FROM elements e
    JOIN units u ON u.id=e.unit_id
    JOIN modules m ON m.id=u.module_id
    JOIN syllabuses sy ON sy.id=m.syllabus_id
    JOIN subjects s ON s.id=sy.subject_id
    LEFT JOIN element_methods em ON em.element_id=e.id
    LEFT JOIN element_resources er ON er.element_id=e.id
    GROUP BY e.id ORDER BY s.name, m.code, u.code, e.code
")->fetchAll();

$units     = $db->query("SELECT u.id, CONCAT(s.name,' — ',m.code,'.',u.code,' ',u.title) AS label FROM units u JOIN modules m ON m.id=u.module_id JOIN syllabuses sy ON sy.id=m.syllabus_id JOIN subjects s ON s.id=sy.subject_id ORDER BY s.name, m.code, u.code")->fetchAll();
$methods   = $db->query("SELECT id, name FROM teaching_methods ORDER BY name")->fetchAll();
$resources = $db->query("SELECT id, name FROM resources ORDER BY name")->fetchAll();

$stageLabels = ['introduction'=>['label'=>'Stage 1: Introduction','time'=>'5 min','color'=>'#3b82f6'],'development'=>['label'=>'Stage 2: Competence Development','time'=>'20 min','color'=>'#10b981'],'design'=>['label'=>'Stage 3: Design','time'=>'10 min','color'=>'#f59e0b'],'realisation'=>['label'=>'Stage 4: Realisation','time'=>'5 min','color'=>'#ef4444']];

include __DIR__ . '/includes/header.php';
?>
<div class="page-header">
    <div class="page-header-left">
        <h1 class="page-title">Elements <span style="font-weight:400;color:var(--text-muted);font-size:16px">(Learning Activities)</span></h1>
        <p class="page-subtitle">Each element = one 40-minute lesson plan. Define the 4 teaching stages here.</p>
    </div>
    <div class="page-header-actions no-print">
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addModal"><i class="bi bi-plus-lg"></i> Add Element</button>
    </div>
</div>
<?php if ($error): ?><div class="alert alert-danger"><i class="bi bi-x-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($error) ?></div></div><?php endif; ?>
<?php if ($success): ?><div class="alert alert-success"><i class="bi bi-check-circle-fill"></i><div class="alert-body"><?= htmlspecialchars($success) ?></div></div><?php endif; ?>

<div class="card">
    <?php if (empty($elements)): ?>
    <div class="empty-state"><i class="bi bi-list-task"></i><div class="empty-state-title">No elements yet</div><div class="empty-state-text">Elements are the leaf-level activities that generate lesson plans.</div><button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addModal"><i class="bi bi-plus-lg"></i> Add Element</button></div>
    <?php else: ?>
    <table class="data-table">
        <thead><tr><th>#</th><th>Subject</th><th>Unit</th><th>Code</th><th>Title (Learning Activity)</th><th>Stages</th><th>Resources</th><th style="width:110px">Actions</th></tr></thead>
        <tbody>
            <?php foreach ($elements as $i => $el): ?>
            <tr>
                <td class="text-muted"><?= $i+1 ?></td>
                <td><span class="badge badge-blue"><?= htmlspecialchars($el['subject_code']) ?></span></td>
                <td><span class="badge badge-gray"><?= htmlspecialchars($el['unit_code']) ?></span></td>
                <td><span class="badge badge-purple"><?= htmlspecialchars($el['code']) ?></span></td>
                <td style="font-size:13px"><?= htmlspecialchars(substr($el['title'],0,65)) ?><?= strlen($el['title'])>65?'…':'' ?></td>
                <td>
                    <?php if ($el['stage_count'] >= 4): ?>
                    <span class="badge badge-green"><i class="bi bi-check2"></i> Complete</span>
                    <?php elseif ($el['stage_count'] > 0): ?>
                    <span class="badge badge-orange"><?= $el['stage_count'] ?>/4 stages</span>
                    <?php else: ?>
                    <span class="badge badge-gray">No stages</span>
                    <?php endif; ?>
                </td>
                <td><span class="badge badge-gray"><?= $el['resource_count'] ?></span></td>
                <td>
                    <div style="display:flex;gap:6px">
                        <a href="generate.php?element_id=<?= $el['id'] ?>" class="btn btn-success btn-sm btn-icon" title="Generate Lesson Plan"><i class="bi bi-magic"></i></a>
                        <form method="post" class="d-inline" onsubmit="return confirm('Delete this element?')"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= $el['id'] ?>"><button class="btn btn-outline-danger btn-sm btn-icon" title="Delete"><i class="bi bi-trash"></i></button></form>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <div class="card-footer"><?= count($elements) ?> element(s) — click <i class="bi bi-magic"></i> on any row to generate a lesson plan</div>
    <?php endif; ?>
</div>

<!-- Add Modal -->
<div class="modal fade" id="addModal" tabindex="-1">
    <div class="modal-dialog" style="max-width:860px">
        <form method="post" class="modal-content">
            <input type="hidden" name="action" value="add">
            <div class="modal-header" style="background:#111827">
                <h5 class="modal-title" style="color:white"><i class="bi bi-list-task me-2"></i>Add Element with Teaching Stages</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" style="max-height:80vh;overflow-y:auto">

                <!-- Basic info -->
                <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:20px">
                    <div class="form-group">
                        <label class="form-label">Unit (Specific Competence)</label>
                        <select name="unit_id" class="form-select" required>
                            <option value="">— Select Unit —</option>
                            <?php foreach ($units as $u): ?><option value="<?= $u['id'] ?>"><?= htmlspecialchars($u['label']) ?></option><?php endforeach; ?>
                        </select>
                    </div>
                    <div class="form-row form-row-2">
                        <div class="form-group mb-0"><label class="form-label">Code</label><input type="text" name="code" class="form-control" placeholder="e.g. (a)" required></div>
                        <div class="form-group mb-0"><label class="form-label">Title (Learning Activity)</label><input type="text" name="title" class="form-control" required placeholder="e.g. Word processing basics"></div>
                    </div>
                </div>

                <!-- Resources -->
                <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:20px">
                    <div class="form-label" style="font-size:13px;font-weight:700;margin-bottom:10px"><i class="bi bi-tools me-1 text-primary"></i>Teaching &amp; Learning Resources</div>
                    <div class="check-grid-3">
                        <?php foreach ($resources as $r): ?>
                        <label class="form-check">
                            <input class="form-check-input" type="checkbox" name="resource_ids[]" value="<?= $r['id'] ?>">
                            <span class="form-check-label"><?= htmlspecialchars($r['name']) ?></span>
                        </label>
                        <?php endforeach; ?>
                    </div>
                </div>

                <!-- 4 stages -->
                <?php foreach ($stageLabels as $stage => $info): ?>
                <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:14px;border-left:4px solid <?= $info['color'] ?>">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                        <span style="font-size:13px;font-weight:700;color:<?= $info['color'] ?>"><?= $info['label'] ?></span>
                        <span style="background:<?= $info['color'] ?>;color:white;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600"><?= $info['time'] ?></span>
                    </div>
                    <div class="form-group" style="margin-bottom:10px">
                        <label class="form-label">Teaching Method</label>
                        <select name="method_<?= $stage ?>" class="form-select">
                            <option value="">— Select method —</option>
                            <?php foreach ($methods as $mt): ?><option value="<?= $mt['id'] ?>"><?= htmlspecialchars($mt['name']) ?></option><?php endforeach; ?>
                        </select>
                    </div>
                    <div class="form-row form-row-3">
                        <div class="form-group mb-0"><label class="form-label">Teaching Activity</label><textarea name="teaching_<?= $stage ?>" class="form-control" rows="3" placeholder="What the teacher does..."></textarea></div>
                        <div class="form-group mb-0"><label class="form-label">Learning Activity</label><textarea name="learning_<?= $stage ?>" class="form-control" rows="3" placeholder="What students do..."></textarea></div>
                        <div class="form-group mb-0"><label class="form-label">Assessment Criteria</label><textarea name="assessment_<?= $stage ?>" class="form-control" rows="3" placeholder="How competence is measured..."></textarea></div>
                    </div>
                </div>
                <?php endforeach; ?>

            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary"><i class="bi bi-save"></i> Save Element</button>
            </div>
        </form>
    </div>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
