<?php
/**
 * Form I seed: Business Studies, Historia ya Tanzania na Maadili, Mathematics
 * Source: textbook TOC images in SUBJECTS_DETAILS/
 */
require __DIR__ . '/../config/db.php';
$db = getDB();
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$inserted = ['subjects'=>0,'syllabuses'=>0,'modules'=>0,'units'=>0,'elements'=>0];

function ins(PDO $db, string $table, array $data): int {
    $cols = implode(',', array_keys($data));
    $phs  = implode(',', array_fill(0, count($data), '?'));
    $st   = $db->prepare("INSERT INTO $table ($cols) VALUES ($phs)");
    $st->execute(array_values($data));
    return (int)$db->lastInsertId();
}

function subjectId(PDO $db, string $code, string $name): int {
    $st = $db->prepare("SELECT id FROM subjects WHERE code=?");
    $st->execute([$code]);
    $row = $st->fetch();
    if ($row) return (int)$row['id'];
    return ins($db, 'subjects', ['code'=>$code,'name'=>$name]);
}

function syllabusId(PDO $db, int $subjectId, string $title, string $formRange): int {
    $st = $db->prepare("SELECT id FROM syllabuses WHERE subject_id=? AND title=?");
    $st->execute([$subjectId,$title]);
    $row = $st->fetch();
    if ($row) return (int)$row['id'];
    return ins($db, 'syllabuses', ['subject_id'=>$subjectId,'title'=>$title,'form_range'=>$formRange]);
}

