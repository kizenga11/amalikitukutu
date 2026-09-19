-- ============================================================
-- SEED: Computer Application Syllabus (VETA Vocational Stream)
-- Subject ID: 2 (already exists as 'Computer Application', code 'CA')
-- Continues from existing IDs:
--   syllabuses: id=2
--   modules:    id=9 onwards
--   units:      id=36 onwards
--   elements:   id=36 onwards
--   element_methods: id=141 onwards
--   element_resources: id=149 onwards
-- Teaching methods & resources reuse existing IDs
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- ============================================================
-- SYLLABUS
-- ============================================================
INSERT INTO `syllabuses` (`id`, `subject_id`, `title`, `publisher`, `year`, `form_range`) VALUES
(2, 2, 'Computer Application Syllabus for Ordinary Secondary Education Vocational Stream', 'VETA', '2025', 'Form I-IV');

-- ============================================================
-- MODULES (syllabus_id=2)
-- Form I: Module 1.0 Introduction to Computer, Module 2.0 Office Application (Word Processing)
-- Form II: Module 2.0 Office Application (Spreadsheets, Database, Presentation)
-- Form III: Module 2.0 Office Application (Desktop Publishing), Module 3.0 Internet & Digital Marketing
-- Form IV: Module 3.0 Implementing Internet and Digital Marketing (cont.)
-- ============================================================
INSERT INTO `modules` (`id`, `syllabus_id`, `code`, `title`, `form`) VALUES
(9,  2, '1.0', 'Introduction to Computer',              'I'),
(10, 2, '2.0', 'Office Application',                    'I'),
(11, 2, '2.0', 'Office Application',                    'II'),
(12, 2, '2.0', 'Office Application',                    'III'),
(13, 2, '3.0', 'Implementing Internet and Digital Marketing', 'III'),
(14, 2, '3.0', 'Implementing Internet and Digital Marketing', 'IV');

-- ============================================================
-- UNITS
-- ============================================================
-- Form I: Module 9 (Intro to Computer)
INSERT INTO `units` (`id`, `module_id`, `code`, `title`, `periods_allocated`, `form`) VALUES
(36, 9,  '1.1', 'Organising a microcomputer and its peripherals', 12, 'I'),

-- Form I: Module 10 (Office Application - Word Processing)
(37, 10, '2.1', 'Word Processing',                               12, 'I'),

-- Form II: Module 11 (Office Application - Spreadsheets, DB, Presentation)
(38, 11, '2.2', 'Working with Spreadsheets',                     34, 'II'),
(39, 11, '2.3', 'Working with Database Applications',            26, 'II'),
(40, 11, '2.4', 'Working with Presentation Applications',        26, 'II'),

-- Form III: Module 12 (Office Application - Desktop Publishing)
(41, 12, '2.5', 'Working with Desktop Publishing',               31, 'III'),

-- Form III: Module 13 (Internet & Digital Marketing)
(42, 13, '3.1', 'Administering Internet Applications',           31, 'III'),

-- Form IV: Module 14 (Digital Marketing)
(43, 14, '3.3', 'Administering Digital Marketing',               42, 'IV');

-- ============================================================
-- ELEMENTS
-- ============================================================

-- Unit 36: 1.1 Organising a microcomputer and its peripherals
INSERT INTO `elements` (`id`, `unit_id`, `code`, `title`) VALUES
(36, 36, '(a)', 'Familiarizing yourself with a computer'),
(37, 36, '(b)', 'Connecting peripherals to a microcomputer'),
(38, 36, '(c)', 'Connecting a computer to the Internet');

-- Unit 37: 2.1 Word Processing
INSERT INTO `elements` (`id`, `unit_id`, `code`, `title`) VALUES
(39, 37, '(a)', 'Introduction to word processing'),
(40, 37, '(b)', 'Working with Microsoft Office Word');

-- Unit 38: 2.2 Working with Spreadsheets
INSERT INTO `elements` (`id`, `unit_id`, `code`, `title`) VALUES
(41, 38, '(a)', 'Performing spreadsheet creation, formatting, data entry, organization, sort and filter'),
(42, 38, '(b)', 'Performing basic calculations and formulas'),
(43, 38, '(c)', 'Performing data validation and conditional formatting'),
(44, 38, '(d)', 'Performing data import and export'),
(45, 38, '(e)', 'Performing page setup and printing');

-- Unit 39: 2.3 Working with Database Applications
INSERT INTO `elements` (`id`, `unit_id`, `code`, `title`) VALUES
(46, 39, '(a)', 'Familiarizing with a database application'),
(47, 39, '(b)', 'Creating tables and entering data'),
(48, 39, '(c)', 'Creating queries'),
(49, 39, '(d)', 'Creating forms'),
(50, 39, '(e)', 'Creating reports');

-- Unit 40: 2.4 Working with Presentation Applications
INSERT INTO `elements` (`id`, `unit_id`, `code`, `title`) VALUES
(51, 40, '(a)', 'Creating, formatting presentations and organizing slide content'),
(52, 40, '(b)', 'Inserting Images, Graphics and SmartArt'),
(53, 40, '(c)', 'Incorporating charts and tables'),
(54, 40, '(d)', 'Creating slide transitions, slide master and animations'),
(55, 40, '(e)', 'Creating presentations for remote meetings');

-- Unit 41: 2.5 Working with Desktop Publishing
INSERT INTO `elements` (`id`, `unit_id`, `code`, `title`) VALUES
(56, 41, '(a)', 'Performing document creation and formatting'),
(57, 41, '(b)', 'Performing image insertion, editing and use of graphics and design elements'),
(58, 41, '(c)', 'Performing typography and font management'),
(59, 41, '(d)', 'Designing office and business products');

-- Unit 42: 3.1 Administering Internet Applications
INSERT INTO `elements` (`id`, `unit_id`, `code`, `title`) VALUES
(60, 42, '(a)', 'Conducting internet search'),
(61, 42, '(b)', 'Working with email application'),
(62, 42, '(c)', 'Administering social media accounts'),
(63, 42, '(d)', 'Administering webinars and virtual meetings'),
(64, 42, '(e)', 'Creating online forms and surveys'),
(65, 42, '(f)', 'Working with cloud storage and file sharing'),
(66, 42, '(g)', 'Recognising internet threats'),
(67, 42, '(h)', 'Using Virtual Private Network (VPN) and proxy');

-- Unit 43: 3.3 Administering Digital Marketing
INSERT INTO `elements` (`id`, `unit_id`, `code`, `title`) VALUES
(68, 43, '(a)', 'Creating email marketing'),
(69, 43, '(b)', 'Creating digital contents'),
(70, 43, '(c)', 'Customizing blogs for publication'),
(71, 43, '(d)', 'Conducting online advertising'),
(72, 43, '(e)', 'Conducting market analytics and reporting'),
(73, 43, '(f)', 'Maintaining customer relationship (CRM) systems'),
(74, 43, '(g)', 'Working with artificial intelligence (AI)');

