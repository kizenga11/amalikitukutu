-- ============================================================
-- SEED DATA: Computer Science Form I (TIE 2023)
-- Schema fix + full seed: subjects, syllabuses, modules,
-- units, elements, element_methods (4 stages), element_resources
-- ============================================================

-- --------------------------------------------------------
-- SCHEMA FIXES (run before seeding)
-- --------------------------------------------------------

ALTER TABLE `element_methods`
  ADD COLUMN IF NOT EXISTS `time_minutes` int(11) DEFAULT NULL AFTER `stage`;

ALTER TABLE `units`
  ADD COLUMN IF NOT EXISTS `form` varchar(10) DEFAULT NULL AFTER `periods_allocated`;

ALTER TABLE `lesson_plans`
  ADD COLUMN IF NOT EXISTS `reference` text DEFAULT NULL AFTER `remarks`;

-- --------------------------------------------------------
-- SUBJECTS
-- --------------------------------------------------------
INSERT INTO `subjects` (`id`, `name`, `code`) VALUES
(1, 'Computer Science', 'CS'),
(2, 'Computer Application', 'CA'),
(3, 'Computer Programming', 'CP')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- --------------------------------------------------------
-- SYLLABUSES
-- --------------------------------------------------------
INSERT INTO `syllabuses` (`id`, `subject_id`, `title`, `publisher`, `year`, `form_range`) VALUES
(1, 1, 'Computer Science for Secondary Schools', 'TIE', '2023', 'Form I')
ON DUPLICATE KEY UPDATE `title`=VALUES(`title`);

-- --------------------------------------------------------
-- MODULES (Main Competences = Chapters)
-- --------------------------------------------------------
INSERT INTO `modules` (`id`, `syllabus_id`, `code`, `title`, `form`) VALUES
(1, 1, 'Chapter 1', 'Introduction to Computer Science', 'I'),
(2, 1, 'Chapter 2', 'Computer Systems', 'I'),
(3, 1, 'Chapter 3', 'Computer Hardware', 'I'),
(4, 1, 'Chapter 4', 'Computer Software', 'I'),
(5, 1, 'Chapter 5', 'Computer System Handling and Care', 'I'),
(6, 1, 'Chapter 6', 'Computer System Maintenance', 'I'),
(7, 1, 'Chapter 7', 'Computer System Troubleshooting', 'I'),
(8, 1, 'Chapter 8', 'Problem Solving', 'I');

-- --------------------------------------------------------
-- UNITS (Specific Competences = Sub-topics per Chapter)
-- --------------------------------------------------------
INSERT INTO `units` (`id`, `module_id`, `code`, `title`, `periods_allocated`, `form`) VALUES
-- Chapter 1
(1,  1, '1.1', 'Concept of Computer Science',           3, 'I'),
(2,  1, '1.2', 'Applications of Computer Science',      3, 'I'),
(3,  1, '1.3', 'Fields related to Computer Science',    3, 'I'),
-- Chapter 2
(4,  2, '2.1', 'Concept of computer systems',           3, 'I'),
(5,  2, '2.2', 'Computer generations',                  3, 'I'),
(6,  2, '2.3', 'Classification of computers',           3, 'I'),
-- Chapter 3
(7,  3, '3.1', 'Concept of computer hardware',          2, 'I'),
(8,  3, '3.2', 'Input devices',                         3, 'I'),
(9,  3, '3.3', 'Processing devices',                    3, 'I'),
(10, 3, '3.4', 'Storage devices',                       3, 'I'),
(11, 3, '3.5', 'Output devices',                        3, 'I'),
-- Chapter 4
(12, 4, '4.1', 'Concept of computer software',          2, 'I'),
(13, 4, '4.2', 'System software',                       3, 'I'),
(14, 4, '4.3', 'Application software',                  3, 'I'),
(15, 4, '4.4', 'Software installation',                 3, 'I'),
-- Chapter 5
(16, 5, '5.1', 'Concept of computer handling and care', 2, 'I'),
(17, 5, '5.2', 'Hardware care',                         3, 'I'),
(18, 5, '5.3', 'Software care',                         3, 'I'),
(19, 5, '5.4', 'Safe handling practices',               3, 'I'),
-- Chapter 6
(20, 6, '6.1', 'Concept of computer system maintenance',2, 'I'),
(21, 6, '6.2', 'Preventive maintenance',                3, 'I'),
(22, 6, '6.3', 'Corrective maintenance',                3, 'I'),
(23, 6, '6.4', 'Routine maintenance',                   3, 'I'),
-- Chapter 7
(24, 7, '7.1', 'Concept of computer troubleshooting',   2, 'I'),
(25, 7, '7.2', 'Hardware troubleshooting',              3, 'I'),
(26, 7, '7.3', 'Software troubleshooting',              3, 'I'),
(27, 7, '7.4', 'Performance troubleshooting',           2, 'I'),
(28, 7, '7.5', 'Electrical troubleshooting',            2, 'I'),
-- Chapter 8
(29, 8, '8.1', 'Concept of problem solving',            2, 'I'),
(30, 8, '8.2', 'Steps of problem solving',              3, 'I'),
(31, 8, '8.3', 'Algorithms',                            3, 'I'),
(32, 8, '8.4', 'Construction of algorithms',            3, 'I'),
(33, 8, '8.5', 'Representation of algorithms',          3, 'I'),
(34, 8, '8.6', 'Representation of algorithms using pseudocode', 3, 'I'),
(35, 8, '8.7', 'Iteration control structure in flowcharts', 3, 'I');

