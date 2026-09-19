<?php
require_once __DIR__ . '/includes/auth.php';
startAuth();
$_SESSION = [];
session_destroy();
header('Location: /amalikitukutu/login.php');
exit;
