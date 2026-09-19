<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
requireLogin();
$db = getDB();

$sowId = (int)($_GET['id'] ?? 0);
if (!$sowId) { header("Location: scheme_of_works.php"); exit; }

$stmt = $db->prepare("
    SELECT sow.*, sub.name AS subject_name, sub.code AS subject_code
    FROM scheme_of_works sow
    JOIN subjects sub ON sub.id = sow.subject_id
    WHERE sow.id = ?
");
$stmt->execute([$sowId]);
$sow = $stmt->fetch();

if (!$sow) { header("Location: scheme_of_works.php"); exit; }
if (!canAccessSubject((int)$sow['subject_id'])) { header("Location: scheme_of_works.php"); exit; }

$sowData = json_decode($sow['sow_data'], true);
$modules = $sowData['modules'] ?? [];
$breaks = $sowData['breaks'] ?? [];

$breakMap = [];
foreach ($breaks as $b) { $breakMap[$b['position']] = $b['label']; }

$pageTitle = 'View Scheme of Work';
$h = fn($v) => htmlspecialchars($v ?? '');

include __DIR__ . '/includes/header.php';
?>

<div class="doc-toolbar no-print">
    <div class="doc-toolbar-left">
        <a href="scheme_of_works.php" class="btn btn-outline"><i class="bi bi-arrow-left"></i> All SOWs</a>
        <span class="doc-toolbar-title"><?= $h($sow['title'] ?: 'Scheme of Work') ?></span>
    </div>
    <div class="doc-toolbar-right">
        <button type="button" class="btn btn-outline" data-edit-toggle data-editing="1" onclick="togglePlanEditing(this)">
            <i class="bi bi-lock-fill"></i> <span class="edit-toggle-label">Lock Editing</span>
        </button>
        <button type="button" class="btn btn-primary" onclick="saveDocAsPDF()"><i class="bi bi-file-pdf"></i> Save as PDF</button>
        <button onclick="window.print()" class="btn btn-outline"><i class="bi bi-printer"></i> Print</button>
    </div>
</div>

<div class="edit-note" data-edit-note>
    <i class="bi bi-pencil-square"></i>
    <span>Editing is ON — click any cell to change it. Changes appear only here / in print &amp; PDF and are <strong>never saved</strong> to the database.</span>
</div>

<div class="plan-document" style="max-width:1200px">
    <div class="vp-title">SCHEME OF WORK</div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
        <tr>
            <td style="font-weight:bold;padding:3px 4px;width:18%">Name of School:</td>
            <td style="padding:3px 4px;width:32%"><span class="editable-cell" contenteditable="true"><?= $h($sow['school_name'] ?: '___________________') ?></span></td>
            <td style="font-weight:bold;padding:3px 4px;width:18%">Teacher's Name:</td>
            <td style="padding:3px 4px;width:32%"><span class="editable-cell" contenteditable="true"><?= $h($sow['teacher_name'] ?: '___________________') ?></span></td>
        </tr>
        <tr>
            <td style="font-weight:bold;padding:3px 4px">Subject:</td>
            <td style="padding:3px 4px"><span class="editable-cell" contenteditable="true"><?= $h($sow['subject_name']) ?></span></td>
            <td style="font-weight:bold;padding:3px 4px">Class:</td>
            <td style="padding:3px 4px"><span class="editable-cell" contenteditable="true"><?= $h(trim('Form ' . ($sow['form'] ?? '') . ($sow['class_stream'] ? ' ' . $sow['class_stream'] : ''))) ?></span></td>
        </tr>
        <tr>
            <td style="font-weight:bold;padding:3px 4px">Year:</td>
            <td style="padding:3px 4px"><span class="editable-cell" contenteditable="true"><?= $h($sow['year']) ?></span></td>
            <td style="font-weight:bold;padding:3px 4px">Term:</td>
            <td style="padding:3px 4px"><span class="editable-cell" contenteditable="true"><?= $h($sow['term']) ?></span></td>
        </tr>
    </table>

    <table class="vp-process-table" style="font-size:11px">
        <thead>
            <tr style="background:#2E86C1;color:white">
                <th style="background:#2E86C1;color:white;padding:6px;border:1px solid #000">Main Competence</th>
                <th style="background:#2E86C1;color:white;padding:6px;border:1px solid #000">Specific Competence</th>
                <th style="background:#2E86C1;color:white;padding:6px;border:1px solid #000">Main Learning Activities</th>
                <th style="background:#2E86C1;color:white;padding:6px;border:1px solid #000">Specific Learning Activities</th>
                <th style="background:#2E86C1;color:white;padding:6px;border:1px solid #000">Month</th>
                <th style="background:#2E86C1;color:white;padding:6px;border:1px solid #000">Week</th>
                <th style="background:#2E86C1;color:white;padding:6px;border:1px solid #000">Periods</th>
                <th style="background:#2E86C1;color:white;padding:6px;border:1px solid #000">Methods</th>
                <th style="background:#2E86C1;color:white;padding:6px;border:1px solid #000">Resources</th>
                <th style="background:#2E86C1;color:white;padding:6px;border:1px solid #000">Remarks</th>
            </tr>
        </thead>
        <tbody>
            <?php if (isset($sowData['rows']) && is_array($sowData['rows'])): ?>
            <?php
                $rows = $sowData['rows'];
                $totalRows = count($rows);
                $mainSpan = []; $specSpan = [];
                for ($i = 0; $i < $totalRows; $i++) {
                    $mainStart = ($i === 0 || ($rows[$i]['main'] ?? '') !== ($rows[$i-1]['main'] ?? ''));
                    if ($mainStart) {
                        $mainSpan[$i] = 1;
                        for ($j = $i + 1; $j < $totalRows; $j++) {
                            if (($rows[$j]['main'] ?? '') === ($rows[$i]['main'] ?? '')) $mainSpan[$i]++;
                            else break;
                        }
                    } else { $mainSpan[$i] = 0; }
                    $specStart = ($i === 0 || ($rows[$i]['spec'] ?? '') !== ($rows[$i-1]['spec'] ?? ''));
                    if ($specStart) {
                        $specSpan[$i] = 1;
                        for ($j = $i + 1; $j < $totalRows; $j++) {
                            if (($rows[$j]['spec'] ?? '') === ($rows[$i]['spec'] ?? '')) $specSpan[$i]++;
                            else break;
                        }
                    } else { $specSpan[$i] = 0; }
                }
            ?>
            <?php foreach ($rows as $i => $row): ?>
                <?php if (isset($breakMap[$i])): ?>
                <tr>
                    <td colspan="10" style="background:#fff9db;border:1px solid #fde68a;text-align:center;padding:8px;font-weight:bold;font-size:12px">
                        <?= $h($breakMap[$i]) ?>
                    </td>
                </tr>
                <?php endif; ?>
                <tr>
                    <?php if ($mainSpan[$i] > 0): ?>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;background:#f0f7ff" rowspan="<?= $mainSpan[$i] ?>" class="editable-cell" contenteditable="true"><?= $h($row['main'] ?? '') ?></td>
                    <?php endif; ?>
                    <?php if ($specSpan[$i] > 0): ?>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;background:#f0f7ff" rowspan="<?= $specSpan[$i] ?>" class="editable-cell" contenteditable="true"><?= $h($row['spec'] ?? '') ?></td>
                    <?php endif; ?>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top" class="editable-cell" contenteditable="true"><?= $h($row['main_act'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top" class="editable-cell" contenteditable="true"><?= $h($row['spec_act'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:center" class="editable-cell" contenteditable="true"><?= $h($row['month'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:center" class="editable-cell" contenteditable="true"><?= $h($row['week'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:center" class="editable-cell" contenteditable="true"><?= $h($row['periods'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;font-size:11px" class="editable-cell" contenteditable="true"><?= $h($row['methods'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;font-size:11px" class="editable-cell" contenteditable="true"><?= $h($row['resources'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;font-size:11px" class="editable-cell" contenteditable="true"><?= $h($row['remarks'] ?? '') ?></td>
                </tr>
            <?php endforeach; ?>
            <?php else: ?>
            <?php
            $globalRow = 0;
            foreach ($modules as $mi => $mod):
                $rows = $mod['rows'] ?? [];
                $totalRows = count($rows);
                if ($totalRows === 0) continue;

                if ($mi > 0 && isset($breakMap[$mi])): ?>
                <tr>
                    <td colspan="10" style="background:#fff9db;border:1px solid #fde68a;text-align:center;padding:8px;font-weight:bold;font-size:12px">
                        <?= $h($breakMap[$mi]) ?>
                    </td>
                </tr>
                <?php endif; ?>

                <?php foreach ($rows as $ri => $row):
                $isFirstInUnit = ($ri === 0 || $rows[$ri - 1]['unit_id'] !== $row['unit_id']);
                ?>
                <tr>
                    <?php if ($ri === 0): ?>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;background:#f0f7ff" rowspan="<?= $totalRows ?>" class="editable-cell" contenteditable="true">
                        <strong><?= $h($mod['module_code']) ?></strong><br>
                        <span style="font-size:11px"><?= $h($mod['module_title']) ?></span>
                    </td>
                    <?php endif; ?>

                    <?php if ($isFirstInUnit):
                        $unitSpan = 0;
                        for ($j = $ri; $j < $totalRows; $j++) {
                            if ($rows[$j]['unit_id'] === $row['unit_id']) $unitSpan++;
                            else break;
                        }
                    ?>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;background:#f0f7ff" rowspan="<?= $unitSpan ?>" class="editable-cell" contenteditable="true">
                        <strong><?= $h($row['unit_code']) ?></strong><br>
                        <span style="font-size:11px"><?= $h($row['unit_title']) ?></span>
                    </td>
                    <?php endif; ?>

                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top" class="editable-cell" contenteditable="true"><?= $h($row['unit_title']) ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top" class="editable-cell" contenteditable="true"><?= $h($row['element_code'] . ' ' . $row['element_title']) ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:center" class="editable-cell" contenteditable="true"><?= $h($row['month'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:center" class="editable-cell" contenteditable="true"><?= $h($row['week'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:center" class="editable-cell" contenteditable="true"><?= $h($row['periods'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;font-size:11px" class="editable-cell" contenteditable="true"><?= $h($row['methods'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;font-size:11px" class="editable-cell" contenteditable="true"><?= $h($row['resources'] ?? '') ?></td>
                    <td style="border:1px solid #000;padding:4px 6px;vertical-align:top;font-size:11px" class="editable-cell" contenteditable="true"><?= $h($row['remarks'] ?? '') ?></td>
                </tr>
                <?php endforeach; ?>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<div class="doc-bottom-bar no-print">
    <button type="button" class="btn btn-primary btn-lg" onclick="saveDocAsPDF()">
        <i class="bi bi-file-pdf"></i> Save as PDF
    </button>
    <button onclick="window.print()" class="btn btn-outline btn-lg">
        <i class="bi bi-printer"></i> Print
    </button>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
