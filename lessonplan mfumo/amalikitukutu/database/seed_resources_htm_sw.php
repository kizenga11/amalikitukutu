<?php
// Replace English element_resources for HTM (elements 95-145) with Kiswahili ones
// Based on section 8.0 of the Historia ya Tanzania na Maadili syllabus (TET 2023)
require __DIR__ . '/../config/db.php';
$db = getDB();
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// ── 1. Ensure Kiswahili resource names exist ────────────────────────────────
$swResources = [
    'Vitabu vya kiada',                          // textbooks
    'Matini/Vipeperushi',                        // handouts / printed texts
    'Ubao wa chaki',                             // chalkboard/whiteboard
    'Kalamu za rangi na ubao',                   // markers + board
    'Chatipindu',                                // charts/flipcharts
    'Manila',                                    // manila paper
    'Ramani',                                    // maps
    'Picha',                                     // photographs/pictures
    'Vitu halisi',                               // real/actual objects
    'Michoro',                                   // drawings/illustrations
    'Nyaraka za kihistoria',                     // historical documents
    'Matini zenye historia na maadili',          // syllabus-specific texts
    'Runinga/Video',                             // TV / video
    'Matini kuhusu utafiti wa kihistoria',       // research texts
];

$insRes = $db->prepare("INSERT INTO resources (name) VALUES (?)");
$resId  = [];
foreach ($db->query("SELECT id, name FROM resources")->fetchAll(PDO::FETCH_ASSOC) as $r) {
    $resId[$r['name']] = (int)$r['id'];
}
foreach ($swResources as $name) {
    if (!isset($resId[$name])) {
        $insRes->execute([$name]);
        $resId[$name] = (int)$db->lastInsertId();
        echo "Added resource: [$resId[$name]] $name\n";
    }
}

// Short aliases
$R = [
    'vitabu'    => $resId['Vitabu vya kiada'],
    'matini'    => $resId['Matini/Vipeperushi'],
    'ubao'      => $resId['Ubao wa chaki'],
    'kalamu'    => $resId['Kalamu za rangi na ubao'],
    'chatipindu'=> $resId['Chatipindu'],
    'manila'    => $resId['Manila'],
    'ramani'    => $resId['Ramani'],
    'picha'     => $resId['Picha'],
    'vitu'      => $resId['Vitu halisi'],
    'michoro'   => $resId['Michoro'],
    'nyaraka'   => $resId['Nyaraka za kihistoria'],
    'historia'  => $resId['Matini zenye historia na maadili'],
    'video'     => $resId['Runinga/Video'],
    'utafiti'   => $resId['Matini kuhusu utafiti wa kihistoria'],
];

// ── 2. Delete existing (English) element_resources for HTM elements 95-145 ──
$htmIds = range(95, 145);
$placeholders = implode(',', array_fill(0, count($htmIds), '?'));
$del = $db->prepare("DELETE FROM element_resources WHERE element_id IN ($placeholders)");
$del->execute($htmIds);
echo "Deleted old English resources for elements 95–145.\n";

// ── 3. Define Kiswahili resources per element (from syllabus) ───────────────
// BASE sets from syllabus section 8.0
$BASE    = [$R['vitabu'],$R['matini'],$R['ubao'],$R['kalamu'],$R['chatipindu'],$R['historia']];
$BASE_R  = array_merge($BASE, [$R['ramani']]);          // + ramani
$BASE_P  = array_merge($BASE, [$R['picha']]);            // + picha
$BASE_RP = array_merge($BASE, [$R['ramani'],$R['picha']]);
$BASE_V  = array_merge($BASE, [$R['vitu']]);             // + vitu halisi
$BASE_M  = array_merge($BASE, [$R['manila']]);           // + manila
$BASE_MR = array_merge($BASE, [$R['manila'],$R['ramani']]);
$BASE_MP = array_merge($BASE, [$R['manila'],$R['picha']]);

