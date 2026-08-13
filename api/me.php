<?php
require_once __DIR__ . '/../includes/bootstrap.php';
require_method('GET');

$userId = current_user_id();
if (!$userId) {
    respond(['authenticated' => false, 'csrfToken' => ensure_csrf_token()]);
}

$stmt = db()->prepare('SELECT email FROM users WHERE id = ?');
$stmt->execute([$userId]);
$row = $stmt->fetch();

if (!$row) {
    respond(['authenticated' => false, 'csrfToken' => ensure_csrf_token()]);
}

respond([
    'authenticated' => true,
    'user' => ['email' => $row['email']],
    'csrfToken' => ensure_csrf_token(),
]);
