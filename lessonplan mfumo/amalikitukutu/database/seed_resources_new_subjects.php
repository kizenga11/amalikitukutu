<?php
// Seed element_resources for Business Studies (75-94), Historia (95-145), Mathematics (146-178)
require __DIR__ . '/../config/db.php';
$db = getDB();
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// ── 1. Insert new resource types if not already present ─────────────────────
$newResources = [
    'Maps and atlases',
    'Graph paper',
    'Number line',
    'Photographs / pictures',
    'Fraction strips / bars',
    'Ruler and compass',
    'Role-play cards',
    'Newspaper / magazine cuttings',
];

$checkRes = $db->prepare("SELECT id FROM resources WHERE name=? LIMIT 1");
$insRes   = $db->prepare("INSERT INTO resources (name) VALUES (?)");

$resId = [];
// Load existing resources
foreach ($db->query("SELECT id, name FROM resources")->fetchAll(PDO::FETCH_ASSOC) as $r) {
    $resId[$r['name']] = (int)$r['id'];
}
// Add missing ones
foreach ($newResources as $name) {
    if (!isset($resId[$name])) {
        $insRes->execute([$name]);
        $resId[$name] = (int)$db->lastInsertId();
    }
}

// Convenience aliases
$R = [
    'textbook'    => $resId['Textbook'],
    'handouts'    => $resId['Handouts'],
    'whiteboard'  => $resId['Whiteboard'],
    'markers'     => $resId['Markers'],
    'manila'      => $resId['Manila papers'],
    'charts'      => $resId['Charts and diagrams'],
    'calculator'  => $resId['Calculator'],
    'models'      => $resId['Models'],
    'projector'   => $resId['Projector'],
    'maps'        => $resId['Maps and atlases'],
    'graph'       => $resId['Graph paper'],
    'numline'     => $resId['Number line'],
    'photos'      => $resId['Photographs / pictures'],
    'fractions'   => $resId['Fraction strips / bars'],
    'ruler'       => $resId['Ruler and compass'],
    'roleplay'    => $resId['Role-play cards'],
    'newspaper'   => $resId['Newspaper / magazine cuttings'],
];

// ── 2. Define resources per element ─────────────────────────────────────────
// Common base sets:
// BS_BASE   = textbook, handouts, whiteboard, markers, charts, manila
// HTM_BASE  = textbook, handouts, whiteboard, markers, charts, manila, photos
// MATH_BASE = textbook, handouts, whiteboard, markers, charts

$BS_BASE   = [$R['textbook'],$R['handouts'],$R['whiteboard'],$R['markers'],$R['charts'],$R['manila']];
$HTM_BASE  = [$R['textbook'],$R['handouts'],$R['whiteboard'],$R['markers'],$R['charts'],$R['manila'],$R['photos']];
$MATH_BASE = [$R['textbook'],$R['handouts'],$R['whiteboard'],$R['markers'],$R['charts']];