-- --------------------------------------------------------
-- ELEMENTS (Learning Activities = one lesson per element)
-- --------------------------------------------------------
INSERT INTO `elements` (`id`, `unit_id`, `code`, `title`) VALUES
-- Unit 1.1
(1,  1,  '(a)', 'Describe the concept of Computer Science (meaning, importance, application)'),
-- Unit 1.2
(2,  2,  '(a)', 'Identify and describe applications of Computer Science in daily life'),
-- Unit 1.3
(3,  3,  '(a)', 'Identify fields related to Computer Science'),
-- Unit 2.1
(4,  4,  '(a)', 'Describe the concept of a computer system and its components'),
-- Unit 2.2
(5,  5,  '(a)', 'Describe the generations of computers and their characteristics'),
-- Unit 2.3
(6,  6,  '(a)', 'Classify computers based on size, purpose, and type'),
-- Unit 3.1
(7,  7,  '(a)', 'Describe the concept of computer hardware'),
-- Unit 3.2
(8,  8,  '(a)', 'Identify and describe input devices and their functions'),
-- Unit 3.3
(9,  9,  '(a)', 'Describe processing devices including the CPU and its components'),
-- Unit 3.4
(10, 10, '(a)', 'Identify and describe storage devices and their functions'),
-- Unit 3.5
(11, 11, '(a)', 'Identify and describe output devices and their functions'),
-- Unit 4.1
(12, 12, '(a)', 'Describe the concept of computer software and its categories'),
-- Unit 4.2
(13, 13, '(a)', 'Describe system software and its types'),
-- Unit 4.3
(14, 14, '(a)', 'Identify and describe application software and its uses'),
-- Unit 4.4
(15, 15, '(a)', 'Demonstrate the process of installing software on a computer'),
-- Unit 5.1
(16, 16, '(a)', 'Describe the concept of computer handling and care'),
-- Unit 5.2
(17, 17, '(a)', 'Demonstrate proper hardware care and maintenance procedures'),
-- Unit 5.3
(18, 18, '(a)', 'Describe and practise software care procedures'),
-- Unit 5.4
(19, 19, '(a)', 'Demonstrate safe handling practices for computer equipment'),
-- Unit 6.1
(20, 20, '(a)', 'Describe the concept of computer system maintenance'),
-- Unit 6.2
(21, 21, '(a)', 'Perform preventive maintenance on a computer system'),
-- Unit 6.3
(22, 22, '(a)', 'Perform corrective maintenance on a computer system'),
-- Unit 6.4
(23, 23, '(a)', 'Perform routine maintenance tasks on a computer'),
-- Unit 7.1
(24, 24, '(a)', 'Describe the concept of computer troubleshooting'),
-- Unit 7.2
(25, 25, '(a)', 'Identify and solve hardware problems in a computer system'),
-- Unit 7.3
(26, 26, '(a)', 'Identify and solve software problems in a computer system'),
-- Unit 7.4
(27, 27, '(a)', 'Diagnose and resolve computer performance problems'),
-- Unit 7.5
(28, 28, '(a)', 'Identify and resolve electrical problems in a computer system'),
-- Unit 8.1
(29, 29, '(a)', 'Describe the concept of problem solving'),
-- Unit 8.2
(30, 30, '(a)', 'Apply the steps of problem solving to solve given problems'),
-- Unit 8.3
(31, 31, '(a)', 'Describe the concept of algorithms and their properties'),
-- Unit 8.4
(32, 32, '(a)', 'Construct algorithms to solve simple problems'),
-- Unit 8.5
(33, 33, '(a)', 'Represent algorithms using flowcharts'),
-- Unit 8.6
(34, 34, '(a)', 'Represent algorithms using pseudocode'),
-- Unit 8.7
(35, 35, '(a)', 'Use iteration control structures in flowcharts');

-- --------------------------------------------------------
-- ELEMENT_METHODS (4 stages per element)
-- Method IDs: 1=Demonstration, 2=Group Discussion, 3=Q&A,
--             4=Hands-on, 5=Brainstorming, 6=TIPS,
--             7=Case Study, 8=Project Based, 9=Practical,
--             12=Research Based
-- time_minutes: intro=5, development=20, design=10, realisation=5
-- --------------------------------------------------------

-- ========== ELEMENT 1: Concept of Computer Science ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(1,3,'introduction',5,
 'Display a picture related to computers and daily life. Ask students: What is Computer Science? Where do we see it in our daily life?',
 'Observe the picture and respond to questions about the concept of Computer Science.',
 'Questions about the meaning and importance of Computer Science are answered correctly.'),
(1,2,'development',20,
 'Provide handouts with content on Computer Science concepts. Guide students in groups to discuss the meaning, importance, and applications of Computer Science. Display examples of CS applications (medicine, agriculture, banking).',
 'Read handouts, discuss in groups, and share findings on the meaning, importance, and applications of Computer Science.',
 'The concept of Computer Science including its meaning, importance, and application is explained correctly.'),
(1,2,'design',10,
 'Ask groups to identify one real-life application of Computer Science in their community and explain how it relates to the concepts learned.',
 'In groups, name a real-life CS application and explain how Computer Science concepts apply to it.',
 'A real-life application of Computer Science is correctly identified and explained.'),
(1,3,'realisation',5,
 'Each student picks a card with a CS application and explains how it demonstrates the concept of Computer Science.',
 'Pick a card and explain the Computer Science concept demonstrated in the given application.',
 'The concept of Computer Science in a given application is correctly explained by each student.');

-- ========== ELEMENT 2: Applications of Computer Science ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(2,5,'introduction',5,
 'Ask students to brainstorm: In how many ways do you use or see computers being used around you?',
 'Brainstorm and share various uses of computers observed in their environment.',
 'Various applications of Computer Science in daily life are mentioned.'),
(2,2,'development',20,
 'Guide students in groups to discuss and list applications of Computer Science in fields such as education, health, banking, agriculture, and entertainment. Use projected images for each field.',
 'Discuss in groups and list applications of Computer Science in different fields. Share findings with the class.',
 'Applications of Computer Science in at least four fields are correctly identified and described.'),
(2,7,'design',10,
 'Present a case study: a hospital using computer systems for patient records. Ask students to identify which Computer Science applications are in use.',
 'Analyse the case study and identify the Computer Science applications being used in the hospital scenario.',
 'Computer Science applications in a given real-world scenario are correctly identified.'),
(2,3,'realisation',5,
 'Ask each student to name one application of Computer Science in a field of their choice and explain its importance.',
 'Name and explain one application of Computer Science in a chosen field.',
 'An application of Computer Science and its importance in a specific field is correctly explained.');

-- ========== ELEMENT 3: Fields related to Computer Science ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(3,5,'introduction',5,
 'Ask students: What careers or jobs do you think involve Computer Science? List responses on the board.',
 'Brainstorm and suggest careers and fields that involve Computer Science.',
 'Fields related to Computer Science are mentioned by students.'),
(3,2,'development',20,
 'Provide handouts listing fields related to Computer Science (Software Engineering, Networking, AI, Cybersecurity, Data Science, etc.). Guide group discussion on each field and its role.',
 'Read handouts and discuss in groups the different fields related to Computer Science and their roles.',
 'Fields related to Computer Science are correctly identified and described.'),
(3,12,'design',10,
 'Assign each group a field to research briefly using textbooks or handouts and present a summary to the class.',
 'Research an assigned field and present a brief summary of what it involves.',
 'A field related to Computer Science is correctly researched and presented.'),
(3,3,'realisation',5,
 'Each student states one field related to Computer Science and describes what professionals in that field do.',
 'State one field related to Computer Science and describe the work done in that field.',
 'A field related to Computer Science and associated professional activities are correctly described.');