-- ============================================================
-- ELEMENT_METHODS
-- Teaching method IDs (existing):
--   1=Demonstration, 2=Group Discussion, 3=Q&A, 4=Hands-on Activity
--   5=Brainstorming, 6=Think-Ink-Pair-Share, 7=Case Study
--   8=Project Based Activity, 9=Practical Activity, 10=Role Play
--   11=Field Visit, 12=Research Based Activity
-- Stages: introduction, development, design, realisation
-- ============================================================

INSERT INTO `element_methods` (`id`, `element_id`, `method_id`, `stage`, `time_minutes`, `teaching_activity`, `learning_activity`, `assessment_criteria`) VALUES

-- Element 36(a): Familiarizing yourself with a computer
(141, 36, 3, 'introduction', 5,
 'Show different parts of a computer. Ask: What is a computer? What parts can you see?',
 'Observe computer parts and respond to introductory questions about what a computer is.',
 'Basic knowledge of a computer and its parts is described.'),
(142, 36, 1, 'development', 20,
 'Demonstrate computer hardware and software to students. Show students how to start and shut down a computer. Explain the functions of visible components.',
 'Observe the demonstration, identify hardware and software components, and practise starting and shutting down the computer.',
 'Computer hardware and software are correctly identified and their functions described.'),
(143, 36, 4, 'design', 10,
 'Guide students to identify and name each part of the computer in the lab and explain its function.',
 'Identify and name computer parts in the lab and explain the function of each part.',
 'Computer parts are correctly identified and their functions explained.'),
(144, 36, 3, 'realisation', 5,
 'Each student names one computer component and explains what it does.',
 'Name one computer component and explain its function.',
 'A computer component is correctly named and its function explained.'),

-- Element 37(b): Connecting peripherals to a microcomputer
(145, 37, 5, 'introduction', 5,
 'Ask students to brainstorm peripheral devices they know. List responses on the board.',
 'Brainstorm and name peripheral devices they have seen or used.',
 'Common peripheral devices are mentioned.'),
(146, 37, 1, 'development', 20,
 'Demonstrate how to connect peripherals (keyboard, mouse, printer, projector, USB, HDMI, VGA) to a microcomputer. Explain the purpose of each connection.',
 'Observe the demonstration and note the steps for connecting different peripherals to the computer.',
 'Steps for connecting peripherals to a microcomputer are correctly identified.'),
(147, 37, 4, 'design', 10,
 'Guide students to practise connecting and disconnecting peripherals to the lab computers.',
 'Practise connecting and disconnecting assigned peripheral devices to the lab computer.',
 'Peripheral devices are correctly connected and disconnected from a microcomputer.'),
(148, 37, 3, 'realisation', 5,
 'Each student picks one peripheral device and explains how it is connected and what it is used for.',
 'Pick a peripheral device, explain how it is connected to the computer and what it is used for.',
 'A peripheral device is correctly connected and its purpose explained.'),

-- Element 38(c): Connecting a computer to the Internet
(149, 38, 6, 'introduction', 5,
 'Guide students to think individually about what a network is, then pair and share with the class.',
 'Think individually about networks, pair with a classmate, and share ideas with the class.',
 'The concept of a network and internet connection is related to prior knowledge.'),
(150, 38, 2, 'development', 20,
 'Guide students in groups to discuss the concept of the internet and its types of connections (wired and wireless). Demonstrate connecting a computer to the internet.',
 'Discuss the concept of the internet in groups and observe how to connect a computer using wire or wireless.',
 'The concept of the internet and the connection procedure are correctly described.'),
(151, 38, 4, 'design', 10,
 'Guide students to connect computers to the internet and search for an assigned topic.',
 'Connect the lab computer to the internet and search for an assigned topic.',
 'A computer is successfully connected to the internet and used to search for information.'),
(152, 38, 3, 'realisation', 5,
 'Each student describes the steps for connecting a computer to the internet.',
 'Describe the steps followed to connect a computer to the internet.',
 'Steps for connecting a computer to the internet are correctly described.'),

-- Element 39(a): Introduction to word processing
(153, 39, 2, 'introduction', 5,
 'Ask: What is word processing? Where have you seen or used a word processor before?',
 'Respond to questions and share experiences with word processors.',
 'Prior knowledge of word processing is shared.'),
(154, 39, 2, 'development', 20,
 'Guide students in groups to discuss the concept of word processing: definition, importance, examples of word processors, and common uses.',
 'Discuss the concept, importance, and examples of word processing in groups.',
 'The concept of word processing, its importance, and examples are correctly described.'),
(155, 39, 4, 'design', 10,
 'Guide students to open a word processor on the lab computers and explore its interface: menus, toolbars, and the document area.',
 'Open a word processor, identify and name the parts of its interface.',
 'Parts of the word processor interface are correctly identified and named.'),
(156, 39, 3, 'realisation', 5,
 'Each student defines word processing and names two examples of word processors.',
 'Define word processing and name two examples of word processors.',
 'Word processing is correctly defined and two examples named.'),

-- Element 40(b): Working with Microsoft Office Word
(157, 40, 1, 'introduction', 5,
 'Open Microsoft Word on the projector and ask: What do you see? What can you do with this program?',
 'Observe the MS Word interface and suggest what tasks can be done with it.',
 'The MS Word interface is observed and basic uses suggested.'),
(158, 40, 1, 'development', 20,
 'Demonstrate how to create, save, and format a document in MS Word: typing text, applying text attributes (bold, italic, underline), inserting page numbers, headers, footers, bullets, tables, and pictures.',
 'Observe the demonstration and take notes on how to create, format, and save a document in MS Word.',
 'Steps for creating and formatting a document in MS Word are correctly identified.'),
(159, 40, 9, 'design', 10,
 'Guide students to create a word document, apply formatting (text attributes, bullets, page numbers, header, footer, table, picture) and save it.',
 'Create a word document, apply assigned formatting elements, insert a table and picture, and save the document.',
 'A formatted word document with text attributes, page numbers, table, and picture is correctly created and saved.'),
(160, 40, 3, 'realisation', 5,
 'Each student describes how to insert and format one element in MS Word (e.g., table, header, or page number).',
 'Describe the steps for inserting and formatting an assigned element in MS Word.',
 'Steps for inserting and formatting an element in MS Word are correctly described.'),

-- Element 41(a): Spreadsheet creation, formatting, data entry, sort and filter
(161, 41, 1, 'introduction', 5,
 'Open MS Excel and ask: What do you see? What is a spreadsheet used for? How is it different from Word?',
 'Observe the MS Excel interface and suggest how it differs from a word processor.',
 'The spreadsheet interface is observed and its purpose compared to a word processor.'),
(162, 41, 1, 'development', 20,
 'Demonstrate step by step how to create a spreadsheet, enter data, format cells, sort data, and filter data using MS Excel. Show how to add and format tables.',
 'Observe the demonstration and practise data entry, sorting, and filtering in MS Excel.',
 'A spreadsheet is correctly created with data entry, formatting, sorting, and filtering applied.'),
(163, 41, 4, 'design', 10,
 'Provide a data set and guide students to enter it into Excel, format the cells, sort the data, and apply a filter.',
 'Insert the given data set into Excel, format cells, sort the data, and apply a filter.',
 'A spreadsheet is correctly created, formatted, sorted, and filtered with the given data.'),
