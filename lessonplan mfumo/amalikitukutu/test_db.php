<?php

$host = "sql212.ezyro.com";
$db   = "ezyro_42599568_lesson_plan";
$user = "ezyro_42599568";
$pass = "2e260b143f6b1";

try {
    $pdo = new PDO(
        "mysql:host=$host;port=3306;dbname=$db;charset=utf8mb4",
        $user,
        $pass
    );

    echo "Connected successfully";
} catch (PDOException $e) {
    echo $e->getMessage();
}