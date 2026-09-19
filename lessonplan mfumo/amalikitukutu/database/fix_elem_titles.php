<?php
// Strip the "(a) ", "(b) " etc. code prefix from element titles for BS/HTM/MATH
require __DIR__ . '/../config/db.php';
$db = getDB();

// Affects only elements whose title starts with the code pattern "(x) "
$st = $db->query("
    SELECT e.id, e.code, e.title
    FROM elements e
    JOIN units u ON u.id = e.unit_id
    JOIN modules m ON m.id = u.module_id
    JOIN syllabuses sy ON sy.id = m.syllabus_id
    JOIN subjects s ON s.id = sy.subject_id
    WHERE s.code IN ('BS','HTM','MATH')
    AND e.title LIKE CONCAT(e.code,' %')
");

$upd = $db->prepare("UPDATE elements SET title=? WHERE id=?");
$count = 0;
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
    // Strip "code " prefix from the start of title
    $clean = preg_replace('/^\([a-z]\)\s+/u', '', $row['title']);
    $upd->execute([$clean, $row['id']]);
    $count++;
}
echo "Fixed $count element titles.\n";