(164, 41, 3, 'realisation', 5,
 'Each student explains how to sort or filter data in a spreadsheet.',
 'Explain the steps for sorting or filtering data in a spreadsheet.',
 'Steps for sorting or filtering spreadsheet data are correctly explained.'),

-- Element 42(b): Basic calculations and formulas
(165, 42, 1, 'introduction', 5,
 'Ask: How would you calculate the total marks for a class of 40 students using Excel? What formulas do you know?',
 'Suggest ways of performing calculations in a spreadsheet and name any formulas they know.',
 'The need for formulas in spreadsheets is discussed.'),
(166, 42, 1, 'development', 20,
 'Demonstrate the correct use of arithmetic operators and functions: SUM, AVERAGE, and percentage formulas. Show how to write cell references in formulas.',
 'Observe demonstrations and practise writing basic formulas using arithmetic operators and SUM, AVERAGE functions.',
 'Basic calculations using arithmetic operators and functions are correctly performed in a spreadsheet.'),
(167, 42, 9, 'design', 10,
 'Divide students into small groups. Assign each group a data set requiring SUM, AVERAGE, and percentage calculations.',
 'Use the assigned data set to perform SUM, AVERAGE, and percentage calculations in Excel.',
 'Basic calculations and formulas are correctly applied to a given data set.'),
(168, 42, 3, 'realisation', 5,
 'Each student writes a formula to calculate the sum and average of a given range of values.',
 'Write a SUM and AVERAGE formula for an assigned range of values.',
 'SUM and AVERAGE formulas for a given range are correctly written.'),

-- Element 43(c): Data validation and conditional formatting
(169, 43, 1, 'introduction', 5,
 'Ask: What happens if someone enters text where a number is expected in a spreadsheet? How can we prevent errors in data entry?',
 'Suggest ways to prevent incorrect data entry in a spreadsheet.',
 'The need for data validation in spreadsheets is discussed.'),
(170, 43, 1, 'development', 20,
 'Demonstrate data validation features (restricting data type and range) and conditional formatting (highlighting cells based on rules) in MS Excel.',
 'Observe demonstrations and take notes on how to apply data validation and conditional formatting.',
 'Data validation rules and conditional formatting are correctly applied in a spreadsheet.'),
(171, 43, 9, 'design', 10,
 'Provide a data set and guide students to apply data validation and conditional formatting to it.',
 'Apply data validation and conditional formatting to the provided data set in Excel.',
 'Data validation and conditional formatting are correctly applied to a given data set.'),
(172, 43, 2, 'realisation', 5,
 'Each student explains the purpose of data validation and describes one conditional formatting rule.',
 'Explain the purpose of data validation and describe one conditional formatting rule.',
 'The purpose of data validation and a conditional formatting rule are correctly explained.'),

-- Element 44(d): Data import and export
(173, 44, 1, 'introduction', 5,
 'Ask: Can Excel work with data from other programs? Have you seen a CSV file before? What is it?',
 'Respond to questions about sharing data between programs and what a CSV file is.',
 'The concept of data import and export between programs is introduced.'),
(174, 44, 1, 'development', 20,
 'Demonstrate importing data from a CSV file into Excel and exporting data to CSV and other formats using a projector.',
 'Observe the step-by-step process of importing and exporting data in Excel.',
 'The process of importing and exporting data in a spreadsheet is correctly described.'),
(175, 44, 9, 'design', 10,
 'Provide sample CSV files and guide students to import them into Excel and export a worksheet in CSV format.',
 'Import an assigned CSV file into Excel and export a worksheet in CSV format.',
 'Data is correctly imported from a CSV file and exported from a spreadsheet.'),
(176, 44, 3, 'realisation', 5,
 'Each student describes the steps for importing data from a CSV file into a spreadsheet.',
 'Describe the steps for importing a CSV file into a spreadsheet.',
 'Steps for importing data into a spreadsheet are correctly described.'),

-- Element 45(e): Page setup and printing
(177, 45, 1, 'introduction', 5,
 'Ask: Before printing a spreadsheet, what settings should you check? Have you ever printed a document that did not fit on the page?',
 'Suggest settings to check before printing a spreadsheet.',
 'Common issues with printing spreadsheets are identified.'),
(178, 45, 1, 'development', 20,
 'Demonstrate page layout setup in Excel: paper size, orientation, margins, print area, and print preview. Show the printing process.',
 'Observe the demonstration and note the steps for setting up a page and printing in Excel.',
 'Page setup options and the printing process in a spreadsheet are correctly described.'),
(179, 45, 9, 'design', 10,
 'Provide spreadsheet samples with various formatting requirements. Guide students to adjust page setup and print or preview.',
 'Adjust page setup settings for the provided spreadsheet and perform a print preview.',
 'Page setup is correctly adjusted and a print preview or printout produced.'),
(180, 45, 3, 'realisation', 5,
 'Each student names two page setup settings that must be checked before printing.',
 'Name two page setup settings that must be checked before printing a spreadsheet.',
 'Two page setup settings and their purpose are correctly stated.'),

-- Element 46(a): Familiarizing with a database application
(181, 46, 2, 'introduction', 5,
 'Ask: What is a database? Can you give examples of places where large amounts of data are stored and managed? Introduce MS Access.',
 'Respond to questions and suggest real-life examples of data storage and management.',
 'The concept of a database and its real-life uses are discussed.'),
(182, 46, 2, 'development', 20,
 'Guide students in groups to discuss the concept of database applications, common vendors (MS Access, MySQL), and their advantages. Demonstrate opening and navigating MS Access.',
 'Discuss database concepts in groups and observe the MS Access interface.',
 'The concept of a database application, its vendors, and features are correctly described.'),
(183, 46, 4, 'design', 10,
 'Guide students to use the internet to watch a tutorial on creating a database in MS Access and identify its features.',
 'Watch an online MS Access tutorial and identify the key features of the database software.',
 'Key features of a database application are correctly identified from a tutorial.'),
(184, 46, 3, 'realisation', 5,
 'Each student defines a database and names two examples of database applications.',
 'Define a database and name two examples of database applications.',
 'A database is correctly defined and two examples named.'),

-- Element 47(b): Creating tables and entering data
(185, 47, 1, 'introduction', 5,
 'Ask: What is a table in a database? How is it different from a spreadsheet table?',
 'Respond to questions and compare a database table to a spreadsheet table.',
 'The concept of a database table is related to a familiar structure.'),
(186, 47, 1, 'development', 20,
 'Use a real-world scenario (e.g., school exam results) to demonstrate creating a table in MS Access, defining fields, data types, and entering records.',
 'Observe the demonstration and note the steps for creating a table and entering data in MS Access.',
 'A database table with appropriate fields and data types is correctly created.'),
(187, 47, 9, 'design', 10,
 'Assign students a scenario and guide them to create a table and enter a set of data records in MS Access.',
 'Create a table in MS Access for the assigned scenario and enter the provided data records.',
 'A database table is correctly created with appropriate fields and data entered.'),
(188, 47, 3, 'realisation', 5,
 'Each student describes the steps for creating a table and entering data in a database application.',
 'Describe the steps for creating a table and entering data in a database application.',
 'Steps for creating a database table and entering data are correctly described.'),