-- ========== ELEMENT 4: Concept of a Computer System ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(4,1,'introduction',5,
 'Display a diagram of a computer system showing input, process, output, and storage. Ask: What do you see? What is the role of each part?',
 'Observe the diagram and respond to questions about the parts and roles in a computer system.',
 'Parts of a computer system are identified and their roles described.'),
(4,1,'development',20,
 'Demonstrate a working computer system. Explain the components: hardware, software, data, and users. Use diagrams to show how components interact. Guide Q&A session.',
 'Observe the demonstration, take notes, and participate in Q&A on the components and interaction of a computer system.',
 'Components of a computer system and their interactions are correctly described.'),
(4,2,'design',10,
 'In groups, ask students to draw a simple diagram of a computer system and label all components showing data flow.',
 'Draw and label a diagram of a computer system showing input, processing, output, and storage components.',
 'A correctly labelled diagram of a computer system showing data flow is produced.'),
(4,3,'realisation',5,
 'Each student explains the role of one component of a computer system in their own words.',
 'Explain the role of one assigned computer system component.',
 'The role of a computer system component is correctly explained.');

-- ========== ELEMENT 5: Computer Generations ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(5,3,'introduction',5,
 'Show images of computers from different eras. Ask: How have computers changed over time? What differences do you notice?',
 'Observe images and respond to questions on how computers have evolved over time.',
 'Observable differences between old and modern computers are described.'),
(5,2,'development',20,
 'Provide a chart comparing the five generations of computers (technology used, size, speed, cost, examples). Guide group discussion on characteristics of each generation.',
 'Study the chart, discuss in groups, and identify characteristics of each generation of computers.',
 'Characteristics of all five generations of computers are correctly identified and compared.'),
(5,6,'design',10,
 'Ask groups to arrange generation cards in chronological order and match each generation with its key technology and example.',
 'Arrange generation cards chronologically and match each with its technology and example.',
 'Generations of computers are correctly arranged and matched with their technologies.'),
(5,3,'realisation',5,
 'Each student describes one generation of computers including its technology and an example.',
 'Describe one assigned generation of computers including its defining technology and an example.',
 'A generation of computers with its technology and example is correctly described.');

-- ========== ELEMENT 6: Classification of Computers ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(6,5,'introduction',5,
 'Show images of different types of computers (supercomputer, mainframe, PC, laptop, tablet, smartphone). Ask: Are these all the same type of computer?',
 'Observe images and identify similarities and differences between the computers shown.',
 'Differences between types of computers are observed and described.'),
(6,2,'development',20,
 'Guide students in groups to classify computers by size (supercomputer, mainframe, minicomputer, microcomputer), by purpose (general/special purpose), and by type (analog, digital, hybrid). Use handouts with descriptions and examples.',
 'Using handouts, classify computers by size, purpose, and type. Share classifications with the class.',
 'Computers are correctly classified by size, purpose, and type with appropriate examples.'),
(6,7,'design',10,
 'Present descriptions of three computers and ask groups to classify each by size, purpose, and type with justification.',
 'Classify given computers by size, purpose, and type and justify the classifications.',
 'Given computers are correctly classified with appropriate justifications.'),
(6,3,'realisation',5,
 'Each student names one type of computer and correctly classifies it by size, purpose, and type.',
 'Name one type of computer and classify it by size, purpose, and type.',
 'A computer type is correctly named and classified.');

-- ========== ELEMENT 7: Concept of Computer Hardware ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(7,3,'introduction',5,
 'Point to physical parts of a computer in the classroom. Ask: Which parts can you touch? What do we call these physical parts?',
 'Point to and name physical computer parts in the classroom.',
 'Physical parts of a computer (hardware) are identified.'),
(7,1,'development',20,
 'Demonstrate by disassembling or displaying computer components. Explain the concept of hardware: all physical components of a computer. Categorise into input, output, processing, and storage hardware.',
 'Observe the demonstration and take notes on the definition and categories of computer hardware.',
 'The concept of computer hardware and its categories are correctly described.'),
(7,2,'design',10,
 'Provide a set of hardware images. Ask groups to sort them into input, output, processing, and storage categories.',
 'Sort provided hardware images into the correct categories: input, output, processing, and storage.',
 'Computer hardware components are correctly sorted into their appropriate categories.'),
(7,3,'realisation',5,
 'Each student picks a hardware image and states its name and category.',
 'Pick a hardware image, state its name and the category it belongs to.',
 'A hardware component is correctly named and categorised.');

-- ========== ELEMENT 8: Input Devices ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(8,3,'introduction',5,
 'Hold up a keyboard and mouse. Ask: What are these? What do we use them for? Can you name other devices used to enter data into a computer?',
 'Identify the displayed devices and suggest other devices used to enter data into a computer.',
 'Common input devices are identified and their purpose stated.'),
(8,4,'development',20,
 'Display various input devices (keyboard, mouse, scanner, microphone, webcam, joystick, touchscreen). Demonstrate each device and explain its function. Allow students to handle available devices.',
 'Observe demonstrations and handle available input devices. Identify each device and describe its function.',
 'Input devices are correctly identified and their functions accurately described.'),
(8,4,'design',10,
 'Ask groups to match input devices to their uses from a set of scenario cards (e.g., typing a document, scanning a document, recording audio).',
 'Match input devices to appropriate use scenarios and explain the matching.',
 'Input devices are correctly matched to their appropriate use scenarios.'),
(8,3,'realisation',5,
 'Each student picks an input device card and explains what it is used for.',
 'Pick an input device card and explain the function of that device.',
 'The function of a given input device is correctly explained.');

-- ========== ELEMENT 9: Processing Devices ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(9,1,'introduction',5,
 'Show an image of a CPU and ask: What is this? What does it do inside the computer? Why is it called the brain of the computer?',
 'Observe the CPU image and respond to questions about its role in a computer.',
 'The CPU is identified and its general role described.'),
(9,1,'development',20,
 'Demonstrate or display CPU components (ALU, CU, registers, cache). Explain the function of each component. Use a diagram showing how data flows through the CPU.',
 'Observe the demonstration, study the CPU diagram, and take notes on the components and functions of the CPU.',
 'Components of the CPU and their functions are correctly identified and described.'),
(9,2,'design',10,
 'In groups, ask students to draw and label a diagram of the CPU showing ALU, CU, and registers with arrows showing data flow.',
 'Draw and label a CPU diagram showing ALU, Control Unit, and registers with data flow arrows.',
 'A correctly labelled CPU diagram with data flow is produced.'),
(9,3,'realisation',5,
 'Each student explains the function of one CPU component assigned to them.',
 'Explain the function of the assigned CPU component.',
 'The function of a CPU component is correctly explained.');

