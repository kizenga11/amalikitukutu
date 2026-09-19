-- Safe migration: adds new columns without breaking existing data
-- Run this if your database was created before 2.txt was implemented.

USE lesson_plan_db;

ALTER TABLE `units`
  ADD COLUMN IF NOT EXISTS `form` varchar(10) DEFAULT NULL AFTER `periods_allocated`;

ALTER TABLE `element_methods`
  ADD COLUMN IF NOT EXISTS `time_minutes` int(11) DEFAULT NULL AFTER `stage`;

ALTER TABLE `lesson_plans`
  ADD COLUMN IF NOT EXISTS `reference` text DEFAULT NULL AFTER `remarks`;

ALTER TABLE `lesson_plans`
  ADD COLUMN IF NOT EXISTS `class_stream` varchar(5) DEFAULT NULL AFTER `form`;

ALTER TABLE `scheme_of_works`
  ADD COLUMN IF NOT EXISTS `class_stream` varchar(5) DEFAULT NULL AFTER `form`;

CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `role` ENUM('admin','teacher') NOT NULL DEFAULT 'teacher',
    `first_name` VARCHAR(50) DEFAULT NULL,
    `last_name` VARCHAR(50) DEFAULT NULL,
    `email` VARCHAR(100) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(20) DEFAULT NULL,
    `sex` VARCHAR(10) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `teacher_assignments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `teacher_id` INT NOT NULL,
    `subject_id` INT NOT NULL,
    `form_level` VARCHAR(20) NOT NULL DEFAULT 'Form One',
    `stream` VARCHAR(20) DEFAULT NULL,
    `class_stream` ENUM('A','B') DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE CASCADE
);