// Per element — mapped to syllabus Zana column (Kidato cha I = 95-145)
// Sura ya Kwanza: Utangulizi wa Historia (95-100)
$elRes = [
    95  => array_unique(array_merge($BASE_V, [$R['ramani']])),               // Asili ya jamii / maana Historia
    96  => array_unique(array_merge($BASE, [$R['nyaraka']])),                // Historia vs hadithi
    97  => array_unique(array_merge($BASE_V, [$R['ramani'],$R['nyaraka']])), // Vyanzo vya Historia
    98  => array_unique(array_merge($BASE, [$R['nyaraka']])),                // Tathmini vyanzo
    99  => array_unique(array_merge($BASE_P, [$R['video']])),                // Umuhimu Historia
    100 => array_unique(array_merge($BASE, [$R['michoro']])),                // Uhusiano na masomo

    // Sura ya Pili: Binadamu wa Zamani (101-107)
    101 => array_unique(array_merge($BASE_P, [$R['michoro']])),              // Nadharia mageuzi
    102 => array_unique(array_merge($BASE_P, [$R['chatipindu'],$R['michoro']])), // Hatua mageuzi
    103 => array_unique(array_merge($BASE_P, [$R['vitu'],$R['michoro']])),   // Zama za Mawe za Kale
    104 => array_unique(array_merge($BASE, [$R['chatipindu'],$R['picha']])), // Tofauti Zama za Mawe
    105 => array_unique(array_merge($BASE_V, [$R['picha'],$R['michoro']])), // Zana za zamani
    106 => array_unique(array_merge($BASE_RP, [$R['nyaraka']])),            // Maeneo ya kiakiolojia
    107 => array_unique(array_merge($BASE_RP, [$R['picha'],$R['nyaraka']])),// Umuhimu Olduvai

    // Sura ya Tatu: Jamii za Mapema (108-113)
    108 => array_unique(array_merge($BASE_P, [$R['michoro']])),              // Makundi ya watu wa mapema
    109 => array_unique(array_merge($BASE_V, [$R['picha'],$R['michoro']])), // Mfumo wa maisha
    110 => array_unique(array_merge($BASE_RP, [])),                         // Sababu za uhamaji
    111 => array_unique(array_merge($BASE, [$R['chatipindu']])),            // Athari za uhamaji
    112 => array_unique(array_merge($BASE_MP, [])),                         // Mwingiliano wa makabila
    113 => array_unique(array_merge($BASE, [$R['chatipindu'],$R['nyaraka']])), // Tathmini mwingiliano

    // Sura ya Nne: Uhusiano na Dunia (114-122)
    114 => array_unique(array_merge($BASE_RP, [$R['nyaraka']])),            // Uhusiano na mataifa
    115 => array_unique(array_merge($BASE_P, [$R['nyaraka']])),             // Njia za uhusiano
    116 => array_unique(array_merge($BASE_RP, [$R['picha'],$R['nyaraka']])),// Uhusiano na Wazungu
    117 => array_unique(array_merge($BASE, [$R['chatipindu'],$R['nyaraka']])), // Tathmini uhusiano Wazungu
    118 => array_unique(array_merge($BASE_RP, [$R['picha'],$R['nyaraka']])),// Biashara ya Waarabu
    119 => array_unique(array_merge($BASE_P, [$R['nyaraka'],$R['historia']])), // Athari biashara watumwa
    120 => array_unique(array_merge($BASE_P, [$R['vitu']])),                // Athari kidini/utamaduni
    121 => array_unique(array_merge($BASE, [$R['chatipindu'],$R['michoro']])), // Athari chanya
    122 => array_unique(array_merge($BASE, [$R['chatipindu']])),            // Athari hasi

    // Sura ya Tano: Ujio wa Wakoloni (123-128)
    123 => array_unique(array_merge($BASE_RP, [$R['nyaraka']])),            // Sababu kiuchumi ukoloni
    124 => array_unique(array_merge($BASE, [$R['nyaraka'],$R['historia']])), // Sababu kisiasa/kidini
    125 => array_unique(array_merge($BASE_P, [$R['nyaraka'],$R['historia']])), // Njia za upinzani
    126 => array_unique(array_merge($BASE, [$R['historia'],$R['nyaraka']])), // Tathmini upinzani
    127 => array_unique(array_merge($BASE_RP, [$R['picha'],$R['nyaraka']])),// Vita vya Majimaji
    128 => array_unique(array_merge($BASE_P, [$R['historia']])),            // Umuhimu Majimaji

    // Sura ya Sita: Tanzania Chini ya Ukoloni (129-135)
    129 => array_unique(array_merge($BASE_P, [$R['ramani'],$R['nyaraka']])),// Utawala Wajerumani
    130 => array_unique(array_merge($BASE, [$R['chatipindu'],$R['nyaraka']])), // Mabadiliko Wajerumani
    131 => array_unique(array_merge($BASE_RP, [$R['nyaraka']])),            // Waingereza wachukua TZ
    132 => array_unique(array_merge($BASE, [$R['chatipindu'],$R['historia']])), // Sera Waingereza
    133 => array_unique(array_merge($BASE, [$R['chatipindu']])),            // Athari Waingereza
    134 => array_unique(array_merge($BASE_P, [$R['nyaraka'],$R['historia']])), // Historia TANU
    135 => array_unique(array_merge($BASE_P, [$R['nyaraka']])),             // Jukumu Nyerere

    // Sura ya Saba: Sayamsi na Teknolojia (136-145)
    136 => array_unique(array_merge($BASE_P, [$R['michoro']])),             // Maana sayamsi/teknolojia
    137 => array_unique(array_merge($BASE, [$R['chatipindu'],$R['michoro']])), // Uhusiano sayamsi/jamii
    138 => array_unique(array_merge($BASE_V, [$R['picha'],$R['michoro']])), // Zana Zama za Mawe
    139 => array_unique(array_merge($BASE_P, [$R['michoro'],$R['vitu']])), // Maisha Zama za Mawe
    140 => array_unique(array_merge($BASE_V, [$R['picha'],$R['michoro']])), // Uvumbuzi wa chuma
    141 => array_unique(array_merge($BASE_V, [$R['michoro']])),             // Zana za chuma
    142 => array_unique(array_merge($BASE, [$R['chatipindu'],$R['vitu']])), // Tofauti Mawe vs Chuma
    143 => array_unique(array_merge($BASE, [$R['chatipindu'],$R['michoro']])), // Athari teknolojia chuma
    144 => array_unique(array_merge($BASE_P, [$R['utafiti'],$R['nyaraka']])), // Mchango Afrika
    145 => array_unique(array_merge($BASE, [$R['historia'],$R['chatipindu']])), // Umuhimu teknolojia
];

// ── 4. Insert new Kiswahili resources ───────────────────────────────────────
$ins = $db->prepare("INSERT IGNORE INTO element_resources (element_id, resource_id) VALUES (?,?)");

$db->beginTransaction();
try {
    $count = 0;
    foreach ($elRes as $elemId => $resIds) {
        foreach (array_unique($resIds) as $rid) {
            $ins->execute([$elemId, $rid]);
            $count++;
        }
    }
    $db->commit();
    echo "Inserted $count Kiswahili element_resources for Historia ya Tanzania (elements 95-145).\n";
} catch (Exception $e) {
    $db->rollBack();
    echo "ERROR: " . $e->getMessage() . "\n";
}