-- ========== ELEMENT 10: Storage Devices ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(10,5,'introduction',5,
 'Show a USB drive and hard disk. Ask: What are these? Where do we store our files? What other storage devices do you know?',
 'Identify the displayed storage devices and name other storage devices they know.',
 'Common storage devices are identified.'),
(10,4,'development',20,
 'Display and demonstrate various storage devices (HDD, SSD, USB drive, CD/DVD, memory card, cloud storage). Classify as primary (RAM, ROM) and secondary storage. Explain capacity and speed differences.',
 'Handle and observe storage devices. Classify them as primary or secondary storage and note their capacity and uses.',
 'Storage devices are correctly classified as primary or secondary and their capacities and uses described.'),
(10,2,'design',10,
 'Ask groups to arrange storage devices from smallest to largest capacity and from slowest to fastest access speed.',
 'Arrange storage devices by capacity and speed and justify the order.',
 'Storage devices are correctly arranged by capacity and speed with justification.'),
(10,3,'realisation',5,
 'Each student picks a storage device card and states whether it is primary or secondary storage and gives one use.',
 'Pick a storage device card, classify it as primary or secondary, and give one use.',
 'A storage device is correctly classified and one use stated.');

-- ========== ELEMENT 11: Output Devices ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(11,3,'introduction',5,
 'Point to the monitor and speakers in the classroom. Ask: What are these? What information do they give us? What do we call devices that give us results from the computer?',
 'Identify the monitor and speakers and describe what information they provide.',
 'Output devices are identified and their purpose described.'),
(11,1,'development',20,
 'Display various output devices (monitor, printer, speakers, projector, headphones, plotter). Demonstrate each and explain its function. Classify as softcopy (monitor, speakers) and hardcopy (printer, plotter) output devices.',
 'Observe demonstrations of output devices and classify them as softcopy or hardcopy output devices.',
 'Output devices are correctly identified, demonstrated, and classified as softcopy or hardcopy.'),
(11,2,'design',10,
 'Provide scenario cards (e.g., printing a report, watching a video, listening to music). Ask groups to select the appropriate output device for each scenario.',
 'Match each scenario to the most appropriate output device and justify the choice.',
 'Appropriate output devices are correctly matched to given scenarios with justification.'),
(11,3,'realisation',5,
 'Each student names one output device, states its type (softcopy/hardcopy), and gives one use.',
 'Name one output device, state its type, and give one use.',
 'An output device is correctly named, typed, and one use given.');

-- ========== ELEMENT 12: Concept of Computer Software ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(12,3,'introduction',5,
 'Ask students: Can you touch Microsoft Word? Can you touch Windows? What makes the computer do what we want it to do? Introduce the concept of software.',
 'Respond to questions and discuss what software is and how it differs from hardware.',
 'The difference between hardware and software is stated.'),
(12,2,'development',20,
 'Guide students in groups to discuss: what software is, the two main categories (system software and application software), and examples of each. Use a comparison chart on the board.',
 'Discuss in groups and complete a comparison chart of system software and application software with examples.',
 'The concept of software, its categories, and examples of each are correctly described.'),
(12,6,'design',10,
 'Provide software name cards. Ask groups to sort them into system software and application software categories.',
 'Sort software name cards into system software and application software categories.',
 'Software is correctly sorted into system or application software categories.'),
(12,3,'realisation',5,
 'Each student names the two main categories of software and gives one example of each.',
 'Name the two main categories of software and give one example of each.',
 'Two software categories are correctly named with appropriate examples.');

-- ========== ELEMENT 13: System Software ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(13,1,'introduction',5,
 'Start a computer and ask: What loaded first when we turned on this computer? What is controlling how the computer works right now? Introduce system software.',
 'Observe the computer start-up and respond to questions about what controls the computer operations.',
 'System software is identified as the software that controls computer operations.'),
(13,1,'development',20,
 'Demonstrate system software on a computer: show the operating system (Windows/Linux), utility programs (disk cleanup, antivirus), and language translators. Explain the function of each type.',
 'Observe demonstrations and take notes on types and functions of system software.',
 'Types of system software and their functions are correctly identified and described.'),
(13,2,'design',10,
 'Ask groups to list all system software visible on the lab computers and classify each as OS, utility, or language translator.',
 'Identify and list system software on lab computers and classify each type.',
 'System software on a computer is correctly identified and classified.'),
(13,3,'realisation',5,
 'Each student names one type of system software and explains its function.',
 'Name one type of system software and explain its function.',
 'A type of system software and its function are correctly stated.');

-- ========== ELEMENT 14: Application Software ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(14,5,'introduction',5,
 'Ask: What programs do you use on a computer or phone to do specific tasks like writing, playing music, or browsing? These are application software.',
 'Brainstorm and name programs they use for specific tasks.',
 'Common application software used in daily life is mentioned.'),
(14,2,'development',20,
 'Guide groups to identify and classify application software: word processors, spreadsheets, browsers, media players, educational software, accounting software. Discuss examples and uses.',
 'Classify provided application software into categories and describe the use of each.',
 'Application software is correctly classified into categories with appropriate examples and uses.'),
(14,4,'design',10,
 'Allow students to open two application programs on the lab computers and identify their category and use.',
 'Open two application programs, identify their category, and describe their use.',
 'Application programs are correctly identified, categorised, and their uses described.'),
(14,3,'realisation',5,
 'Each student names one application software, states its category, and gives its main use.',
 'Name one application software, state its category, and give its main use.',
 'Application software is correctly named, categorised, and its main use stated.');

-- ========== ELEMENT 15: Software Installation ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(15,3,'introduction',5,
 'Ask: How do we get new programs onto our computers? What steps do you think are involved in installing software?',
 'Suggest steps they think are involved in installing software on a computer.',
 'General steps for installing software are suggested.'),
(15,1,'development',20,
 'Demonstrate the software installation process step by step: downloading/inserting media, running the installer, accepting license, choosing installation path, completing installation. Show on projector.',
 'Observe the demonstration and note each step of the software installation process.',
 'The steps of the software installation process are correctly identified and described.'),
(15,9,'design',10,
 'Guide students in pairs to install a simple free application on the lab computers following the demonstrated steps.',
 'In pairs, install an assigned application on the lab computer following the correct installation steps.',
 'Software is correctly installed on a computer following the proper procedure.'),
(15,3,'realisation',5,
 'Each student lists the steps of software installation in the correct order.',
 'List the steps of software installation in the correct order.',
 'Steps of software installation are listed in the correct order.');