-- Element 48(c): Creating queries
(189, 48, 1, 'introduction', 5,
 'Ask: If a database has 500 records, how would you find only the records you need? Introduce queries.',
 'Respond to questions and suggest how to find specific records in a large database.',
 'The purpose of queries in a database is discussed.'),
(190, 48, 1, 'development', 20,
 'Demonstrate how to create a simple select query in MS Access to retrieve specific records based on criteria.',
 'Observe the demonstration and note the steps for creating a query in MS Access.',
 'A query is correctly created to retrieve specific records from a database.'),
(191, 48, 9, 'design', 10,
 'Assign students a database with data and guide them to create a query to retrieve specific records.',
 'Create a query in MS Access to retrieve assigned records from the given database.',
 'A query retrieving specified records is correctly created.'),
(192, 48, 3, 'realisation', 5,
 'Each student describes the purpose of a query and the steps for creating one in a database.',
 'Describe the purpose of a database query and the steps for creating one.',
 'The purpose of a query and the steps for creating one are correctly described.'),

-- Element 49(d): Creating forms
(193, 49, 1, 'introduction', 5,
 'Ask: How do users enter data into a database system without seeing the underlying tables? Introduce database forms.',
 'Respond to questions and suggest how a form makes data entry easier for users.',
 'The purpose of forms in a database is discussed.'),
(194, 49, 1, 'development', 20,
 'Use a guided video tutorial to demonstrate creating a form in MS Access for a given table. Show how forms simplify data entry.',
 'Watch the video demonstration and observe how a form is created in MS Access.',
 'A form for a database table is correctly created in MS Access.'),
(195, 49, 9, 'design', 10,
 'Assign students a database table and guide them to create a form for data entry using MS Access.',
 'Create a data entry form for the assigned database table in MS Access.',
 'A data entry form is correctly created for an assigned database table.'),
(196, 49, 3, 'realisation', 5,
 'Each student explains why forms are used in database systems.',
 'Explain the purpose of forms in a database system.',
 'The purpose of database forms is correctly explained.'),

-- Element 50(e): Creating reports
(197, 50, 1, 'introduction', 5,
 'Ask: How can we present database information in a printed, organised format? Introduce database reports.',
 'Respond to questions and suggest how database reports differ from raw table data.',
 'The purpose of reports in a database is discussed.'),
(198, 50, 1, 'development', 20,
 'Use a guided video to demonstrate creating a report in MS Access from a given table or query. Show how to format and organise the report.',
 'Watch the video and observe the steps for creating a report in MS Access.',
 'A database report is correctly created and formatted in MS Access.'),
(199, 50, 9, 'design', 10,
 'Assign students a database and guide them to create a formatted report from a given table or query.',
 'Create a formatted report from the assigned database table or query in MS Access.',
 'A formatted database report is correctly created.'),
(200, 50, 3, 'realisation', 5,
 'Each student describes the steps for creating a report in a database application.',
 'Describe the steps for creating a report in a database application.',
 'Steps for creating a database report are correctly described.'),

-- Element 51(a): Creating and formatting presentations
(201, 51, 1, 'introduction', 5,
 'Show a sample PowerPoint presentation. Ask: What is this? Where have you seen presentations used?',
 'Observe the sample presentation and identify where presentations are used.',
 'The purpose and use of presentations in real life are described.'),
(202, 51, 1, 'development', 20,
 'Use a projector to demonstrate navigating PowerPoint: creating slides, adding text content, and applying formatting options such as themes, fonts, and layouts.',
 'Observe the demonstration and take notes on how to create and format slides in PowerPoint.',
 'Slides are correctly created with appropriate content and formatting in PowerPoint.'),
(203, 51, 9, 'design', 10,
 'Organise hands-on workshops where students create a presentation on an assigned topic applying themes, fonts, and layouts.',
 'Create a presentation on an assigned topic with appropriate theme, fonts, and organised slide layout.',
 'A presentation with correct formatting and organised content is created.'),
(204, 51, 3, 'realisation', 5,
 'Each student describes how to create a new slide and apply a theme in PowerPoint.',
 'Describe the steps for creating a new slide and applying a theme in PowerPoint.',
 'Steps for creating a slide and applying a theme are correctly described.'),

-- Element 52(b): Inserting Images, Graphics and SmartArt
(205, 52, 1, 'introduction', 5,
 'Ask: How can images and diagrams improve a presentation? Show a slide with and without visuals.',
 'Compare slides with and without visuals and explain how visuals improve a presentation.',
 'The importance of visual elements in presentations is discussed.'),
(206, 52, 1, 'development', 20,
 'Demonstrate inserting and formatting images, graphics, and SmartArt in PowerPoint. Show how to resize, position, and format each visual element.',
 'Observe the demonstration and note the steps for inserting and formatting images, graphics, and SmartArt.',
 'Images, graphics, and SmartArt are correctly inserted and formatted in a presentation.'),
(207, 52, 4, 'design', 10,
 'Provide opportunities for students to practise inserting and manipulating images and SmartArt in their presentations.',
 'Insert and manipulate images, graphics, and SmartArt in an assigned presentation.',
 'Visual elements are correctly inserted and formatted in a presentation slide.'),
(208, 52, 3, 'realisation', 5,
 'Each student describes the steps for inserting an image and a SmartArt in PowerPoint.',
 'Describe the steps for inserting an image and a SmartArt into a PowerPoint slide.',
 'Steps for inserting images and SmartArt in PowerPoint are correctly described.'),

-- Element 53(c): Incorporating charts and tables
(209, 53, 1, 'introduction', 5,
 'Ask: When is it better to use a chart rather than a table in a presentation? Show examples.',
 'Compare examples of charts and tables and suggest when each is more appropriate.',
 'The purpose of charts and tables in presentations is discussed.'),
(210, 53, 1, 'development', 20,
 'Demonstrate how to create, insert, and format charts and tables in PowerPoint using real or sample data.',
 'Observe the demonstration and note the steps for creating and formatting charts and tables in PowerPoint.',
 'Charts and tables are correctly created and formatted in a PowerPoint presentation.'),
(211, 53, 9, 'design', 10,
 'Guide students to create charts and tables in their presentations using real or sample data.',
 'Create a chart and a table from given data and insert them into a presentation slide.',
 'A chart and table from given data are correctly created and inserted into a presentation.'),
(212, 53, 3, 'realisation', 5,
 'Each student explains the difference between using a chart and a table in a presentation.',
 'Explain the difference between using a chart and a table in a presentation and give one use for each.',
 'The difference between charts and tables in presentations is correctly explained.'),

-- Element 54(d): Slide transitions, slide master and animations
(213, 54, 1, 'introduction', 5,
 'Show a presentation with no transitions and one with transitions. Ask: What difference do you notice? What makes slides more engaging?',
 'Compare presentations with and without transitions and identify what makes slides more engaging.',
 'The purpose of transitions and animations in presentations is discussed.'),
