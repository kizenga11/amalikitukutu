<?php
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/vendor/autoload.php';
requireLogin();

use Dompdf\Dompdf;
use Dompdf\Options;

$planId = (int)($_GET['id'] ?? 0);
if (!$planId) { http_response_code(404); exit('No plan ID'); }

$db = getDB();

$p = $db->prepare("
    SELECT lp.*, s.name AS subject_name, s.code AS subject_code,
           e.id AS element_id, e.code AS element_code, e.title AS element_title,
           u.code AS unit_code, u.title AS unit_title,
           m.code AS module_code, m.title AS module_title, m.form AS m_form,
           sy.title AS syllabus_title
    FROM lesson_plans lp
    JOIN subjects s ON s.id = lp.subject_id
    JOIN elements e ON e.id = lp.element_id
    JOIN units u ON u.id = e.unit_id
    JOIN modules m ON m.id = u.module_id
    JOIN syllabuses sy ON sy.id = m.syllabus_id
    WHERE lp.id = ?
");
$p->execute([$planId]);
$plan = $p->fetch();
if (!$plan) { http_response_code(404); exit('Plan not found'); }
if (!canAccessSubject((int)$plan['subject_id'])) { http_response_code(403); exit('Forbidden'); }

$stages = $db->prepare("
    SELECT em.*, tm.name AS method_name
    FROM element_methods em
    JOIN teaching_methods tm ON tm.id = em.method_id
    WHERE em.element_id = ?
    ORDER BY FIELD(em.stage,'introduction','development','design','realisation')
");
$stages->execute([$plan['element_id']]);
$stageRows = [];
foreach ($stages->fetchAll() as $row) { $stageRows[$row['stage']] = $row; }

$res = $db->prepare("SELECT r.name FROM element_resources er JOIN resources r ON r.id=er.resource_id WHERE er.element_id=?");
$res->execute([$plan['element_id']]);
$resources = array_column($res->fetchAll(), 'name');

$stageOrder  = ['introduction','development','design','realisation'];
$stageLabels = [
    'introduction' => 'Introduction',
    'development'  => 'Competence Development',
    'design'       => 'Design',
    'realisation'  => 'Realisation',
];
$stageDefaults = ['introduction'=>5,'development'=>20,'design'=>10,'realisation'=>5];

$h = fn($v) => htmlspecialchars($v ?? '');

$girlsReg  = (int)$plan['girls_registered'];
$boysReg   = (int)$plan['boys_registered'];
$totalReg  = $girlsReg + $boysReg;
$girlsPres = (int)$plan['girls_present'];
$boysPres  = (int)$plan['boys_present'];
$totalPres = $girlsPres + $boysPres;
$girlsAbs  = $girlsReg - $girlsPres;
$boysAbs   = $boysReg  - $boysPres;
$totalAbs  = $totalReg - $totalPres;
$lessonDate = $plan['lesson_date'] ? date('d-m-Y', strtotime($plan['lesson_date'])) : '';
$resourcesStr = $resources ? $h(implode(', ', $resources)) : '—';
$reference    = $h($plan['reference'] ?: ($plan['subject_name'] . ' Syllabus — ' . $plan['syllabus_title']));
$remarks      = nl2br($h($plan['remarks'] ?? ''));
$remarksLines = empty(trim($plan['remarks'] ?? ''))
    ? '<div class="remarks-line"></div><div class="remarks-line"></div><div class="remarks-line"></div>'
    : '';

// Build stage rows
$stageRowsHtml = '';
foreach ($stageOrder as $key) {
    $stage      = $stageRows[$key] ?? [];
    $mins       = !empty($stage['time_minutes']) ? (int)$stage['time_minutes'] : $stageDefaults[$key];
    $teaching   = nl2br($h($stage['teaching_activity']   ?? ''));
    $learning   = nl2br($h($stage['learning_activity']   ?? ''));
    $assessment = nl2br($h($stage['assessment_criteria'] ?? ''));
    $stageRowsHtml .= "
    <tr>
        <td class=\"stage-name\">{$stageLabels[$key]}</td>
        <td class=\"time-cell\">{$mins}</td>
        <td>{$teaching}</td>
        <td>{$learning}</td>
        <td>{$assessment}</td>
    </tr>";
}

$html = <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    color: #000;
    padding: 20px 24px;
    line-height: 1.5;
  }

  /* ── Title ── */
  .doc-title {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    text-decoration: underline;
    margin-bottom: 14px;
    letter-spacing: 1pt;
  }

  /* ── School info — borderless ── */
  .info-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
  }
  .info-table td {
    border: none;
    padding: 3px 4px;
    font-size: 11pt;
    vertical-align: top;
  }
  .info-lbl { font-weight: bold; white-space: nowrap; width: 18%; }
  .info-val { width: 32%; }

  /* ── Attendance table ── */
  .att-wrap { text-align: center; margin-bottom: 14px; }
  .att-table {
    border-collapse: collapse;
    margin: 0 auto;
  }
  .att-table th, .att-table td {
    border: 1pt solid #000;
    padding: 4px 16px;
    text-align: center;
    font-size: 11pt;
  }
  .att-table th { font-weight: bold; }

  /* ── Plain text info lines ── */
  .info-line {
    font-size: 11pt;
    margin-bottom: 8px;
    line-height: 1.5;
  }

  /* ── Section title ── */
  .section-title {
    text-align: center;
    font-size: 13pt;
    font-weight: bold;
    text-decoration: underline;
    margin: 16px 0 8px;
  }

  /* ── Process table ── */
  .process-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
  }
  .process-table th {
    border: 1pt solid #000;
    padding: 5px 6px;
    text-align: center;
    font-size: 10pt;
    font-weight: bold;
    vertical-align: middle;
  }
  .process-table td {
    border: 1pt solid #000;
    padding: 5px 6px;
    font-size: 10pt;
    vertical-align: top;
    line-height: 1.4;
  }
  .stage-name { font-weight: bold; width: 13%; vertical-align: middle; }
  .time-cell  { text-align: center; width: 7%; vertical-align: middle; }

  /* ── Remarks ── */
  .remarks {
    font-size: 11pt;
    margin-top: 8px;
    line-height: 1.5;
  }
  .remarks-line {
    border-bottom: 1pt solid #000;
    margin-top: 10px;
    height: 10pt;
    display: block;
  }