-- ========== ELEMENT 16: Concept of Computer Handling and Care ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(16,3,'introduction',5,
 'Show an image of a damaged computer and a well-maintained one. Ask: What differences do you see? Why do you think one is damaged? How can we prevent this?',
 'Observe images and discuss reasons for computer damage and how it can be prevented.',
 'Reasons for computer damage and prevention measures are suggested.'),
(16,2,'development',20,
 'Guide group discussion on the concept of computer handling and care: definition, importance, general principles (keep clean, avoid liquids, handle with care, proper shutdown, surge protection).',
 'Discuss and list principles of computer handling and care and explain the importance of each.',
 'The concept of computer handling and care and its importance are correctly described.'),
(16,7,'design',10,
 'Present a case study of a school computer lab where computers break down frequently. Ask groups to identify poor handling practices and suggest improvements.',
 'Analyse the case study, identify poor handling practices, and suggest correct handling procedures.',
 'Poor handling practices are correctly identified and appropriate care procedures suggested.'),
(16,3,'realisation',5,
 'Each student states one principle of computer handling and care and explains why it is important.',
 'State one principle of computer handling and care and explain its importance.',
 'A principle of computer handling and care and its importance are correctly stated.');

-- ========== ELEMENT 17: Hardware Care ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(17,1,'introduction',5,
 'Show cleaning tools (compressed air, soft cloth, brush). Ask: What are these used for? Do you think cleaning is part of caring for a computer?',
 'Identify cleaning tools and suggest how they are used in computer care.',
 'Hardware cleaning tools are identified and their use suggested.'),
(17,9,'development',20,
 'Demonstrate hardware care procedures: cleaning the keyboard, monitor, mouse, and system unit. Show how to check and secure cable connections. Demonstrate proper shutdown procedure.',
 'Observe demonstrations and practise hardware care procedures on available equipment.',
 'Hardware care procedures are correctly demonstrated on computer components.'),
(17,9,'design',10,
 'Guide students in groups to perform a hardware care routine on the lab computers under supervision.',
 'Perform a hardware care routine on the lab computer including cleaning and checking connections.',
 'A hardware care routine is correctly performed on a computer system.'),
(17,3,'realisation',5,
 'Each student describes one hardware care procedure and explains how it protects the computer.',
 'Describe one hardware care procedure and explain how it protects the computer.',
 'A hardware care procedure and its protective function are correctly described.');

-- ========== ELEMENT 18: Software Care ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(18,5,'introduction',5,
 'Ask: Have you ever lost data because of a virus or accidental deletion? What can we do to protect our software and data?',
 'Share experiences of software or data loss and suggest ways to protect software and data.',
 'Software care needs are identified based on shared experiences.'),
(18,1,'development',20,
 'Demonstrate software care procedures: running antivirus scan, updating software, creating backups, avoiding pirated software, proper file organisation. Show on a lab computer.',
 'Observe demonstrations and take notes on software care procedures and their importance.',
 'Software care procedures are correctly identified and their importance explained.'),
(18,9,'design',10,
 'Guide students to perform software care tasks on lab computers: run a virus scan, check for updates, and back up a file.',
 'Perform software care tasks including running a virus scan, checking updates, and backing up a file.',
 'Software care tasks are correctly performed on a lab computer.'),
(18,3,'realisation',5,
 'Each student names one software care procedure and explains why it is important.',
 'Name one software care procedure and explain its importance.',
 'A software care procedure and its importance are correctly stated.');

-- ========== ELEMENT 19: Safe Handling Practices ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(19,3,'introduction',5,
 'Ask: Is it safe to use a computer in the rain? What about eating while using a computer? What safety rules should we follow?',
 'Respond to questions and suggest safety rules for using computers.',
 'Basic computer safety rules are suggested.'),
(19,2,'development',20,
 'Guide group discussion on safe handling practices: ergonomic posture, safe distance from monitor, avoiding static electricity, not blocking ventilation, handling cables safely, electrical safety.',
 'Discuss and list safe handling practices for computer use. Demonstrate correct sitting posture and monitor distance.',
 'Safe handling practices for computer use are correctly listed and demonstrated.'),
(19,10,'design',10,
 'Role play: some students demonstrate incorrect handling practices while others identify and correct them.',
 'In pairs, role play incorrect handling practices and identify the correct safe practices.',
 'Incorrect handling practices are identified and correct safe practices demonstrated.'),
(19,3,'realisation',5,
 'Each student states one safe handling practice and explains the risk it prevents.',
 'State one safe handling practice and explain the risk it prevents.',
 'A safe handling practice and the risk it prevents are correctly stated.');

-- ========== ELEMENT 20: Concept of Computer System Maintenance ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(20,3,'introduction',5,
 'Ask: Do cars need regular servicing? Do computers also need regular maintenance? What is the difference between maintenance and repair?',
 'Respond to questions and discuss the concept of maintenance and how it applies to computers.',
 'The concept of computer maintenance and its importance are described.'),
(20,2,'development',20,
 'Guide group discussion on the concept of computer system maintenance: definition, importance, and types (preventive, corrective, routine). Use a chart to compare the three types.',
 'Discuss, complete a comparison chart of the three types of maintenance, and explain the importance of each.',
 'The concept of computer system maintenance, its types, and importance are correctly described.'),
(20,2,'design',10,
 'Present maintenance scenario cards. Ask groups to classify each scenario as preventive, corrective, or routine maintenance.',
 'Classify given maintenance scenarios as preventive, corrective, or routine maintenance.',
 'Maintenance scenarios are correctly classified into the appropriate type of maintenance.'),
(20,3,'realisation',5,
 'Each student defines computer system maintenance and names the three types.',
 'Define computer system maintenance and name its three types.',
 'Computer system maintenance is correctly defined and its three types named.');

-- ========== ELEMENT 21: Preventive Maintenance ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(21,1,'introduction',5,
 'Ask: What tasks do you do regularly to prevent your phone from having problems? How can the same idea apply to a computer?',
 'Suggest regular tasks done to prevent phone problems and relate these to computer preventive maintenance.',
 'The concept of preventive maintenance is related to familiar experiences.'),
(21,9,'development',20,
 'Demonstrate preventive maintenance tasks: disk cleanup, defragmentation, checking for updates, scanning for viruses, cleaning dust from vents and keyboard, inspecting cables.',
 'Observe demonstrations and note preventive maintenance tasks for both hardware and software.',
 'Preventive maintenance tasks for hardware and software are correctly identified.'),
(21,9,'design',10,
 'Guide students to perform a preventive maintenance checklist on lab computers (disk cleanup, virus scan, cable inspection).',
 'Perform preventive maintenance tasks on a lab computer following the provided checklist.',
 'Preventive maintenance tasks are correctly performed on a computer system.'),