// element_id => [resource_ids, ...]
$elementResources = [

    // ── Business Studies ────────────────────────────────────────────────────
    75  => array_unique(array_merge($BS_BASE, [$R['photos']])),                          // Business activities
    76  => array_unique(array_merge($BS_BASE, [$R['newspaper']])),                       // Types of business
    77  => array_unique(array_merge($BS_BASE, [$R['models']])),                          // Business environments
    78  => array_unique(array_merge($BS_BASE, [$R['roleplay']])),                        // Business stakeholders
    79  => array_unique(array_merge($BS_BASE, [$R['calculator']])),                      // Business transactions
    80  => array_unique(array_merge($BS_BASE, [$R['roleplay'],$R['newspaper']])),        // Entrepreneurship meaning
    81  => array_unique(array_merge($BS_BASE, [$R['photos'],$R['newspaper']])),          // Characteristics of entrepreneurs
    82  => array_unique(array_merge($BS_BASE, [$R['roleplay']])),                        // Role of entrepreneurship
    83  => array_unique(array_merge($BS_BASE, [$R['calculator'],$R['newspaper']])),      // Challenges of entrepreneurship
    84  => array_unique(array_merge($BS_BASE, [$R['roleplay'],$R['calculator']])),       // Creativity and innovation
    85  => array_unique(array_merge($BS_BASE, [$R['calculator']])),                      // Sole proprietorship meaning
    86  => array_unique(array_merge($BS_BASE, [$R['newspaper']])),                       // Features of sole proprietorship
    87  => array_unique(array_merge($BS_BASE, [$R['calculator'],$R['newspaper']])),      // Advantages/disadvantages
    88  => array_unique(array_merge($BS_BASE, [$R['roleplay'],$R['calculator']])),       // Starting a sole proprietorship
    89  => array_unique(array_merge($BS_BASE, [$R['calculator']])),                      // Capital and sources
    90  => array_unique(array_merge($BS_BASE, [$R['calculator'],$R['newspaper']])),      // Simple business records
    91  => array_unique(array_merge($BS_BASE, [$R['calculator']])),                      // Cash book
    92  => array_unique(array_merge($BS_BASE, [$R['calculator']])),                      // Petty cash
    93  => array_unique(array_merge($BS_BASE, [$R['calculator'],$R['newspaper']])),      // Profit and loss
    94  => array_unique(array_merge($BS_BASE, [$R['calculator'],$R['roleplay']])),       // Business planning

    // ── Historia ya Tanzania na Maadili ─────────────────────────────────────
    95  => array_unique(array_merge($HTM_BASE, [])),                                     // Maana ya Historia
    96  => array_unique(array_merge($HTM_BASE, [])),                                     // Historia vs hadithi
    97  => array_unique(array_merge($HTM_BASE, [$R['models']])),                        // Vyanzo vya Historia
    98  => array_unique(array_merge($HTM_BASE, [])),                                     // Tathmini vyanzo
    99  => array_unique(array_merge($HTM_BASE, [])),                                     // Umuhimu wa Historia
    100 => array_unique(array_merge($HTM_BASE, [$R['charts']])),                        // Uhusiano na masomo

    101 => array_unique(array_merge($HTM_BASE, [])),                                     // Nadharia za mageuzi
    102 => array_unique(array_merge($HTM_BASE, [$R['charts']])),                        // Hatua za mageuzi
    103 => array_unique(array_merge($HTM_BASE, [$R['models']])),                        // Zama za Mawe za Kale
    104 => array_unique(array_merge($HTM_BASE, [])),                                     // Tofauti Zama za Mawe
    105 => array_unique(array_merge($HTM_BASE, [$R['models']])),                        // Zana za zamani
    106 => array_unique(array_merge($HTM_BASE, [$R['maps']])),                          // Maeneo ya kiakiolojia
    107 => array_unique(array_merge($HTM_BASE, [$R['maps'],$R['photos']])),             // Umuhimu Olduvai

    108 => array_unique(array_merge($HTM_BASE, [])),                                     // Makundi ya wawindaji
    109 => array_unique(array_merge($HTM_BASE, [$R['roleplay']])),                      // Mfumo wa maisha
    110 => array_unique(array_merge($HTM_BASE, [$R['maps']])),                          // Sababu za uhamaji
    111 => array_unique(array_merge($HTM_BASE, [])),                                     // Athari za uhamaji
    112 => array_unique(array_merge($HTM_BASE, [])),                                     // Mwingiliano wa makabila
    113 => array_unique(array_merge($HTM_BASE, [])),                                     // Tathmini mwingiliano

    114 => array_unique(array_merge($HTM_BASE, [$R['maps']])),                          // Uhusiano na mataifa
    115 => array_unique(array_merge($HTM_BASE, [$R['roleplay']])),                      // Njia za uhusiano
    116 => array_unique(array_merge($HTM_BASE, [$R['maps'],$R['photos']])),             // Uhusiano na Wazungu
    117 => array_unique(array_merge($HTM_BASE, [])),                                     // Tathmini uhusiano Wazungu
    118 => array_unique(array_merge($HTM_BASE, [$R['maps'],$R['photos']])),             // Biashara ya Waarabu
    119 => array_unique(array_merge($HTM_BASE, [$R['photos']])),                        // Athari biashara watumwa
    120 => array_unique(array_merge($HTM_BASE, [$R['photos']])),                        // Athari kidini/utamaduni

    121 => array_unique(array_merge($HTM_BASE, [])),                                     // Athari chanya uhusiano
    122 => array_unique(array_merge($HTM_BASE, [])),                                     // Athari hasi uhusiano

    123 => array_unique(array_merge($HTM_BASE, [$R['maps']])),                          // Sababu kiuchumi ukoloni
    124 => array_unique(array_merge($HTM_BASE, [])),                                     // Sababu kisiasa/kidini
    125 => array_unique(array_merge($HTM_BASE, [$R['photos']])),                        // Njia za upinzani
    126 => array_unique(array_merge($HTM_BASE, [])),                                     // Tathmini upinzani
    127 => array_unique(array_merge($HTM_BASE, [$R['maps'],$R['photos']])),             // Vita vya Majimaji
    128 => array_unique(array_merge($HTM_BASE, [])),                                     // Umuhimu Majimaji

    129 => array_unique(array_merge($HTM_BASE, [$R['photos']])),                        // Utawala Wajerumani
    130 => array_unique(array_merge($HTM_BASE, [])),                                     // Mabadiliko Wajerumani
    131 => array_unique(array_merge($HTM_BASE, [$R['maps'],$R['photos']])),             // Waingereza wachukua TZ
    132 => array_unique(array_merge($HTM_BASE, [])),                                     // Sera Waingereza
    133 => array_unique(array_merge($HTM_BASE, [])),                                     // Athari Waingereza

    134 => array_unique(array_merge($HTM_BASE, [$R['photos']])),                        // Historia TANU
    135 => array_unique(array_merge($HTM_BASE, [$R['photos']])),                        // Jukumu Nyerere

    136 => array_unique(array_merge($HTM_BASE, [])),                                     // Maana sayamsi/teknolojia
    137 => array_unique(array_merge($HTM_BASE, [$R['charts']])),                        // Uhusiano sayamsi/jamii
    138 => array_unique(array_merge($HTM_BASE, [$R['models'],$R['photos']])),           // Zana Zama za Mawe
    139 => array_unique(array_merge($HTM_BASE, [$R['photos']])),                        // Maisha Zama za Mawe
    140 => array_unique(array_merge($HTM_BASE, [$R['models'],$R['photos']])),           // Uvumbuzi wa chuma
    141 => array_unique(array_merge($HTM_BASE, [$R['models']])),                        // Zana za chuma
    142 => array_unique(array_merge($HTM_BASE, [])),                                     // Tofauti Mawe vs Chuma
    143 => array_unique(array_merge($HTM_BASE, [$R['charts']])),                        // Athari teknolojia chuma
    144 => array_unique(array_merge($HTM_BASE, [$R['photos']])),                        // Mchango Afrika sayamsi
    145 => array_unique(array_merge($HTM_BASE, [])),                                     // Umuhimu teknolojia kabla ukoloni

    // ── Mathematics ─────────────────────────────────────────────────────────
    146 => array_unique(array_merge($MATH_BASE, [$R['newspaper']])),                    // Define Mathematics
    147 => array_unique(array_merge($MATH_BASE, [$R['photos']])),                       // History of Maths
    148 => array_unique(array_merge($MATH_BASE, [])),                                    // Branches of Maths
    149 => array_unique(array_merge($MATH_BASE, [])),                                    // Maths and other subjects

    150 => array_unique(array_merge($MATH_BASE, [$R['calculator']])),                   // Rounding off
    151 => array_unique(array_merge($MATH_BASE, [$R['calculator'],$R['newspaper']])),   // Estimation
    152 => array_unique(array_merge($MATH_BASE, [$R['calculator']])),                   // Percentage error
    153 => array_unique(array_merge($MATH_BASE, [$R['calculator']])),                   // Apply approximation

    154 => array_unique(array_merge($MATH_BASE, [$R['calculator'],$R['charts']])),      // Rates
    155 => array_unique(array_merge($MATH_BASE, [$R['calculator']])),                   // Ratios
    156 => array_unique(array_merge($MATH_BASE, [$R['charts']])),                       // Direct vs inverse proportion
    157 => array_unique(array_merge($MATH_BASE, [$R['calculator']])),                   // Solve proportion problems
    158 => array_unique(array_merge($MATH_BASE, [$R['calculator'],$R['newspaper']])),   // Rates/proportions real life

    159 => array_unique(array_merge($MATH_BASE, [$R['calculator'],$R['fractions']])),   // Convert fractions/decimals/%
    160 => array_unique(array_merge($MATH_BASE, [$R['fractions']])),                    // Add/subtract fractions
    161 => array_unique(array_merge($MATH_BASE, [$R['fractions'],$R['calculator']])),   // Multiply/divide fractions
    162 => array_unique(array_merge($MATH_BASE, [$R['calculator'],$R['newspaper']])),   // Percentages
    163 => array_unique(array_merge($MATH_BASE, [$R['calculator'],$R['newspaper']])),   // Financial contexts

    164 => array_unique(array_merge($MATH_BASE, [])),                                    // Letters for unknowns
    165 => array_unique(array_merge($MATH_BASE, [])),                                    // Collect like terms
    166 => array_unique(array_merge($MATH_BASE, [$R['charts']])),                       // Expand and factorise
    167 => array_unique(array_merge($MATH_BASE, [])),                                    // Solve linear equations
    168 => array_unique(array_merge($MATH_BASE, [])),                                    // Form linear equations
    169 => array_unique(array_merge($MATH_BASE, [$R['calculator']])),                   // Substitution into formulae
    170 => array_unique(array_merge($MATH_BASE, [$R['numline']])),                      // Inequalities
    171 => array_unique(array_merge($MATH_BASE, [])),                                    // Age/money/number problems
    172 => array_unique(array_merge($MATH_BASE, [])),                                    // Simultaneous equations
    173 => array_unique(array_merge($MATH_BASE, [])),                                    // Word problems simultaneous
    174 => array_unique(array_merge($MATH_BASE, [$R['charts']])),                       // Quadratic expressions
    175 => array_unique(array_merge($MATH_BASE, [])),                                    // Solve quadratics
    176 => array_unique(array_merge($MATH_BASE, [$R['ruler']])),                        // Algebra + geometry
    177 => array_unique(array_merge($MATH_BASE, [$R['graph'],$R['ruler']])),            // Linear graphs
    178 => array_unique(array_merge($MATH_BASE, [$R['graph'],$R['calculator']])),       // Interpret graphs
];

// ── 3. Insert element_resources ─────────────────────────────────────────────
$ins = $db->prepare("INSERT IGNORE INTO element_resources (element_id, resource_id) VALUES (?,?)");

$db->beginTransaction();
try {
    $count = 0;
    foreach ($elementResources as $elemId => $resIds) {
        foreach ($resIds as $rid) {
            $ins->execute([$elemId, $rid]);
            $count++;
        }
    }
    $db->commit();
    echo "Inserted $count element_resources rows for BS/HTM/MATH.\n";
    // New resource IDs
    echo "New resources added:\n";
    foreach ($newResources as $name) echo "  {$resId[$name]}: $name\n";
} catch (Exception $e) {
    $db->rollBack();
    echo "ERROR: " . $e->getMessage() . "\n";
}