(214, 54, 1, 'development', 20,
 'Demonstrate how to create slide transitions, apply a Slide Master for uniform design, and add animations to individual objects in PowerPoint.',
 'Observe demonstrations and note how to add transitions, apply a Slide Master, and add animations.',
 'Slide transitions, Slide Master layouts, and animations are correctly applied in PowerPoint.'),
(215, 54, 9, 'design', 10,
 'Guide students to customise pre-made templates using Slide Master and add transitions and animations to their presentations.',
 'Apply a Slide Master, add slide transitions, and animate objects in an assigned presentation.',
 'A Slide Master, transitions, and animations are correctly applied in a presentation.'),
(216, 54, 3, 'realisation', 5,
 'Each student describes how to apply a transition between slides and one animation to an object.',
 'Describe the steps for applying a slide transition and an object animation in PowerPoint.',
 'Steps for applying transitions and animations in PowerPoint are correctly described.'),

-- Element 55(e): Presentations for remote meetings
(217, 55, 1, 'introduction', 5,
 'Ask: How is presenting on Zoom or Google Meet different from presenting in a classroom? What challenges can arise?',
 'Discuss the differences and challenges of remote presentations compared to in-person presentations.',
 'Challenges of presenting remotely are identified.'),
(218, 55, 1, 'development', 20,
 'Demonstrate how to create a presentation tailored for remote delivery, emphasising clarity, simplicity, and engaging design. Show screen sharing on remote meeting platforms.',
 'Observe the demonstration and note guidelines for creating and sharing presentations in remote meetings.',
 'A presentation suitable for remote delivery is correctly created with appropriate design.'),
(219, 55, 9, 'design', 10,
 'Guide students through a hands-on activity using remote meeting platforms (Zoom, Google Meet, MS Teams) to share their presentations with screen sharing.',
 'Share a presentation using screen sharing on an assigned remote meeting platform.',
 'A presentation is correctly shared using screen sharing on a remote meeting platform.'),
(220, 55, 2, 'realisation', 5,
 'In groups, students discuss best practices for remote presentations and share one key tip.',
 'Discuss best practices for remote presentations in groups and share one key tip with the class.',
 'Best practices for remote presentations are correctly identified and explained.'),

-- Element 56(a): Desktop Publishing - Document creation and formatting
(221, 56, 1, 'introduction', 5,
 'Show examples of a newsletter, brochure, and flyer. Ask: What is different about these compared to a Word document?',
 'Observe examples of publications and identify how they differ from ordinary Word documents.',
 'The differences between desktop publishing output and ordinary documents are described.'),
(222, 56, 1, 'development', 20,
 'Demonstrate the basic features of MS Publisher: selecting templates, customising layouts, inserting images, and formatting text. Show how to create a simple document.',
 'Observe the demonstration and take notes on how to create and format a document in MS Publisher.',
 'A document is correctly created and formatted in MS Publisher.'),
(223, 56, 8, 'design', 10,
 'Provide step-by-step instructions and guide students to create and format their own document in MS Publisher.',
 'Create and format a document in MS Publisher following the provided instructions.',
 'A formatted document is correctly created in MS Publisher.'),
(224, 56, 3, 'realisation', 5,
 'Each student describes how to create a new document and apply a template in MS Publisher.',
 'Describe the steps for creating a document and applying a template in MS Publisher.',
 'Steps for creating and formatting a document in MS Publisher are correctly described.'),

-- Element 57(b): Desktop Publishing - Image insertion and graphics
(225, 57, 1, 'introduction', 5,
 'Ask: How can images and graphic elements improve a publication like a brochure or newsletter?',
 'Suggest how images and graphics improve publications.',
 'The importance of images and graphics in desktop publishing is discussed.'),
(226, 57, 1, 'development', 20,
 'Demonstrate inserting images and graphics into MS Publisher. Show how to use editing tools to resize, crop, and position images.',
 'Observe the demonstration and note how to insert, resize, crop, and position images in MS Publisher.',
 'Images and graphics are correctly inserted and edited in a desktop publishing document.'),
(227, 57, 9, 'design', 10,
 'Facilitate hands-on practice sessions where students insert and format images and graphics in their MS Publisher document.',
 'Insert, resize, crop, and position images and graphics in an MS Publisher document.',
 'Images and graphics are correctly inserted and formatted in a publication.'),
(228, 57, 3, 'realisation', 5,
 'Each student explains the steps for inserting and formatting an image in MS Publisher.',
 'Explain the steps for inserting and formatting an image in MS Publisher.',
 'Steps for inserting and formatting images in MS Publisher are correctly explained.'),

-- Element 58(c): Typography and Font Management
(229, 58, 1, 'introduction', 5,
 'Show two publications: one with poor font choices and one with good typography. Ask: Which looks more professional? Why?',
 'Compare the two publications and explain which looks more professional and why.',
 'The importance of typography in publications is discussed.'),
(230, 58, 1, 'development', 20,
 'Provide live demonstrations of accessing and managing fonts in MS Publisher. Explain font types, sizes, spacing, and hierarchy.',
 'Observe demonstrations and note how to manage fonts and apply typography principles in MS Publisher.',
 'Typography principles and font management in MS Publisher are correctly applied.'),
(231, 58, 8, 'design', 10,
 'Engage students in a hands-on project where they apply typography principles to create or improve a document in MS Publisher.',
 'Apply typography principles to create or improve a publication in MS Publisher.',
 'Typography principles are correctly applied in a desktop publishing document.'),
(232, 58, 3, 'realisation', 5,
 'Each student names two typography principles and explains their effect on a publication.',
 'Name two typography principles and explain their effect on a publication.',
 'Two typography principles and their effects are correctly described.'),

-- Element 59(d): Designing office and business products
(233, 59, 1, 'introduction', 5,
 'Show examples of a business card, brochure, and newsletter. Ask: What business documents can be created using desktop publishing software?',
 'Identify business documents shown and suggest others that can be created using desktop publishing.',
 'Types of business products that can be created with desktop publishing are identified.'),
(234, 59, 1, 'development', 20,
 'Demonstrate how to create business cards and stationery in MS Publisher. Show the tools used for layout and design.',
 'Observe the demonstration and note the steps for creating business products in MS Publisher.',
 'Business products are correctly designed using MS Publisher tools.'),
(235, 59, 9, 'design', 10,
 'Guide students to create one business product of their choice (brochure, flyer, newsletter, poster, or business card) in MS Publisher.',
 'Create an assigned business product (brochure, flyer, newsletter, or business card) in MS Publisher.',
 'A business product is correctly designed and formatted in MS Publisher.'),
(236, 59, 3, 'realisation', 5,
 'Each student names three types of business products that can be created using desktop publishing software.',
 'Name three types of business products that can be created using desktop publishing software.',
 'Three business products creatable using desktop publishing are correctly named.'),

-- Element 60(a): Conducting internet search
(237, 60, 5, 'introduction', 5,
 'Ask: How do you find information on the internet? What search engines do you know?',
 'Brainstorm search engines they know and how they search for information online.',
 'Common internet search engines and search habits are identified.'),
(238, 60, 2, 'development', 20,
 'Assign students to groups to discuss different web browsers, search engines, and their functionalities. Guide discussion on internet search techniques and evaluating credible sources.',
 'Discuss search engines, search techniques, and how to identify credible and reliable sources of information.',
 'Internet search techniques and criteria for credible sources are correctly described.'),