(21,3,'realisation',5,
 'Each student names two preventive maintenance tasks and explains what problem each prevents.',
 'Name two preventive maintenance tasks and explain what problem each prevents.',
 'Two preventive maintenance tasks and the problems they prevent are correctly stated.');

-- ========== ELEMENT 22: Corrective Maintenance ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(22,7,'introduction',5,
 'Present a scenario: a school computer crashes and loses all work. Ask: What went wrong? What should be done to fix it?',
 'Analyse the scenario and suggest steps to fix the crashed computer.',
 'The need for corrective maintenance is identified from a given scenario.'),
(22,1,'development',20,
 'Demonstrate corrective maintenance procedures: identifying a fault, diagnosing the cause, replacing faulty hardware, reinstalling corrupted software, restoring backed up data.',
 'Observe the demonstration and note the steps of corrective maintenance for both hardware and software faults.',
 'Steps of corrective maintenance for hardware and software faults are correctly identified.'),
(22,9,'design',10,
 'Present a computer with a simulated software fault. Guide students in groups to diagnose and perform corrective maintenance.',
 'Diagnose the simulated fault and perform corrective maintenance to restore the computer to working order.',
 'A simulated fault is correctly diagnosed and appropriate corrective maintenance performed.'),
(22,3,'realisation',5,
 'Each student describes the steps of corrective maintenance for a given fault scenario.',
 'Describe the corrective maintenance steps for an assigned fault scenario.',
 'Corrective maintenance steps for a given fault are correctly described.');

-- ========== ELEMENT 23: Routine Maintenance ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(23,5,'introduction',5,
 'Ask: What regular tasks should be performed on a computer every day, every week, and every month? Why is a schedule important?',
 'Suggest routine tasks to be performed daily, weekly, and monthly on a computer.',
 'Routine maintenance tasks at different intervals are suggested.'),
(23,2,'development',20,
 'Guide group discussion on routine maintenance: daily tasks (shut down properly, clean keyboard), weekly tasks (virus scan, backup), monthly tasks (disk cleanup, check updates, hardware inspection).',
 'Discuss and compile a routine maintenance schedule with daily, weekly, and monthly tasks.',
 'A routine maintenance schedule with appropriate daily, weekly, and monthly tasks is compiled.'),
(23,9,'design',10,
 'Guide students to create a one-month maintenance schedule for their lab computers and perform one routine task.',
 'Create a one-month maintenance schedule and perform one assigned routine maintenance task.',
 'A routine maintenance schedule is created and one task correctly performed.'),
(23,3,'realisation',5,
 'Each student states one daily, one weekly, and one monthly routine maintenance task.',
 'State one daily, one weekly, and one monthly routine computer maintenance task.',
 'Routine maintenance tasks at three different intervals are correctly stated.');

-- ========== ELEMENT 24: Concept of Computer Troubleshooting ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(24,3,'introduction',5,
 'Ask: Has your computer ever stopped working or behaved unexpectedly? What did you do? Introduce the concept of troubleshooting.',
 'Share experiences of computer problems and describe what was done to resolve them.',
 'The concept of troubleshooting is related to personal experiences.'),
(24,2,'development',20,
 'Guide group discussion on the concept of troubleshooting: definition, importance, general troubleshooting steps (identify, research, test, solve, document). Discuss types of computer problems.',
 'Discuss the concept and steps of troubleshooting and identify types of computer problems.',
 'The concept of troubleshooting, its steps, and types of computer problems are correctly described.'),
(24,6,'design',10,
 'Present problem scenario cards. Ask groups to apply the troubleshooting steps to identify the likely cause and suggest a solution.',
 'Apply troubleshooting steps to assigned problem scenarios and suggest solutions.',
 'Troubleshooting steps are correctly applied to given problem scenarios.'),
(24,3,'realisation',5,
 'Each student defines troubleshooting and lists the general troubleshooting steps in order.',
 'Define troubleshooting and list the general troubleshooting steps in correct order.',
 'Troubleshooting is correctly defined and its steps listed in order.');

-- ========== ELEMENT 25: Hardware Troubleshooting ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(25,1,'introduction',5,
 'Ask: What hardware problems have you seen or heard about? (Computer won''t start, no display, keyboard not working). How would you begin to solve these?',
 'Share hardware problems encountered and suggest how to begin solving them.',
 'Common hardware problems are identified.'),
(25,7,'development',20,
 'Use case studies of common hardware problems (no power, no display, keyboard failure, overheating). Demonstrate or describe how to diagnose and resolve each problem.',
 'Study hardware problem case studies and identify the diagnosis and solution for each problem.',
 'Common hardware problems are correctly diagnosed and appropriate solutions identified.'),
(25,9,'design',10,
 'Present a computer with a simulated hardware problem. Guide groups to diagnose and resolve the problem using the troubleshooting steps.',
 'Diagnose the simulated hardware problem and apply the appropriate troubleshooting solution.',
 'A hardware problem is correctly diagnosed and resolved using the troubleshooting procedure.'),
(25,3,'realisation',5,
 'Each student describes how to troubleshoot one assigned hardware problem.',
 'Describe the troubleshooting steps for an assigned hardware problem.',
 'Hardware troubleshooting steps for a given problem are correctly described.');

-- ========== ELEMENT 26: Software Troubleshooting ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(26,5,'introduction',5,
 'Ask: What software problems have you experienced? (Program crashes, slow computer, virus, blue screen). How did you or others try to fix them?',
 'Share software problems experienced and describe how they were handled.',
 'Common software problems are identified from shared experiences.'),
(26,1,'development',20,
 'Demonstrate solutions to common software problems: restarting an unresponsive program, running System Restore, scanning for malware, updating drivers, reinstalling software.',
 'Observe demonstrations and note the troubleshooting steps for each software problem.',
 'Common software problems are correctly identified and appropriate troubleshooting steps described.'),
(26,9,'design',10,
 'Guide students to diagnose and resolve a simulated software problem (e.g., program not responding) on the lab computers.',
 'Diagnose and apply the correct troubleshooting steps to resolve a simulated software problem.',
 'A software problem is correctly diagnosed and resolved.'),
(26,3,'realisation',5,
 'Each student describes the steps to troubleshoot one assigned software problem.',
 'Describe the troubleshooting steps for an assigned software problem.',
 'Software troubleshooting steps for a given problem are correctly described.');

-- ========== ELEMENT 27: Performance Troubleshooting ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(27,3,'introduction',5,
 'Ask: Have you ever used a very slow computer? What causes a computer to run slowly? What can be done to make it faster?',
 'Suggest causes of slow computer performance and ways to improve it.',
 'Causes of poor computer performance are suggested.'),
