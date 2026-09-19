<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/vendor/autoload.php';
requireLogin();

use Dompdf\Dompdf;
use Dompdf\Options;

$sowId = (int)($_GET['id'] ?? 0);
if (!$sowId) { http_response_code(404); exit('No SOW ID'); }

$db = getDB();
$stmt = $db->prepare("
    SELECT sow.*, sub.name AS subject_name, sub.code AS subject_code
    FROM scheme_of_works sow
    JOIN subjects sub ON sub.id = sow.subject_id
    WHERE sow.id = ?
");
$stmt->execute([$sowId]);
$sow = $stmt->fetch();
if (!$sow) { http_response_code(404); exit('SOW not found'); }
if (!canAccessSubject((int)$sow['subject_id'])) { http_response_code(403); exit('Forbidden'); }

$sowData = json_decode($sow['sow_data'], true);
$modules = $sowData['modules'] ?? [];
$breaks = $sowData['breaks'] ?? [];

$h = fn($v) => htmlspecialchars($v ?? '');

$breakMap = [];
foreach ($breaks as $b) { $breakMap[$b['position']] = $b['label']; }

// Build table body HTML
$tbodyHtml = '';
if (isset($sowData['rows']) && is_array($sowData['rows'])) {
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

    foreach ($rows as $i => $row) {
        if (isset($breakMap[$i])) {
            $label = $h($breakMap[$i]);
            $tbodyHtml .= <<<ROW
        <tr>
            <td colspan="10" style="background:#fff9db;border:1pt solid #fde68a;text-align:center;padding:8px;font-weight:bold;font-size:11pt">{$label}</td>
        </tr>
ROW;
        }

        $mainCompHtml = '';
        if ($mainSpan[$i] > 0) {
            $mainCompHtml = '<td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;background:#f0f7ff" rowspan="' . $mainSpan[$i] . '">' . $h($row['main'] ?? '') . '</td>';
        }
        $specCompHtml = '';
        if ($specSpan[$i] > 0) {
            $specCompHtml = '<td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;background:#f0f7ff" rowspan="' . $specSpan[$i] . '">' . $h($row['spec'] ?? '') . '</td>';
        }

        $mainAct = $h($row['main_act'] ?? '');
        $specAct = $h($row['spec_act'] ?? '');
        $month = $h($row['month'] ?? '');
        $week = $h($row['week'] ?? '');
        $periods = $h($row['periods'] ?? '');
        $methods = $h($row['methods'] ?? '');
        $resources = $h($row['resources'] ?? '');
        $remarks = $h($row['remarks'] ?? '');

        $tbodyHtml .= <<<ROW
        <tr>
            {$mainCompHtml}
            {$specCompHtml}
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top">{$mainAct}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top">{$specAct}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;text-align:center">{$month}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;text-align:center">{$week}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;text-align:center">{$periods}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;font-size:10pt">{$methods}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;font-size:10pt">{$resources}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;font-size:10pt">{$remarks}</td>
        </tr>
ROW;
    }
} else {
$globalRow = 0;
foreach ($modules as $mi => $mod) {
    $rows = $mod['rows'] ?? [];
    $totalRows = count($rows);
    if ($totalRows === 0) continue;

    // Break row before module (if any)
    if ($mi > 0 && isset($breakMap[$mi])) {
        $label = $h($breakMap[$mi]);
        $tbodyHtml .= <<<ROW
        <tr>
            <td colspan="10" style="background:#fff9db;border:1pt solid #fde68a;text-align:center;padding:8px;font-weight:bold;font-size:11pt">{$label}</td>
        </tr>
ROW;
    }

    foreach ($rows as $ri => $row) {
        $isFirstInUnit = ($ri === 0 || $rows[$ri - 1]['unit_id'] !== $row['unit_id']);

        $mainCompHtml = '';
        if ($ri === 0) {
            $mainCompHtml = '<td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;background:#f0f7ff" rowspan="' . $totalRows . '">';
            $mainCompHtml .= '<strong>' . $h($mod['module_code']) . '</strong><br>';
            $mainCompHtml .= '<span style="font-size:10pt">' . $h($mod['module_title']) . '</span>';
            $mainCompHtml .= '</td>';
        }

        $specCompHtml = '';
        if ($isFirstInUnit) {
            $unitSpan = 1;
            for ($j = $ri + 1; $j < $totalRows; $j++) {
                if ($rows[$j]['unit_id'] === $row['unit_id']) $unitSpan++;
                else break;
            }
            $specCompHtml = '<td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;background:#f0f7ff" rowspan="' . $unitSpan . '">';
            $specCompHtml .= '<strong>' . $h($row['unit_code']) . '</strong><br>';
            $specCompHtml .= '<span style="font-size:10pt">' . $h($row['unit_title']) . '</span>';
            $specCompHtml .= '</td>';
        }

        $mainAct = $h($row['unit_title']);
        $specAct = $h($row['element_code'] . ' ' . $row['element_title']);
        $month = $h($row['month'] ?? '');
        $week = $h($row['week'] ?? '');
        $periods = $h($row['periods'] ?? '');
        $methods = $h($row['methods'] ?? '');
        $resources = $h($row['resources'] ?? '');
        $remarks = $h($row['remarks'] ?? '');

        $tbodyHtml .= <<<ROW
        <tr>
            {$mainCompHtml}
            {$specCompHtml}
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top">{$mainAct}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top">{$specAct}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;text-align:center">{$month}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;text-align:center">{$week}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;text-align:center">{$periods}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;font-size:10pt">{$methods}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;font-size:10pt">{$resources}</td>
            <td style="border:1pt solid #000;padding:4px 6px;vertical-align:top;font-size:10pt">{$remarks}</td>
        </tr>
        ROW;
    }
}
}

$school = $h($sow['school_name'] ?: '___________________');
$teacher = $h($sow['teacher_name'] ?: '___________________');
$subject = $h($sow['subject_name']);
$class = $h(trim('Form ' . ($sow['form'] ?? '') . ($sow['class_stream'] ? ' ' . $sow['class_stream'] : '')));
$year = $h($sow['year']);
$term = $h($sow['term']);

$html = <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 10pt;
    color: #000;
    padding: 16px 20px;
    line-height: 1.4;
  }

  .doc-title {
    text-align: center;
    font-size: 18pt;
    font-weight: bold;
    text-decoration: underline;
    margin-bottom: 12px;
    letter-spacing: 1pt;
  }

  .info-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
  }
  .info-table td {
    border: none;
    padding: 2px 4px;
    font-size: 10pt;
    vertical-align: top;
  }
  .info-lbl { font-weight: bold; white-space: nowrap; width: 18%; }

  table.process-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    page-break-inside: auto;
  }
  table.process-table thead { display: table-header-group; }
  table.process-table tr { page-break-inside: avoid; }
  table.process-table th {
    background: #2E86C1 !important;
    color: white !important;
    padding: 5px 4px;
    border: 1pt solid #000;
    text-align: center;
    font-weight: bold;
    font-size: 8pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table.process-table td {
    border: 1pt solid #000;
    padding: 3px 5px;
    vertical-align: top;
  }
</style>
</head>
<body>

<div class="doc-title">SCHEME OF WORK</div>

<table class="info-table">
  <tr>
    <td class="info-lbl">Name of School:</td>
    <td>{$school}</td>
    <td class="info-lbl">Teacher's Name:</td>
    <td>{$teacher}</td>
  </tr>
  <tr>
    <td class="info-lbl">Subject:</td>
    <td>{$subject}</td>
    <td class="info-lbl">Class:</td>
    <td>{$class}</td>
  </tr>
  <tr>
    <td class="info-lbl">Year:</td>
    <td>{$year}</td>
    <td class="info-lbl">Term:</td>
    <td>{$term}</td>
  </tr>
</table>

<table class="process-table">
  <thead>
    <tr>
      <th style="width:14%">Main<br>Competence</th>
      <th style="width:14%">Specific<br>Competence</th>
      <th style="width:12%">Main Learning<br>Activities</th>
      <th style="width:12%">Specific Learning<br>Activities</th>
      <th style="width:6%">Month</th>
      <th style="width:5%">Week</th>
      <th style="width:5%">Periods</th>
      <th style="width:11%">Methods</th>
      <th style="width:11%">Resources</th>
      <th style="width:10%">Remarks</th>
    </tr>
  </thead>
  <tbody>
    {$tbodyHtml}
  </tbody>
</table>

</body>
</html>
HTML;

$options = new Options();
$options->set('defaultFont', 'Times');
$options->set('isRemoteEnabled', false);
$options->set('isHtml5ParserEnabled', true);

$dompdf = new Dompdf($options);
$dompdf->loadHtml($html, 'UTF-8');
$dompdf->setPaper('A4', 'landscape');
$dompdf->render();

$filename = 'scheme_of_work_' . $sowId . '.pdf';
$dompdf->stream($filename, ['Attachment' => false]);
