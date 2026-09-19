<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireLogin();
$pageTitle = 'Download Center';
$db = getDB();

$filterForm    = trim($_GET['form']       ?? '');
$filterSubject = (int)($_GET['subject_id'] ?? 0);
if ($filterSubject && !canAccessSubject($filterSubject)) $filterSubject = 0;

$subjects = scopedSubjects($db);
$ids = allowedSubjectIds();
$scopeClause = empty($ids) ? '' : ' AND lp.subject_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';

// Load curriculum tree if filters are set
$modules = [];
if ($filterSubject && $filterForm) {
    $stmt = $db->prepare("
        SELECT m.id AS module_id, m.code AS m_code, m.title AS m_title, m.form AS m_form,
               u.id AS unit_id, u.code AS u_code, u.title AS u_title,
               e.id AS element_id, e.code AS e_code, e.title AS e_title
        FROM modules m
        JOIN syllabuses sy ON sy.id = m.syllabus_id
        JOIN units u ON u.module_id = m.id
        JOIN elements e ON e.unit_id = u.id
        WHERE sy.subject_id = ? AND m.form = ?
        ORDER BY m.code, u.code, e.code
    ");
    $stmt->execute([$filterSubject, $filterForm]);
    $rows = $stmt->fetchAll();

    // Count saved plans per element
    $planCounts = [];
    if ($rows) {
        $eids = array_unique(array_column($rows, 'element_id'));
        $in   = implode(',', array_fill(0, count($eids), '?'));
        $pc   = $db->prepare("SELECT element_id, COUNT(*) AS cnt FROM lesson_plans WHERE element_id IN ($in) GROUP BY element_id");
        $pc->execute($eids);
        foreach ($pc->fetchAll() as $r) $planCounts[$r['element_id']] = (int)$r['cnt'];
    }

    // Build nested structure
    foreach ($rows as $row) {
        $mid = $row['module_id'];
        $uid = $row['unit_id'];
        if (!isset($modules[$mid])) {
            $modules[$mid] = ['code'=>$row['m_code'],'title'=>$row['m_title'],'form'=>$row['m_form'],'units'=>[]];
        }
        if (!isset($modules[$mid]['units'][$uid])) {
            $modules[$mid]['units'][$uid] = ['code'=>$row['u_code'],'title'=>$row['u_title'],'elements'=>[]];
        }
        $modules[$mid]['units'][$uid]['elements'][] = [
            'id'    => $row['element_id'],
            'code'  => $row['e_code'],
            'title' => $row['e_title'],
            'plans' => $planCounts[$row['element_id']] ?? 0,
        ];
    }
}

// Totals for summary cards
$totalPlansStmt = empty($ids)
    ? $db->query("SELECT COUNT(*) FROM lesson_plans")
    : $db->prepare("SELECT COUNT(*) FROM lesson_plans lp WHERE lp.subject_id IN (" . implode(',', array_fill(0, count($ids), '?')) . ")");
if (empty($ids)) { $totalPlans = (int)$totalPlansStmt->fetchColumn(); } else { $totalPlansStmt->execute($ids); $totalPlans = (int)$totalPlansStmt->fetchColumn(); }
$totalModules= (int)$db->query("SELECT COUNT(DISTINCT m.id) FROM modules m JOIN lesson_plans lp ON lp.element_id IN (SELECT e.id FROM elements e JOIN units u ON u.id=e.unit_id WHERE u.module_id=m.id)")->fetchColumn();

include __DIR__ . '/includes/header.php';
?>

<div class="page-header">
    <div class="page-header-left">
        <h1 class="page-title">Download Center</h1>
        <p class="page-subtitle">Browse curriculum by class, download single or bulk PDF lesson plans.</p>
    </div>
</div>

<!-- ── Summary cards ── -->
<div class="stat-cards-grid">
    <?php
    $forms = ['I','II','III','IV'];
    foreach ($forms as $f):
        $stmt2 = $db->prepare("SELECT COUNT(*) FROM lesson_plans lp WHERE lp.form=?$scopeClause");
        $params2 = [$f];
        if (!empty($ids)) array_push($params2, ...$ids);
        $stmt2->execute($params2);
        $cnt = (int)$stmt2->fetchColumn();
    ?>
    <a href="?form=<?= $f ?>&subject_id=<?= $filterSubject ?>"
       class="stat-card <?= $filterForm===$f ? 'c-blue' : 'c-gray' ?>"
       style="text-decoration:none">
        <div class="stat-card-icon"><i class="bi bi-journal-bookmark"></i></div>
        <div class="stat-card-value"><?= $cnt ?></div>
        <div class="stat-card-label">Form <?= $f ?> Plans</div>
    </a>
    <?php endforeach; ?>
</div>

<!-- ── Filters ── -->
<div class="filter-bar" style="margin-bottom:20px">
    <form method="get" style="display:contents">
        <div class="filter-group" style="max-width:160px">
            <label>Class (Form)</label>
            <select name="form" class="form-control" onchange="this.form.submit()">
                <option value="">— All Forms —</option>
                <?php foreach (['I','II','III','IV'] as $f): ?>
                <option value="<?= $f ?>" <?= $filterForm===$f?'selected':'' ?>>Form <?= $f ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="filter-group">
            <label>Subject</label>
            <select name="subject_id" class="form-control" onchange="this.form.submit()">
                <option value="">— Choose subject —</option>
                <?php foreach ($subjects as $s): ?>
                <option value="<?= $s['id'] ?>" <?= $filterSubject==$s['id']?'selected':'' ?>>
                    <?= htmlspecialchars($s['name']) ?> (<?= $s['code'] ?>)
                </option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php if ($filterForm && $filterSubject): ?>
        <a href="exports.php" class="btn btn-outline" style="align-self:flex-end">Clear</a>
        <?php endif; ?>
    </form>
</div>

<?php if (!$filterForm || !$filterSubject): ?>
<!-- ── Prompt ── -->
<div class="card" style="text-align:center;padding:60px 20px">
    <i class="bi bi-funnel" style="font-size:52px;color:#d1d5db;display:block;margin-bottom:16px"></i>
    <h4 style="color:#374151;margin-bottom:8px">Select a Class and Subject</h4>
    <p style="color:#6b7280;font-size:13.5px;max-width:380px;margin:0 auto">
        Choose a form and subject above to browse the curriculum and download lesson plans.
    </p>
</div>

<?php elseif (empty($modules)): ?>
<div class="card" style="text-align:center;padding:60px 20px">
    <i class="bi bi-inbox" style="font-size:52px;color:#d1d5db;display:block;margin-bottom:16px"></i>
    <h4 style="color:#374151;margin-bottom:8px">No Content Found</h4>
    <p style="color:#6b7280;font-size:13.5px">No curriculum content found for this form and subject combination.</p>
</div>

<?php else: ?>
<!-- ── Curriculum tree ── -->
<?php
$subjectName = '';
foreach ($subjects as $s) { if ($s['id']===$filterSubject) $subjectName = $s['name']; }
?>
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h3 style="font-size:15px;font-weight:700;color:#111827;margin:0">
        <span style="background:#eff6ff;color:#1d4ed8;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;margin-right:8px">Form <?= htmlspecialchars($filterForm) ?></span>
        <?= htmlspecialchars($subjectName) ?>
    </h3>
    <?php
    // Total plans for this subject+form combo
    $totalCombo = 0;
    foreach ($modules as $m) { foreach ($m['units'] as $u) { foreach ($u['elements'] as $e) { $totalCombo += $e['plans']; }}}
    ?>
    <?php if ($totalCombo > 0): ?>
    <a href="bulk_pdf.php?subject_id=<?= $filterSubject ?>&form=<?= urlencode($filterForm) ?>"
       class="btn btn-primary" target="_blank">
        <i class="bi bi-file-earmark-arrow-down"></i> Download All <?= $totalCombo ?> Plans (Full Class)
    </a>
    <?php endif; ?>
</div>

<?php foreach ($modules as $mid => $module):
    $modulePlans = 0;
    foreach ($module['units'] as $u) foreach ($u['elements'] as $e) $modulePlans += $e['plans'];
?>
<div class="card" style="margin-bottom:16px;overflow:visible">
    <!-- Module header -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#1e3a5f;border-radius:12px 12px 0 0">
        <div>
            <span style="color:rgba(255,255,255,0.6);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Main Competence</span>
            <div style="color:#fff;font-weight:700;font-size:14px;margin-top:2px">
                <?= htmlspecialchars($module['code'].' — '.$module['title']) ?>
            </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
            <span style="background:rgba(255,255,255,0.15);color:#fff;padding:3px 10px;border-radius:6px;font-size:12px">
                <?= $modulePlans ?> plan<?= $modulePlans!=1?'s':'' ?>
            </span>
            <?php if ($modulePlans > 0): ?>
            <a href="bulk_pdf.php?module_id=<?= $mid ?>" target="_blank"
               class="btn btn-sm" style="background:#fff;color:#1e3a5f;font-weight:600">
                <i class="bi bi-file-earmark-arrow-down"></i> Download All
            </a>
            <?php endif; ?>
        </div>
    </div>

    <!-- Units -->
    <?php foreach ($module['units'] as $uid => $unit):
        $unitPlans = array_sum(array_column($unit['elements'], 'plans'));
    ?>
    <div style="border-bottom:1px solid #f3f4f6">
        <!-- Unit row -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px;background:#f8fafc">
            <div>
                <span style="color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Specific Competence / Topic</span>
                <div style="font-weight:600;font-size:13px;color:#374151;margin-top:1px">
                    <?= htmlspecialchars($unit['code'].' — '.$unit['title']) ?>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                <span style="background:#e5e7eb;color:#374151;padding:2px 8px;border-radius:5px;font-size:12px">
                    <?= $unitPlans ?> plan<?= $unitPlans!=1?'s':'' ?>
                </span>
                <?php if ($unitPlans > 0): ?>
                <a href="bulk_pdf.php?unit_id=<?= $uid ?>" target="_blank"
                   class="btn btn-sm btn-outline-primary">
                    <i class="bi bi-file-earmark-arrow-down"></i> Download
                </a>
                <?php endif; ?>
                <a href="generate.php?element_id=<?= $unit['elements'][0]['id'] ?>"
                   class="btn btn-sm btn-outline" title="Generate plan for first element">
                    <i class="bi bi-magic"></i> Generate
                </a>
            </div>
        </div>

        <!-- Elements -->
        <?php foreach ($unit['elements'] as $el): ?>
        <div style="display:flex;align-items:center;padding:8px 18px 8px 32px;border-top:1px solid #f3f4f6">
            <div style="flex:1">
                <span style="font-size:11.5px;font-weight:600;color:#6b7280"><?= htmlspecialchars($el['code']) ?></span>
                <span style="font-size:12.5px;color:#374151;margin-left:6px"><?= htmlspecialchars($el['title']) ?></span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                <?php if ($el['plans'] > 0): ?>
                <span style="background:#ecfdf5;color:#065f46;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600">
                    <i class="bi bi-check-circle-fill"></i> <?= $el['plans'] ?> plan<?= $el['plans']!=1?'s':'' ?>
                </span>
                <a href="bulk_pdf.php?element_id=<?= $el['id'] ?>" target="_blank"
                   class="btn btn-sm btn-outline-danger" style="font-size:11px;padding:3px 8px">
                    <i class="bi bi-file-pdf"></i> PDF
                </a>
                <?php else: ?>
                <span style="background:#f3f4f6;color:#9ca3af;padding:2px 8px;border-radius:5px;font-size:11px">
                    No plan
                </span>
                <?php endif; ?>
                <a href="generate.php?element_id=<?= $el['id'] ?>"
                   class="btn btn-sm btn-outline" style="font-size:11px;padding:3px 8px">
                    <i class="bi bi-magic"></i> Generate
                </a>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
    <?php endforeach; ?>
</div>
<?php endforeach; ?>
<?php endif; ?>

<?php include __DIR__ . '/includes/footer.php'; ?>