</style>
</head>
<body>

<!-- ══ TITLE ═══════════════════════════════════════════════════════════ -->
<div class="doc-title">LESSON PLAN</div>

<!-- ══ SCHOOL INFO — plain text ════════════════════════════════════════ -->
<table class="info-table">
  <tr>
    <td class="info-lbl">Name of School:</td>
    <td class="info-val">{$h($plan['school_name'])}</td>
    <td class="info-lbl">Teacher's Name:</td>
    <td>{$h($plan['teacher_name'])}</td>
  </tr>
  <tr>
    <td class="info-lbl">Form:</td>
    <td>{$h($plan['form'])}</td>
    <td class="info-lbl">Class Stream:</td>
    <td>{$h($plan['class_stream'] ?: '—')}</td>
  </tr>
  <tr>
    <td class="info-lbl">Subject:</td>
    <td>{$h($plan['subject_name'])}</td>
    <td class="info-lbl">Time:</td>
    <td>{$h($plan['lesson_time'])}</td>
  </tr>
  <tr>
    <td class="info-lbl">Date:</td>
    <td>{$lessonDate}</td>
    <td class="info-lbl"></td>
    <td></td>
  </tr>
</table>

<!-- ══ ATTENDANCE TABLE ════════════════════════════════════════════════ -->
<div class="att-wrap">
<table class="att-table">
  <tr><th colspan="9">Number of Students</th></tr>
  <tr>
    <th colspan="3">Registered</th>
    <th colspan="3">Present</th>
    <th colspan="3">Absentees</th>
  </tr>
  <tr>
    <th>Girls</th><th>Boys</th><th>Total</th>
    <th>Girls</th><th>Boys</th><th>Total</th>
    <th>Girls</th><th>Boys</th><th>Total</th>
  </tr>
  <tr>
    <td>{$girlsReg}</td><td>{$boysReg}</td><td>{$totalReg}</td>
    <td>{$girlsPres}</td><td>{$boysPres}</td><td>{$totalPres}</td>
    <td>{$girlsAbs}</td><td>{$boysAbs}</td><td>{$totalAbs}</td>
  </tr>
</table>
</div>

<!-- ══ PLAIN TEXT SECTIONS ═════════════════════════════════════════════ -->
<p class="info-line"><strong>Main Competence:</strong> {$h($plan['module_code'].' '.$plan['module_title'])}</p>
<p class="info-line"><strong>Specific Competence:</strong> {$h($plan['unit_code'].' '.$plan['unit_title'])}</p>
<p class="info-line"><strong>Main Learning Activity:</strong> {$h($plan['unit_title'])}</p>
<p class="info-line"><strong>Specific Learning Activity:</strong> {$h($plan['element_code'].' '.$plan['element_title'])}</p>
<p class="info-line"><strong>Teaching and Learning Resources:</strong> {$resourcesStr}</p>
<p class="info-line"><strong>References:</strong> {$reference}</p>

<!-- ══ TEACHING AND LEARNING PROCESS ══════════════════════════════════ -->
<div class="section-title">Teaching and Learning Process</div>
<table class="process-table">
  <thead>
    <tr>
      <th style="width:13%">Stages</th>
      <th style="width:7%">Time<br/>(Minutes)</th>
      <th style="width:27%">Teaching Activities</th>
      <th style="width:27%">Learning Activities</th>
      <th style="width:26%">Assessment Criteria</th>
    </tr>
  </thead>
  <tbody>
    {$stageRowsHtml}
  </tbody>
</table>

<!-- ══ REMARKS — plain text ════════════════════════════════════════════ -->
<p class="remarks"><strong>Remarks:</strong> {$remarks}</p>
{$remarksLines}

</body>
</html>
HTML;

$options = new Options();
$options->set('defaultFont', 'Times');
$options->set('isRemoteEnabled', false);
$options->set('isHtml5ParserEnabled', true);

$dompdf = new Dompdf($options);
$dompdf->loadHtml($html, 'UTF-8');
$dompdf->setPaper('A4', 'portrait');
$dompdf->render();

$dompdf->stream("lesson_plan_{$planId}.pdf", ['Attachment' => false]);
