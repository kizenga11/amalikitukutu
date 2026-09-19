<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/plan_helpers.php';
requireLogin();

$action = $_GET['action'] ?? '';
$db = getDB();

if ($action === 'plan_preview') {
    $elementId = (int)($_GET['element_id'] ?? 0);
    $data = loadElementData($db, $elementId);
    if (!$data || !canAccessSubject((int)$data['subject_id'])) {
        echo '<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i><div>Element not found or has no data.</div></div>';
        exit;
    }
    $prefill = ['class_stream' => teacherClassStream($db, (int)$data['subject_id'], $data['form'] ?? '')];
    renderPlanForm($data, $prefill);
    exit;
}

// Quick diagnostic — open in browser: /amalikitukutu/ajax.php?action=check
if ($action === 'check') {
    header('Content-Type: application/json');
    echo json_encode([
        'subjects'   => (int)$db->query("SELECT COUNT(*) FROM subjects")->fetchColumn(),
        'syllabuses' => (int)$db->query("SELECT COUNT(*) FROM syllabuses")->fetchColumn(),
        'modules'    => (int)$db->query("SELECT COUNT(*) FROM modules")->fetchColumn(),
        'units'      => (int)$db->query("SELECT COUNT(*) FROM units")->fetchColumn(),
        'elements'   => (int)$db->query("SELECT COUNT(*) FROM elements")->fetchColumn(),
        'elem_methods' => (int)$db->query("SELECT COUNT(*) FROM element_methods")->fetchColumn(),
    ]);
    exit;
}

header('Content-Type: application/json');

switch ($action) {
    case 'syllabuses':
        $id = (int)($_GET['subject_id'] ?? 0);
        if (!canAccessSubject($id)) { echo json_encode([]); break; }
        $st = $db->prepare("SELECT id, CONCAT(title, IF(form_range IS NOT NULL AND form_range != '', CONCAT(' (', form_range, ')'), '')) AS label FROM syllabuses WHERE subject_id=? ORDER BY title");
        $st->execute([$id]);
        echo json_encode($st->fetchAll());
        break;
    case 'modules':
        $id   = (int)($_GET['syllabus_id'] ?? 0);
        $form = trim($_GET['form'] ?? '');
        if (!canAccessSubject(subjectIdOf($db, 'syllabuses', $id))) { echo json_encode([]); break; }
        if ($form) {
            $st = $db->prepare("SELECT id, CONCAT(code,' — ',title) AS label FROM modules WHERE syllabus_id=? AND form=? ORDER BY code");
            $st->execute([$id, $form]);
        } else {
            $st = $db->prepare("SELECT id, CONCAT(code,' — ',title) AS label FROM modules WHERE syllabus_id=? ORDER BY code");
            $st->execute([$id]);
        }
        echo json_encode($st->fetchAll());
        break;
    case 'units':
        $id = (int)($_GET['module_id'] ?? 0);
        if (!canAccessSubject(subjectIdOf($db, 'modules', $id))) { echo json_encode([]); break; }
        $st = $db->prepare("SELECT id, CONCAT(code,' — ',title) AS label FROM units WHERE module_id=? ORDER BY code");
        $st->execute([$id]);
        echo json_encode($st->fetchAll());
        break;
    case 'sow_data':
        $sid = (int)($_GET['syllabus_id'] ?? 0);
        $form = trim($_GET['form'] ?? '');
        $data = ['modules' => []];
        if ($sid && $form && canAccessSubject(subjectIdOf($db, 'syllabuses', $sid))) {
            $mods = $db->prepare("SELECT id, code, title FROM modules WHERE syllabus_id=? AND form=? ORDER BY code");
            $mods->execute([$sid, $form]);
            foreach ($mods->fetchAll() as $m) {
                $units = $db->prepare("SELECT id, code, title FROM units WHERE module_id=? ORDER BY code");
                $units->execute([$m['id']]);
                $moduleRows = [];
                foreach ($units->fetchAll() as $u) {
                    $elems = $db->prepare("
                        SELECT e.id, e.code, e.title,
                               GROUP_CONCAT(DISTINCT tm.name SEPARATOR ', ') AS methods,
                               GROUP_CONCAT(DISTINCT r.name SEPARATOR ', ') AS resources
                        FROM elements e
                        LEFT JOIN element_methods em ON em.element_id = e.id
                        LEFT JOIN teaching_methods tm ON tm.id = em.method_id
                        LEFT JOIN element_resources er ON er.element_id = e.id
                        LEFT JOIN resources r ON r.id = er.resource_id
                        WHERE e.unit_id = ?
                        GROUP BY e.id ORDER BY e.code
                    ");
                    $elems->execute([$u['id']]);
                    foreach ($elems->fetchAll() as $el) {
                        $moduleRows[] = [
                            'unit_id' => $u['id'],
                            'unit_code' => $u['code'],
                            'unit_title' => $u['title'],
                            'element_id' => $el['id'],
                            'element_code' => $el['code'],
                            'element_title' => $el['title'],
                            'methods' => $el['methods'],
                            'resources' => $el['resources'],
                        ];
                    }
                }
                if (!empty($moduleRows)) {
                    $data['modules'][] = [
                        'module_id' => $m['id'],
                        'module_code' => $m['code'],
                        'module_title' => $m['title'],
                        'rows' => $moduleRows,
                    ];
                }
            }
        }
        echo json_encode($data);
        break;
    case 'elements':
        $id = (int)($_GET['unit_id'] ?? 0);
        if (!canAccessSubject(subjectIdOf($db, 'units', $id))) { echo json_encode([]); break; }
        $st = $db->prepare("SELECT id, CONCAT(code,' ',title) AS label FROM elements WHERE unit_id=? ORDER BY code");
        $st->execute([$id]);
        echo json_encode($st->fetchAll());
        break;
    default:
        echo json_encode([]);
}