(239, 60, 9, 'design', 10,
 'Guide students to use the internet to search for assigned topics and evaluate the credibility of sources found.',
 'Search for an assigned topic on the internet and evaluate the credibility of sources found.',
 'Internet search is correctly performed and sources are evaluated for credibility.'),
(240, 60, 3, 'realisation', 5,
 'Each student describes one internet search technique and explains how to identify a credible source.',
 'Describe one internet search technique and explain how to identify a credible online source.',
 'An internet search technique and criteria for credible sources are correctly described.'),

-- Element 61(b): Working with email application
(241, 61, 3, 'introduction', 5,
 'Ask: What is email? Have you sent or received an email? What are the parts of an email?',
 'Respond to questions and share experiences with sending and receiving emails.',
 'Basic knowledge of email and its parts is described.'),
(242, 61, 9, 'development', 20,
 'Guide students to set up an email account, configure settings (signature, automatic replies), compose and send an email, and use folders and labels to organise the inbox.',
 'Set up an email account, configure settings, compose and send an email, and organise the inbox using folders.',
 'An email account is correctly set up, configured, and used to compose, send, and organise emails.'),
(243, 61, 9, 'design', 10,
 'Guide students to use email tools (filters, rules, priority markers) to manage an inbox and send a formatted professional email with an attachment.',
 'Apply email filters and rules to manage the inbox and send a professional email with an attached file.',
 'Email tools are correctly used and a professional email with attachment is sent.'),
(244, 61, 3, 'realisation', 5,
 'Each student describes how to compose a professional email and attach a file.',
 'Describe the steps for composing and sending a professional email with an attachment.',
 'Steps for composing and sending a professional email with an attachment are correctly described.'),

-- Element 62(c): Administering social media accounts
(245, 62, 5, 'introduction', 5,
 'Ask: What social media platforms do you know? How are they used for communication and business?',
 'Brainstorm social media platforms they know and their uses for communication and business.',
 'Common social media platforms and their uses are identified.'),
(246, 62, 7, 'development', 20,
 'Use real-world scenarios to illustrate creating and posting content on different social media platforms, emphasising differences in tone and style. Demonstrate reading social media analytics.',
 'Analyse real-world scenarios of social media content and observe how analytics are read and interpreted.',
 'Social media content creation processes and analytics are correctly described.'),
(247, 62, 9, 'design', 10,
 'Guide students to set up various social media accounts and practise using social media management tools to schedule posts and manage accounts.',
 'Set up a social media account and use management tools to schedule and manage posts.',
 'A social media account is correctly set up and management tools are used to schedule posts.'),
(248, 62, 3, 'realisation', 5,
 'Each student names two social media platforms and describes one difference in how content is posted on each.',
 'Name two social media platforms and describe one difference in how content is posted on each.',
 'Two social media platforms are named and one difference in content posting described.'),

-- Element 63(d): Administering webinars and virtual meetings
(249, 63, 1, 'introduction', 5,
 'Ask: What is a webinar? How is it different from a regular video call? Where are webinars used?',
 'Respond to questions and discuss the difference between webinars and regular video calls.',
 'The concept and use of webinars and virtual meetings are discussed.'),
(250, 63, 1, 'development', 20,
 'Demonstrate various virtual meeting platforms and guide students in setting up meetings or webinars, focusing on essential tools: screen sharing, breakout rooms, and polls.',
 'Observe the demonstration and note the steps for setting up a virtual meeting or webinar.',
 'A virtual meeting or webinar is correctly set up using an online platform.'),
(251, 63, 9, 'design', 10,
 'Guide students to schedule a meeting, create an invitation, and use features like screen sharing and polls on a virtual meeting platform.',
 'Schedule a virtual meeting, create an invitation, and use screen sharing and poll features.',
 'A virtual meeting with invitations and features is correctly set up.'),
(252, 63, 2, 'realisation', 5,
 'In groups, students describe different types of webinars or virtual meetings and their uses.',
 'In groups, describe different types of webinars and virtual meetings and their uses.',
 'Types of webinars and virtual meetings and their uses are correctly described.'),

-- Element 64(e): Creating online forms and surveys
(253, 64, 3, 'introduction', 5,
 'Ask: Where have you filled in an online form? What types of questions do online forms usually have?',
 'Share experiences of filling in online forms and describe the types of questions used.',
 'Types of online forms and their uses are identified from experience.'),
(254, 64, 9, 'development', 20,
 'Guide students through the process of selecting a platform and creating an online form using different question formats (multiple choice, short answer, rating).',
 'Create an online form using an assigned platform, using multiple question formats.',
 'An online form with appropriate question formats is correctly created.'),
(255, 64, 7, 'design', 10,
 'Discuss real-world examples of online forms in business and education. Guide students to distribute a form and analyse the survey results.',
 'Distribute an online form, collect responses, and analyse the survey results.',
 'Survey results from an online form are correctly analysed and interpreted.'),
(256, 64, 3, 'realisation', 5,
 'Each student names two platforms for creating online forms and describes one use of online surveys.',
 'Name two platforms for creating online forms and describe one use of online surveys.',
 'Two online form platforms and one use of surveys are correctly named and described.'),

-- Element 65(f): Cloud storage and file sharing
(257, 65, 6, 'introduction', 5,
 'Guide students to think individually about cloud storage and its benefits, then pair and share with the class.',
 'Think individually about cloud storage, pair with a classmate, and share ideas with the class.',
 'The concept of cloud storage and its benefits are discussed.'),
(258, 65, 9, 'development', 20,
 'Guide students through creating and setting up cloud storage accounts on different platforms. Demonstrate how to upload, organise, and share files with various permission levels.',
 'Create a cloud storage account, upload files, organise them into folders, and share a file with a classmate.',
 'A cloud storage account is correctly created and used to upload, organise, and share files.'),
(259, 65, 9, 'design', 10,
 'Guide students to practise using cloud services across multiple devices, ensuring files sync properly, and troubleshooting common issues.',
 'Access a cloud storage account from two different devices and verify that files sync correctly.',
 'Files are correctly accessed and synced across devices using a cloud storage service.'),
(260, 65, 3, 'realisation', 5,
 'Each student names one cloud storage platform and describes one advantage of using cloud storage.',
 'Name one cloud storage platform and describe one advantage of using cloud storage.',
 'A cloud storage platform is correctly named and one advantage described.'),

-- Element 66(g): Recognising internet threats
(261, 66, 7, 'introduction', 5,
 'Present a case study of a cyber-attack. Ask: What happened? Who was affected? How could it have been prevented?',
 'Analyse the cyber-attack case study and suggest how it could have been prevented.',
 'The concept and impact of internet threats are discussed.'),
(262, 66, 2, 'development', 20,
 'Lead discussions on various types of internet threats (malware, phishing, hacking, identity theft) and their consequences. Use real-life examples of cyber-attacks.',
 'Discuss types of internet threats, their consequences, and share personal experiences of online threats.',
 'Types of internet threats and their consequences are correctly identified and described.'),