(27,2,'development',20,
 'Guide group discussion on performance problems and solutions: too many startup programs, low RAM, fragmented disk, overheating, malware. Demonstrate Task Manager use to identify resource-heavy programs.',
 'Discuss causes of performance problems and use Task Manager to identify programs consuming excessive resources.',
 'Causes of performance problems are correctly identified and appropriate solutions described.'),
(27,9,'design',10,
 'Guide students to check and optimise performance on a lab computer (disable startup programs, run disk cleanup, check Task Manager).',
 'Perform performance optimisation tasks on a lab computer and observe the effect.',
 'Performance optimisation tasks are correctly performed on a computer.'),
(27,3,'realisation',5,
 'Each student names one cause of poor computer performance and describes how to resolve it.',
 'Name one cause of poor computer performance and describe its solution.',
 'A performance problem cause and its solution are correctly described.');

-- ========== ELEMENT 28: Electrical Troubleshooting ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(28,3,'introduction',5,
 'Ask: What happens to a computer during a power surge? Have you seen a computer damaged by electricity? What electrical problems can affect computers?',
 'Respond to questions and share experiences of electrical problems affecting computers.',
 'Electrical problems that can affect computers are identified.'),
(28,2,'development',20,
 'Guide group discussion on electrical troubleshooting: power surges, loose connections, UPS use, earthing/grounding, identifying burnt components. Emphasise safety: always unplug before working on internal components.',
 'Discuss electrical problems and their solutions. Note safety rules for working with electrical components.',
 'Electrical problems are correctly identified with appropriate solutions and safety measures stated.'),
(28,7,'design',10,
 'Present case studies of electrical problems (power surge damage, computer not powering on due to loose cable). Ask groups to diagnose and suggest safe solutions.',
 'Diagnose electrical problems in given case studies and suggest safe troubleshooting solutions.',
 'Electrical problems are correctly diagnosed and safe solutions suggested.'),
(28,3,'realisation',5,
 'Each student states one electrical problem that can affect a computer and describes a safe solution.',
 'State one electrical problem and describe a safe solution.',
 'An electrical problem and its safe solution are correctly stated.');

-- ========== ELEMENT 29: Concept of Problem Solving ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(29,3,'introduction',5,
 'Ask: What is a problem? Can you give an example of a problem you solved today? How did you decide what to do?',
 'Give examples of problems solved in daily life and describe how they decided on a solution.',
 'The concept of a problem and problem solving is related to daily life experiences.'),
(29,2,'development',20,
 'Guide group discussion on the concept of problem solving: definition, types of problems (well-defined, ill-defined), importance of problem solving in computing.',
 'Discuss and describe the concept of problem solving, types of problems, and its importance in computing.',
 'The concept of problem solving, types of problems, and its importance in computing are correctly described.'),
(29,7,'design',10,
 'Present two problems (one well-defined, one ill-defined). Ask groups to classify each and explain the classification.',
 'Classify given problems as well-defined or ill-defined and justify the classification.',
 'Problems are correctly classified as well-defined or ill-defined with justification.'),
(29,3,'realisation',5,
 'Each student defines problem solving and gives one example of a well-defined problem in computing.',
 'Define problem solving and give one example of a well-defined computing problem.',
 'Problem solving is correctly defined and a well-defined computing problem example given.');

-- ========== ELEMENT 30: Steps of Problem Solving ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(30,3,'introduction',5,
 'Ask: If I ask you to find the sum of numbers 1 to 100, what would you do first? Walk through the thought process step by step.',
 'Describe the steps they would take to solve the given problem.',
 'A logical sequence of steps for solving a problem is described.'),
(30,2,'development',20,
 'Guide group discussion on the steps of problem solving: (1) Understand the problem, (2) Plan the solution, (3) Implement the solution, (4) Test and evaluate. Use a worked example for each step.',
 'Discuss each step of problem solving and apply them to a worked example.',
 'The steps of problem solving are correctly identified and applied to a given example.'),
(30,2,'design',10,
 'Give groups a simple problem. Ask them to apply the four steps of problem solving and document each step.',
 'Apply the four steps of problem solving to an assigned problem and document each step.',
 'The four steps of problem solving are correctly applied and documented for a given problem.'),
(30,3,'realisation',5,
 'Each student lists the steps of problem solving in the correct order.',
 'List the steps of problem solving in the correct order.',
 'Steps of problem solving are listed in the correct order.');

-- ========== ELEMENT 31: Algorithms ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(31,3,'introduction',5,
 'Ask: If I want to make tea, what steps would I follow? Write their answers on the board. Explain that this is an algorithm.',
 'List the steps for making tea and understand that a step-by-step solution is called an algorithm.',
 'The concept of an algorithm is related to a familiar daily activity.'),
(31,2,'development',20,
 'Guide group discussion on algorithms: definition, properties (input, output, definiteness, finiteness, effectiveness), and examples from daily life and computing.',
 'Discuss the definition and properties of algorithms and identify examples from daily life and computing.',
 'The concept of an algorithm, its properties, and examples are correctly described.'),
(31,2,'design',10,
 'Ask groups to write an algorithm for a simple daily task (e.g., logging into a computer, making a phone call) following the properties of a good algorithm.',
 'Write an algorithm for an assigned daily task following the correct properties of a good algorithm.',
 'An algorithm for a daily task is correctly written following the properties of a good algorithm.'),
(31,3,'realisation',5,
 'Each student defines an algorithm and lists three properties of a good algorithm.',
 'Define an algorithm and list three properties of a good algorithm.',
 'An algorithm is correctly defined and three properties listed.');

-- ========== ELEMENT 32: Construction of Algorithms ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(32,1,'introduction',5,
 'Show a written algorithm for adding two numbers. Ask: What do you notice about its structure? How is it different from a paragraph?',
 'Observe the algorithm and describe its structure compared to a paragraph.',
 'The structured nature of an algorithm compared to ordinary text is described.'),
(32,1,'development',20,
 'Demonstrate construction of algorithms for simple problems: finding the largest of two numbers, calculating area of a rectangle. Show each step clearly with numbered instructions and decision points.',
 'Observe demonstrations and copy the constructed algorithms. Ask questions on unclear steps.',
 'Algorithms for simple problems are correctly constructed using numbered steps and decision points.'),
(32,9,'design',10,
 'Give groups a simple problem. Ask them to construct a step-by-step algorithm with a clear start, numbered steps, decisions if needed, and a clear end.',
 'Construct an algorithm for an assigned simple problem with clear start, numbered steps, and end.',
 'An algorithm for a given problem is correctly constructed with all required components.'),