// ══════════════════════════════════════════════════════════════════════════════
// CURRICULUM DATA
// ══════════════════════════════════════════════════════════════════════════════
$curriculum = [

    // ──────────────────────────────────────────────────────────────────────────
    // 1. BUSINESS STUDIES  (Form I — Student's Book Form One)
    // Source: SUBJECTS_DETAILS/BUSSINESS STUDIES/Capture.PNG
    // ──────────────────────────────────────────────────────────────────────────
    [
        'subject_code' => 'BS',
        'subject_name' => 'Business Studies',
        'syllabus_title' => 'Business Studies for Ordinary Level Secondary Education',
        'form_range'   => 'Form I-IV',
        'form'         => 'I',
        'modules' => [
            [
                'code'  => 'Chapter 1',
                'title' => 'Introduction to Business Studies',
                'units' => [
                    [
                        'code'  => '1.1',
                        'title' => 'The concept of a business',
                        'elements' => [
                            '(a) Define and explain the concept of a business',
                            '(b) Identify and describe characteristics of a business',
                            '(c) Classify types of businesses with examples',
                        ],
                    ],
                    [
                        'code'  => '1.2',
                        'title' => 'Terminologies used in Business Studies',
                        'elements' => [
                            '(a) Define and use key terminologies in Business Studies',
                            '(b) Explain the importance of business terminologies in practice',
                        ],
                    ],
                    [
                        'code'  => '1.3',
                        'title' => 'The concept of Business Studies',
                        'elements' => [
                            '(a) Describe the scope and nature of Business Studies as a subject',
                            '(b) Explain the importance and relevance of Business Studies',
                            '(c) Identify career opportunities related to Business Studies',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Chapter 2',
                'title' => 'Entrepreneurship',
                'units' => [
                    [
                        'code'  => '2.1',
                        'title' => 'The concept of entrepreneurship',
                        'elements' => [
                            '(a) Define and explain the concept of entrepreneurship',
                            '(b) Identify and describe characteristics of a successful entrepreneur',
                            '(c) Explain the importance of entrepreneurship in economic development',
                        ],
                    ],
                    [
                        'code'  => '2.2',
                        'title' => 'Theories of entrepreneurship',
                        'elements' => [
                            '(a) Describe the major theories of entrepreneurship',
                            '(b) Apply entrepreneurship theories to analyse business situations',
                            '(c) Evaluate the relevance of entrepreneurship theories in Tanzania',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Chapter 3',
                'title' => 'Sole Proprietorship',
                'units' => [
                    [
                        'code'  => '3.1',
                        'title' => 'The concept of sole proprietorship',
                        'elements' => [
                            '(a) Define and describe the concept of sole proprietorship',
                            '(b) Identify advantages and disadvantages of sole proprietorship',
                        ],
                    ],
                    [
                        'code'  => '3.2',
                        'title' => 'Formation of a sole proprietorship',
                        'elements' => [
                            '(a) Describe the steps and legal requirements for forming a sole proprietorship',
                            '(b) Identify sources of capital for a sole proprietor',
                        ],
                    ],
                    [
                        'code'  => '3.3',
                        'title' => 'Ways of solving challenges facing sole proprietorship',
                        'elements' => [
                            '(a) Identify challenges facing sole proprietorship businesses',
                            '(b) Propose and evaluate solutions to challenges facing sole proprietors',
                        ],
                    ],
                ],
            ],
        ],
    ],

    // ──────────────────────────────────────────────────────────────────────────
    // 2. HISTORIA YA TANZANIA NA MAADILI  (Form I)
    // Source: SUBJECTS_DETAILS/HISTORIA YA TANZANIA NA MAADILI/Capture.PNG + II.PNG
    // ──────────────────────────────────────────────────────────────────────────
    [
        'subject_code' => 'HTM',
        'subject_name' => 'Historia ya Tanzania na Maadili',
        'syllabus_title' => 'Muhtasari Historia ya Tanzania na Maadili Darasa la I — IV',
        'form_range'   => 'Form I-IV',
        'form'         => 'I',
        'modules' => [
            [
                'code'  => 'Sura ya Kwanza',
                'title' => 'Utangulizi wa Historia',
                'units' => [
                    [
                        'code'  => '1.1',
                        'title' => 'Dhana ya Historia',
                        'elements' => [
                            '(a) Eleza maana ya Historia na umuhimu wake katika maisha ya kila siku',
                            '(b) Tofautisha Historia na hadithi za kimapokeo',
                        ],
                    ],
                    [
                        'code'  => '1.2',
                        'title' => 'Vyanzo vya Historia',
                        'elements' => [
                            '(a) Tambua na ueleze vyanzo mbalimbali vya Historia',
                            '(b) Tathmini ubora na mapungufu ya vyanzo vya Historia',
                        ],
                    ],
                    [
                        'code'  => '1.3',
                        'title' => 'Matumizi ya Historia',
                        'elements' => [
                            '(a) Eleza umuhimu wa kusoma Historia kwa mtu binafsi na taifa',
                            '(b) Unganisha Historia na masomo mengine ya shuleni',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Sura ya Pili',
                'title' => 'Binadamu wa Zamani na Mazingira Yake',
                'units' => [
                    [
                        'code'  => '2.1',
                        'title' => 'Mageuzi ya binadamu',
                        'elements' => [
                            '(a) Eleza nadharia mbalimbali za mageuzi ya binadamu',
                            '(b) Eleza hatua za mageuzi ya binadamu kutoka sokwe hadi binadamu wa kisasa',
                        ],
                    ],
                    [
                        'code'  => '2.2',
                        'title' => 'Zama za Mawe',
                        'elements' => [
                            '(a) Eleza maisha ya binadamu katika Zama za Mawe za Kale',
                            '(b) Tofautisha Zama za Mawe za Kale, Kati na za Karibuni',
                            '(c) Eleza zana zilizotumiwa na binadamu wa zamani',
                        ],
                    ],
                    [
                        'code'  => '2.3',
                        'title' => 'Mabaki ya binadamu wa zamani Tanzania',
                        'elements' => [
                            '(a) Eleza maeneo yaliyogunduliwa mabaki ya binadamu wa zamani Tanzania',
                            '(b) Eleza umuhimu wa maeneo ya kiakiolojia Tanzania kama Olduvai',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Sura ya Tatu',
                'title' => 'Jamii za Mapema Afrika Mashariki',
                'units' => [
                    [
                        'code'  => '3.1',
                        'title' => 'Makundi ya watu wa mapema Afrika Mashariki',
                        'elements' => [
                            '(a) Tambua makundi ya wawindaji-wakusanyaji, wafugaji na wakulima wa mapema',
                            '(b) Eleza mfumo wa maisha wa kila kundi la watu wa mapema',
                        ],
                    ],
                    [
                        'code'  => '3.2',
                        'title' => 'Uhamaji na makazi ya makabila',
                        'elements' => [
                            '(a) Eleza sababu zilizopelekea uhamaji wa makabila Afrika Mashariki',
                            '(b) Eleza athari za uhamaji kwa makabila yaliyohamia na yaliyokaribishwa',
                        ],
                    ],
                    [
                        'code'  => '3.3',
                        'title' => 'Mwingiliano wa makabila',
                        'elements' => [
                            '(a) Eleza jinsi makabila yalivyoingiliana kibiashara, kijamii na kiutamaduni',
                            '(b) Tathmini athari za mwingiliano huo kwa maendeleo ya Tanzania',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Sura ya Nne',
                'title' => 'Uhusiano wa Jamii ya Kitanzania na Jamii Nyingine',
                'units' => [
                    [
                        'code'  => '4.1',
                        'title' => 'Uhusiano wa kati ya Kitanzania na jamii nyingine',
                        'elements' => [
                            '(a) Eleza asili na historia ya uhusiano wa Watanzania na mataifa mengine',
                            '(b) Bainisha njia mbalimbali za uhusiano huu (biashara, ndoa, vita)',
                        ],
                    ],
                    [
                        'code'  => '4.2',
                        'title' => 'Uhusiano wa jamii ya Kitanzania na jamii za Ulaya',
                        'elements' => [
                            '(a) Eleza uhusiano wa Watanzania na Wazungu kabla ya ukoloni',
                            '(b) Tathmini athari za kiuchumi na kijamii za uhusiano na Wazungu',
                        ],
                    ],
                    [
                        'code'  => '4.3',
                        'title' => 'Uhusiano wa jamii ya Kitanzania na jamii za Mashariki ya Kati',
                        'elements' => [
                            '(a) Eleza uhusiano wa Watanzania na Waarabu katika biashara ya pwani',
                            '(b) Tathmini athari za biashara ya watumwa na bidhaa nyingine',
                            '(c) Eleza athari za kidini na kiutamaduni za uhusiano na Waarabu',
                        ],
                    ],
                    [
                        'code'  => '4.4',
                        'title' => 'Athari za uhusiano wa nje kwa jamii za Kitanzania',
                        'elements' => [
                            '(a) Eleza athari chanya za uhusiano wa Watanzania na mataifa mengine',
                            '(b) Eleza athari hasi za uhusiano huo hasa biashara ya utumwa',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Sura ya Tano',
                'title' => 'Ujio wa Wakoloni na Upinzani',
                'units' => [
                    [
                        'code'  => '5.1',
                        'title' => 'Sababu za ujio wa Wazungu Afrika',
                        'elements' => [
                            '(a) Eleza sababu za kiuchumi zilizopelekea Wazungu kuja Afrika',
                            '(b) Eleza sababu za kisiasa, kidini na kijamii za ujio wa wakoloni',
                        ],
                    ],
                    [
                        'code'  => '5.2',
                        'title' => 'Upinzani wa Watanzania dhidi ya ukoloni',
                        'elements' => [
                            '(a) Eleza njia mbalimbali za upinzani dhidi ya wakoloni (silaha na diplomasia)',
                            '(b) Tathimini mafanikio na mapungufu ya upinzani dhidi ya ukoloni',
                        ],
                    ],
                    [
                        'code'  => '5.3',
                        'title' => 'Vita vya Majimaji',
                        'elements' => [
                            '(a) Eleza sababu, mwenendo na matokeo ya Vita vya Majimaji (1905-1907)',
                            '(b) Eleza umuhimu wa Vita vya Majimaji katika historia ya Tanzania',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Sura ya Sita',
                'title' => 'Tanzania Chini ya Utawala wa Kikoloni',
                'units' => [
                    [
                        'code'  => '6.1',
                        'title' => 'Ukoloni wa Kijerumani Tanzania (1885-1919)',
                        'elements' => [
                            '(a) Eleza jinsi Wajerumani walivyoanzisha utawala Tanzania',
                            '(b) Eleza mabadiliko ya kiuchumi na kijamii chini ya Wajerumani',
                        ],
                    ],
                    [
                        'code'  => '6.2',
                        'title' => 'Ukoloni wa Kiingereza Tanzania (1919-1961)',
                        'elements' => [
                            '(a) Eleza jinsi Waingereza walivyochukua Tanzania baada ya Vita Kuu ya Kwanza',
                            '(b) Eleza sera za kiuchumi na kisiasa za Waingereza Tanzania',
                            '(c) Eleza athari za utawala wa Kiingereza kwa Watanzania',
                        ],
                    ],
                    [
                        'code'  => '6.3',
                        'title' => 'Harakati za uhuru Tanzania',
                        'elements' => [
                            '(a) Eleza historia ya chama cha TANU na jukumu lake katika kupigania uhuru',
                            '(b) Eleza jukumu la Julius Nyerere katika harakati za uhuru',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Sura ya Saba',
                'title' => 'Sayamsi na Teknolojia Kabla ya Ukoloni',
                'units' => [
                    [
                        'code'  => '7.1',
                        'title' => 'Dhana ya sayamsi na teknolojia',
                        'elements' => [
                            '(a) Eleza maana ya sayamsi na teknolojia katika muktadha wa historia',
                            '(b) Eleza uhusiano kati ya sayamsi, teknolojia na maendeleo ya jamii',
                        ],
                    ],
                    [
                        'code'  => '7.2',
                        'title' => 'Teknolojia wakati wa Zama za Mawe za Kale',
                        'elements' => [
                            '(a) Eleza aina za zana zilizotengenezwa na kutumika katika Zama za Mawe za Kale',
                            '(b) Eleza jinsi binadamu wa Zama za Mawe alivyojipatia chakula na makazi',
                        ],
                    ],
                    [
                        'code'  => '7.3',
                        'title' => 'Teknolojia wakati wa Zama za Chuma',
                        'elements' => [
                            '(a) Eleza uvumbuzi wa chuma na athari zake kwa maendeleo ya teknolojia',
                            '(b) Eleza zana na silaha zilizotengenezwa kutoka chuma',
                        ],
                    ],
                    [
                        'code'  => '7.4',
                        'title' => 'Tofauti ya teknolojia kati ya Zama za Mawe na Zama za Chuma',
                        'elements' => [
                            '(a) Linganisha na kupingamisha teknolojia ya Zama za Mawe na Zama za Chuma',
                            '(b) Eleza jinsi teknolojia ya chuma ilivyobadilisha maisha ya binadamu',
                        ],
                    ],
                    [
                        'code'  => '7.5',
                        'title' => 'Vichangio vya ubunifu wa sayamsi na teknolojia kabla ya ukoloni',
                        'elements' => [
                            '(a) Eleza mchango wa jamii za Kiafrika katika ubunifu wa sayamsi na teknolojia',
                            '(b) Tathmini umuhimu wa vichangio vya teknolojia ya kabla ya ukoloni kwa Tanzania ya leo',
                        ],
                    ],
                ],
            ],
        ],
    ],

    // ──────────────────────────────────────────────────────────────────────────
    // 3. MATHEMATICS  (Form I)
    // Source: SUBJECTS_DETAILS/MATHEMATICS/Capture.PNG (TOC)
    // Chapters: 1-Concept of Maths, 2-Approximations, 3-Rates&Proportions,
    //           4-Integers/Fractions, 5-Algebra (clearly visible in image)
    // ──────────────────────────────────────────────────────────────────────────
    [
        'subject_code' => 'MATH',
        'subject_name' => 'Mathematics',
        'syllabus_title' => 'Mathematics Syllabus for Ordinary Level Secondary Education',
        'form_range'   => 'Form I-IV',
        'form'         => 'I',
        'modules' => [
            [
                'code'  => 'Chapter 1',
                'title' => 'Concept of Mathematics',
                'units' => [
                    [
                        'code'  => '1.1',
                        'title' => 'Meaning of Mathematics',
                        'elements' => [
                            '(a) Explain the meaning and nature of Mathematics',
                            '(b) Identify and describe branches of Mathematics',
                        ],
                    ],
                    [
                        'code'  => '1.2',
                        'title' => 'Relationship between Mathematics and other subjects',
                        'elements' => [
                            '(a) Explain the relationship between Mathematics and other subjects',
                            '(b) Describe the importance of Mathematics in daily life and work',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Chapter 2',
                'title' => 'Approximations',
                'units' => [
                    [
                        'code'  => '2.1',
                        'title' => 'Meaning and types of numbers',
                        'elements' => [
                            '(a) Identify and classify types of numbers (natural, whole, integers, rational, irrational)',
                            '(b) Represent numbers on a number line',
                        ],
                    ],
                    [
                        'code'  => '2.2',
                        'title' => 'Rounding off numbers',
                        'elements' => [
                            '(a) Round off numbers to specified decimal places and significant figures',
                            '(b) Use approximations to estimate results of calculations',
                        ],
                    ],
                    [
                        'code'  => '2.3',
                        'title' => 'Errors in approximations',
                        'elements' => [
                            '(a) Calculate absolute error and relative error in approximations',
                            '(b) Interpret the significance of errors in real-life measurements',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Chapter 3',
                'title' => 'Rates and Proportions',
                'units' => [
                    [
                        'code'  => '3.1',
                        'title' => 'Ratio',
                        'elements' => [
                            '(a) Define ratio and express quantities as ratios in simplest form',
                            '(b) Solve problems involving ratio and sharing in given ratios',
                        ],
                    ],
                    [
                        'code'  => '3.2',
                        'title' => 'Rates',
                        'elements' => [
                            '(a) Define rate and calculate rates from given information',
                            '(b) Apply rates to solve real-life problems (speed, unit price, population growth)',
                        ],
                    ],
                    [
                        'code'  => '3.3',
                        'title' => 'Proportions',
                        'elements' => [
                            '(a) Identify and distinguish between direct and inverse proportion',
                            '(b) Solve problems involving direct and inverse proportion',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Chapter 4',
                'title' => 'Fractions, Decimals and Percentages',
                'units' => [
                    [
                        'code'  => '4.1',
                        'title' => 'Fractions',
                        'elements' => [
                            '(a) Identify and classify types of fractions (proper, improper, mixed numbers)',
                            '(b) Perform operations on fractions: addition, subtraction, multiplication and division',
                        ],
                    ],
                    [
                        'code'  => '4.2',
                        'title' => 'Decimal numbers',
                        'elements' => [
                            '(a) Perform operations on decimal numbers',
                            '(b) Convert between fractions, decimals and percentages',
                        ],
                    ],
                    [
                        'code'  => '4.3',
                        'title' => 'Percentages',
                        'elements' => [
                            '(a) Calculate and express quantities as percentages',
                            '(b) Apply percentages to solve real-life problems (profit, loss, discount, VAT)',
                        ],
                    ],
                ],
            ],
            [
                'code'  => 'Chapter 5',
                'title' => 'Algebra',
                'units' => [
                    [
                        'code'  => '5.1',
                        'title' => 'Algebraic expressions',
                        'elements' => [
                            '(a) Write, read and interpret algebraic expressions',
                            '(b) Simplify algebraic expressions by collecting like terms',
                            '(c) Expand and factorise simple algebraic expressions',
                        ],
                    ],
                    [
                        'code'  => '5.2',
                        'title' => 'Linear equations with one unknown',
                        'elements' => [
                            '(a) Solve linear equations with one unknown',
                            '(b) Form and solve linear equations from word problems',
                        ],
                    ],
                    [
                        'code'  => '5.3',
                        'title' => 'Inequalities',
                        'elements' => [
                            '(a) Solve simple linear inequalities with one unknown',
                            '(b) Represent solutions of inequalities on a number line',
                        ],
                    ],
                    [
                        'code'  => '5.4',
                        'title' => 'Analysis of a straight line',
                        'elements' => [
                            '(a) Determine the gradient and y-intercept of a straight line from its equation',
                            '(b) Sketch the graph of a linear function from its equation',
                        ],
                    ],
                    [
                        'code'  => '5.5',
                        'title' => 'Simultaneous linear equations',
                        'elements' => [
                            '(a) Solve simultaneous linear equations graphically',
                            '(b) Solve simultaneous linear equations algebraically (substitution and elimination)',
                        ],
                    ],
                ],
            ],
        ],
    ],

]; // end $curriculum

// ══════════════════════════════════════════════════════════════════════════════
// INSERT
// ══════════════════════════════════════════════════════════════════════════════
$db->beginTransaction();
try {
    foreach ($curriculum as $subj) {
        $sid = subjectId($db, $subj['subject_code'], $subj['subject_name']);
        if ($sid > $db->query("SELECT MAX(id) FROM subjects")->fetchColumn() - count($curriculum)) {
            $inserted['subjects']++;
        }

        $sylId = syllabusId($db, $sid, $subj['syllabus_title'], $subj['form_range']);
        $inserted['syllabuses']++;

        foreach ($subj['modules'] as $mod) {
            $mid = ins($db, 'modules', [
                'syllabus_id' => $sylId,
                'code'        => $mod['code'],
                'title'       => $mod['title'],
                'form'        => $subj['form'],
            ]);
            $inserted['modules']++;

            foreach ($mod['units'] as $unit) {
                $uid = ins($db, 'units', [
                    'module_id' => $mid,
                    'code'      => $unit['code'],
                    'title'     => $unit['title'],
                    'form'      => $subj['form'],
                ]);
                $inserted['units']++;

                foreach ($unit['elements'] as $elemTitle) {
                    $eCode = strtok($elemTitle, ' ');
                    ins($db, 'elements', [
                        'unit_id' => $uid,
                        'code'    => $eCode,
                        'title'   => $elemTitle,
                    ]);
                    $inserted['elements']++;
                }
            }
        }
    }
    $db->commit();
    echo "SUCCESS\n";
    foreach ($inserted as $k => $v) echo "  $k: $v\n";
} catch (Exception $e) {
    $db->rollBack();
    echo "ERROR: " . $e->getMessage() . "\n";
}