(263, 66, 7, 'design', 10,
 'Present scenarios of different internet threats. Ask groups to identify the type of threat and suggest prevention measures.',
 'Identify the type of internet threat in each scenario and suggest appropriate prevention measures.',
 'Internet threats in given scenarios are correctly identified and prevention measures suggested.'),
(264, 66, 3, 'realisation', 5,
 'Each student names one type of internet threat and describes how to prevent it.',
 'Name one type of internet threat and describe one way to prevent it.',
 'An internet threat and its prevention measure are correctly described.'),

-- Element 67(h): VPN and proxy
(265, 67, 3, 'introduction', 5,
 'Ask: What is a VPN? Have you heard of a proxy? Why would someone use them?',
 'Respond to questions about VPNs and proxies and suggest why they might be used.',
 'The concept of VPNs and proxies and their uses are discussed.'),
(266, 67, 3, 'development', 20,
 'Explain the concepts of VPNs and proxies, their differences, and typical use cases. Demonstrate configuring VPN software on a device.',
 'Observe the explanation and demonstration and note the concepts and differences between VPNs and proxies.',
 'The concepts of VPN and proxy and their differences are correctly described.'),
(267, 67, 9, 'design', 10,
 'Guide students to install, configure, and use VPN software on lab computers. Show how to select VPN servers and manage encryption settings.',
 'Install, configure, and connect to a VPN on the lab computer and verify the connection.',
 'VPN software is correctly installed, configured, and used on a computer.'),
(268, 67, 3, 'realisation', 5,
 'Each student explains the difference between a VPN and a proxy and states one use of each.',
 'Explain the difference between a VPN and a proxy and state one use of each.',
 'The difference between a VPN and a proxy and one use of each are correctly explained.'),

-- Element 68(a): Email marketing
(269, 68, 3, 'introduction', 5,
 'Ask: What is email marketing? Have you ever received a promotional email from a company? What made it effective or not?',
 'Respond to questions and share experiences of receiving marketing emails.',
 'The concept of email marketing and its role in digital marketing are discussed.'),
(270, 68, 9, 'development', 20,
 'Guide students to design email templates using email marketing platforms, focusing on design, messaging, and call-to-action buttons. Demonstrate setting up automated email campaigns.',
 'Design an email marketing template on an assigned platform and identify key elements: design, message, call-to-action.',
 'An email marketing template with appropriate elements is correctly designed.'),
(271, 68, 9, 'design', 10,
 'Guide students through creating a segmented email list and setting up an automated welcome or promotional campaign.',
 'Create a segmented email list and set up an automated email campaign on an assigned platform.',
 'A segmented email list and automated campaign are correctly created.'),
(272, 68, 3, 'realisation', 5,
 'Each student describes two elements of an effective marketing email.',
 'Describe two elements of an effective marketing email.',
 'Two elements of an effective marketing email are correctly described.'),

-- Element 69(b): Creating digital contents
(273, 69, 5, 'introduction', 5,
 'Ask: What types of digital content do businesses and influencers create? What makes content engaging?',
 'Brainstorm types of digital content and suggest what makes them engaging.',
 'Types of digital content used in marketing are identified.'),
(274, 69, 9, 'development', 20,
 'Guide students to create various types of digital content (social media posts, blog articles, short video snippets) using relevant tools. Cover copyright laws and ethical considerations.',
 'Create assigned types of digital content using provided tools and apply copyright and ethical guidelines.',
 'Digital content of different types is correctly created following copyright and ethical guidelines.'),
(275, 69, 9, 'design', 10,
 'Lead activities where students craft a content strategy for an assigned platform focusing on audience engagement, tone, and branding.',
 'Develop a content strategy for an assigned platform with content plan, tone guide, and branding elements.',
 'A content strategy for an assigned platform is correctly developed.'),
(276, 69, 3, 'realisation', 5,
 'Each student names two types of digital content and explains one ethical consideration in content creation.',
 'Name two types of digital content and explain one ethical consideration in content creation.',
 'Two types of digital content and one ethical consideration are correctly described.'),

-- Element 70(c): Customizing blogs for publication
(277, 70, 3, 'introduction', 5,
 'Ask: What is a blog? How is it different from a social media post? Have you ever read or written a blog?',
 'Respond to questions and share experiences with reading or writing blogs.',
 'The concept of a blog and its difference from social media content is discussed.'),
(278, 70, 9, 'development', 20,
 'Introduce blog platforms and demonstrate setting up and customising a blog with different themes and designs. Show how to customise the appearance and structure.',
 'Observe the demonstration and note the steps for setting up and customising a blog on an assigned platform.',
 'A blog is correctly set up and customised on an assigned platform.'),
(279, 70, 9, 'design', 10,
 'Guide students to customise their blog appearance and incorporate multimedia elements (images, videos) into blog posts.',
 'Customise the blog appearance and publish a blog post incorporating images or videos.',
 'A blog post with multimedia elements is correctly published on a customised blog.'),
(280, 70, 3, 'realisation', 5,
 'Each student names two blog platforms and describes one way to customise a blog for a target audience.',
 'Name two blog platforms and describe one way to customise a blog for a specific audience.',
 'Two blog platforms and one customisation method are correctly described.'),

-- Element 71(d): Conducting online advertising
(281, 71, 3, 'introduction', 5,
 'Ask: Where do you see advertisements online? What types of online ads do you know?',
 'Identify places where online ads appear and name types of online advertisements.',
 'Types of online advertisements and where they appear are identified.'),
(282, 71, 1, 'development', 20,
 'Introduce types of online ads (search, display, social media, video). Demonstrate how to craft effective ad copy and visuals. Explain targeting options, budgets, and bidding strategies.',
 'Observe the demonstration and note the types of online ads, targeting options, and budgeting strategies.',
 'Types of online advertisements and advertising strategies are correctly described.'),
(283, 71, 9, 'design', 10,
 'Guide students to analyse campaign data and practise adjusting targeting options and making real-time optimisations to improve campaign performance.',
 'Analyse sample campaign data and adjust targeting options to improve performance metrics.',
 'Campaign data is correctly analysed and targeting adjustments made to improve performance.'),
(284, 71, 3, 'realisation', 5,
 'Each student names two types of online advertisements and explains one targeting strategy.',
 'Name two types of online advertisements and explain one targeting strategy.',
 'Two types of online ads and one targeting strategy are correctly described.'),

-- Element 72(e): Market analytics and reporting
(285, 72, 3, 'introduction', 5,
 'Ask: How do businesses know if their online marketing is working? What data do they look at?',
 'Suggest how businesses measure the success of online marketing.',
 'The importance of market analytics for decision-making is discussed.'),
(286, 72, 9, 'development', 20,
 'Guide students to work with tools like Google Analytics or Excel to gather and interpret market data. Demonstrate how to track traffic, conversion rates, and user demographics.',
 'Use an analytics tool to gather market data and identify key metrics such as traffic and conversion rates.',
 'Key marketing metrics are correctly identified and interpreted using an analytics tool.'),
(287, 72, 1, 'design', 10,
 'Demonstrate how to identify market trends and customer behaviour patterns. Guide group exercises on applying insights to improve marketing strategies.',
 'Analyse market data, identify trends, and suggest marketing strategy improvements based on insights.',
 'Market trends are correctly identified and data-driven marketing improvements suggested.'),
