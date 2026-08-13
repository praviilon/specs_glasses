<?php
require_once __DIR__ . '/../includes/bootstrap.php';
require_method('POST');
check_csrf();

$_SESSION = [];
session_destroy();

respond(['ok' => true]);