(32,3,'realisation',5,
 'Each student constructs a simple algorithm for an assigned problem.',
 'Construct an algorithm for the assigned simple problem.',
 'An algorithm for a given problem is correctly constructed.');

-- ========== ELEMENT 33: Representation of Algorithms (Flowcharts) ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(33,1,'introduction',5,
 'Show a simple flowchart on the board. Ask: What do you see? What do the different shapes mean? Have you seen something like this before?',
 'Observe the flowchart and identify the different shapes and what they might represent.',
 'Flowchart shapes are observed and their purpose guessed.'),
(33,1,'development',20,
 'Demonstrate flowchart symbols: terminal (oval), process (rectangle), decision (diamond), input/output (parallelogram), flow arrows. Draw flowcharts for two simple algorithms on the board.',
 'Copy flowchart symbols and their meanings. Draw a simple flowchart following the demonstrated steps.',
 'Flowchart symbols are correctly identified and a simple flowchart is drawn.'),
(33,9,'design',10,
 'Guide students to draw a flowchart for an assigned simple algorithm (e.g., check if a number is odd or even).',
 'Draw a correctly labelled flowchart for the assigned algorithm using appropriate symbols.',
 'A flowchart using correct symbols is drawn for a given algorithm.'),
(33,3,'realisation',5,
 'Each student draws the correct flowchart symbol for an assigned process or action.',
 'Draw the correct flowchart symbol for the assigned process or action.',
 'Flowchart symbols are correctly drawn for given processes.');

-- ========== ELEMENT 34: Representation Using Pseudocode ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(34,3,'introduction',5,
 'Ask: Is a flowchart easy to write when an algorithm has many steps? Introduce pseudocode as a simpler text-based way to represent algorithms.',
 'Respond to questions and discuss the need for a simpler way to represent complex algorithms.',
 'The need for pseudocode as an alternative to flowcharts is understood.'),
(34,1,'development',20,
 'Demonstrate pseudocode for simple algorithms using keywords: START, END, INPUT, OUTPUT, IF...THEN...ELSE, WHILE...DO. Compare pseudocode with the equivalent flowchart.',
 'Observe demonstrations and write pseudocode for simple algorithms following the demonstrated keywords and structure.',
 'Pseudocode using correct keywords and structure is written for simple algorithms.'),
(34,9,'design',10,
 'Guide students to write pseudocode for an assigned algorithm (e.g., find the largest of three numbers).',
 'Write pseudocode for the assigned algorithm using correct keywords and structure.',
 'Pseudocode for a given algorithm is correctly written.'),
(34,3,'realisation',5,
 'Each student writes pseudocode for a simple assigned problem.',
 'Write pseudocode for the assigned simple problem.',
 'Pseudocode for a given problem is correctly written.');

-- ========== ELEMENT 35: Iteration Control Structures in Flowcharts ==========
INSERT INTO `element_methods` (`element_id`,`method_id`,`stage`,`time_minutes`,`teaching_activity`,`learning_activity`,`assessment_criteria`) VALUES
(35,3,'introduction',5,
 'Ask: If I want a program to print "Hello" 10 times, do I draw the same step 10 times in a flowchart? Introduce iteration (loops) as a solution.',
 'Respond to the question and discuss how repetition can be handled in flowcharts without repeating steps.',
 'The need for iteration control structures in flowcharts is understood.'),
(35,1,'development',20,
 'Demonstrate iteration control structures in flowcharts: count-controlled loop (FOR loop equivalent) and condition-controlled loop (WHILE loop equivalent). Draw flowcharts for each type.',
 'Observe demonstrations and copy flowcharts for count-controlled and condition-controlled iteration.',
 'Iteration control structures in flowcharts are correctly identified and drawn.'),
(35,9,'design',10,
 'Guide students to draw a flowchart that uses an iteration structure to solve an assigned repetitive problem (e.g., print numbers 1 to 5).',
 'Draw a flowchart using an iteration control structure for the assigned repetitive problem.',
 'A flowchart with a correct iteration control structure is drawn for a given problem.'),
(35,3,'realisation',5,
 'Each student draws an iteration control structure in a flowchart for an assigned simple repetitive task.',
 'Draw a flowchart iteration control structure for the assigned repetitive task.',
 'An iteration control structure in a flowchart is correctly drawn for a given task.');

-- --------------------------------------------------------
-- ELEMENT_RESOURCES
-- Computer=1, Projector=2, Internet=3, Handouts=12,
-- Textbook=14, Whiteboard=15, Video tutorials=13, Charts=21
-- --------------------------------------------------------
INSERT INTO `element_resources` (`element_id`, `resource_id`) VALUES
(1,1),(1,2),(1,12),(1,14),
(2,1),(2,2),(2,12),(2,14),
(3,1),(3,2),(3,12),(3,14),
(4,1),(4,2),(4,12),(4,14),
(5,1),(5,2),(5,12),(5,14),(5,21),
(6,1),(6,2),(6,12),(6,14),
(7,1),(7,2),(7,12),(7,14),
(8,1),(8,2),(8,12),(8,14),
(9,1),(9,2),(9,12),(9,14),(9,21),
(10,1),(10,2),(10,12),(10,14),
(11,1),(11,2),(11,12),(11,14),
(12,1),(12,2),(12,12),(12,14),
(13,1),(13,2),(13,3),(13,14),
(14,1),(14,2),(14,3),(14,14),
(15,1),(15,2),(15,3),(15,13),
(16,1),(16,2),(16,12),(16,14),
(17,1),(17,2),(17,12),(17,14),
(18,1),(18,2),(18,3),(18,14),
(19,1),(19,2),(19,12),(19,14),
(20,1),(20,2),(20,12),(20,14),(20,21),
(21,1),(21,2),(21,3),(21,14),
(22,1),(22,2),(22,12),(22,14),
(23,1),(23,2),(23,12),(23,14),
(24,1),(24,2),(24,12),(24,14),
(25,1),(25,2),(25,12),(25,14),
(26,1),(26,2),(26,3),(26,14),
(27,1),(27,2),(27,3),(27,14),
(28,1),(28,2),(28,12),(28,14),
(29,1),(29,2),(29,12),(29,14),
(30,1),(30,2),(30,12),(30,14),
(31,1),(31,2),(31,12),(31,14),(31,15),
(32,1),(32,2),(32,12),(32,14),(32,15),
(33,1),(33,2),(33,12),(33,14),(33,15),
(34,1),(34,2),(34,12),(34,14),(34,15),
(35,1),(35,2),(35,12),(35,14),(35,15);