(288, 72, 3, 'realisation', 5,
 'Each student names two key marketing metrics and explains what each metric measures.',
 'Name two key marketing metrics and explain what each measures.',
 'Two marketing metrics and their meanings are correctly described.'),

-- Element 73(f): Maintaining CRM systems
(289, 73, 3, 'introduction', 5,
 'Ask: What is a CRM system? Why would a business need to manage customer relationships using software?',
 'Respond to questions about CRM systems and suggest why businesses use them.',
 'The concept and purpose of CRM systems are discussed.'),
(290, 73, 9, 'development', 20,
 'Guide students to set up a CRM system, configure its features, and manage customer data. Demonstrate how to use CRM tools for tracking leads and customer interactions.',
 'Set up a CRM system, configure features, and add sample customer data.',
 'A CRM system is correctly set up, configured, and used to manage customer data.'),
(291, 73, 9, 'design', 10,
 'Guide students to practise automating common tasks in the CRM (follow-up emails, updating records). Conduct group discussion on data privacy and GDPR compliance.',
 'Automate a follow-up email task in the CRM and update customer records after interactions.',
 'Common CRM tasks are correctly automated and customer records updated.'),
(292, 73, 2, 'realisation', 5,
 'In groups, discuss data privacy best practices in CRM systems and share one key privacy rule.',
 'In groups, discuss data privacy in CRM systems and share one key data protection rule.',
 'Data privacy best practices in CRM systems are correctly identified and explained.'),

-- Element 74(g): Working with Artificial Intelligence (AI)
(293, 74, 5, 'introduction', 5,
 'Ask: What is Artificial Intelligence? Can you name any AI tools you have used or heard of?',
 'Brainstorm AI tools they know or have used and share with the class.',
 'Common AI tools and their uses are identified from prior knowledge.'),
(294, 74, 2, 'development', 20,
 'Arrange students into groups to explain different AI tools and their functionalities. Guide discussion on techniques for using AI tools effectively and identifying credible AI tools.',
 'Discuss AI tools in groups, identify their functionalities, and describe techniques for using them effectively.',
 'AI tools and their functionalities are correctly identified and techniques for using them described.'),
(295, 74, 9, 'design', 10,
 'Assist students to use AI tools to search for information, analyse data, generate images, and solve subject-specific questions.',
 'Use an AI tool to search for information, generate an image, and solve an assigned subject question.',
 'AI tools are correctly used to search, analyse, generate images, and solve subject questions.'),
(296, 74, 3, 'realisation', 5,
 'Each student names two AI tools and describes one task each tool can perform.',
 'Name two AI tools and describe one task each can perform.',
 'Two AI tools and one task for each are correctly named and described.');

-- ============================================================
-- ELEMENT_RESOURCES
-- Existing resource IDs:
--   1=Computer, 2=Overhead projector, 3=Internet access
--   4=Microsoft Word, 5=Microsoft Excel, 6=PowerPoint
--   7=Microsoft Access, 8=MS Publisher, 9=Printer
--   10=Ethernet cables, 11=USB drives, 12=Handouts
--   13=Video tutorials, 14=Textbook, 15=Whiteboard
--   16=Markers, 17=Manila papers, 18=Projector
--   19=Calculator, 20=Laboratory equipment
--   21=Charts and diagrams, 22=Models
-- ============================================================

INSERT INTO `element_resources` (`element_id`, `resource_id`) VALUES
-- Element 36(a): Familiarizing with computer
(36, 1), (36, 2), (36, 10), (36, 11),
-- Element 37(b): Connecting peripherals
(37, 1), (37, 2), (37, 10), (37, 11),
-- Element 38(c): Connecting to internet
(38, 1), (38, 2), (38, 3), (38, 10),
-- Element 39(a): Intro to word processing
(39, 1), (39, 2), (39, 4),
-- Element 40(b): Working with MS Word
(40, 1), (40, 2), (40, 3), (40, 4),
-- Element 41(a): Spreadsheet creation
(41, 1), (41, 2), (41, 5),
-- Element 42(b): Calculations and formulas
(42, 1), (42, 2), (42, 5),
-- Element 43(c): Data validation
(43, 1), (43, 2), (43, 5),
-- Element 44(d): Data import/export
(44, 1), (44, 2), (44, 3), (44, 5),
-- Element 45(e): Page setup and printing
(45, 1), (45, 2), (45, 5), (45, 9),
-- Element 46(a): Database familiarization
(46, 1), (46, 2), (46, 3), (46, 7), (46, 13),
-- Element 47(b): Creating tables
(47, 1), (47, 2), (47, 7), (47, 13),
-- Element 48(c): Creating queries
(48, 1), (48, 2), (48, 7),
-- Element 49(d): Creating forms
(49, 1), (49, 2), (49, 7), (49, 13),
-- Element 50(e): Creating reports
(50, 1), (50, 2), (50, 7), (50, 13),
-- Element 51(a): Creating presentations
(51, 1), (51, 2), (51, 3), (51, 6),
-- Element 52(b): Images and SmartArt
(52, 1), (52, 2), (52, 3), (52, 6),
-- Element 53(c): Charts and tables
(53, 1), (53, 2), (53, 6),
-- Element 54(d): Transitions and animations
(54, 1), (54, 2), (54, 6),
-- Element 55(e): Remote meeting presentations
(55, 1), (55, 2), (55, 3), (55, 6),
-- Element 56(a): Desktop publishing creation
(56, 1), (56, 2), (56, 8),
-- Element 57(b): Image insertion DTP
(57, 1), (57, 2), (57, 3), (57, 8),
-- Element 58(c): Typography
(58, 1), (58, 2), (58, 3), (58, 8),
-- Element 59(d): Business products
(59, 1), (59, 2), (59, 8),
-- Element 60(a): Internet search
(60, 1), (60, 2), (60, 3),
-- Element 61(b): Email application
(61, 1), (61, 2), (61, 3),
-- Element 62(c): Social media
(62, 1), (62, 2), (62, 3),
-- Element 63(d): Webinars
(63, 1), (63, 2), (63, 3),
-- Element 64(e): Online forms
(64, 1), (64, 2), (64, 3),
-- Element 65(f): Cloud storage
(65, 1), (65, 2), (65, 3),
-- Element 66(g): Internet threats
(66, 1), (66, 2), (66, 3), (66, 12),
-- Element 67(h): VPN and proxy
(67, 1), (67, 2), (67, 3),
-- Element 68(a): Email marketing
(68, 1), (68, 2), (68, 3),
-- Element 69(b): Digital contents
(69, 1), (69, 2), (69, 3),
-- Element 70(c): Blogs
(70, 1), (70, 2), (70, 3),
-- Element 71(d): Online advertising
(71, 1), (71, 2), (71, 3),
-- Element 72(e): Market analytics
(72, 1), (72, 2), (72, 3), (72, 5),
-- Element 73(f): CRM systems
(73, 1), (73, 2), (73, 3),
-- Element 74(g): AI tools
(74, 1), (74, 2), (74, 3);

COMMIT;