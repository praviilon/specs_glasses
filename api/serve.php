<?php
require_once __DIR__ . '/../includes/bootstrap.php';
require_method('GET');
$userId = require_auth();

$type = isset($_GET['type']) ? $_GET['type'] : '';
$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$variant = (isset($_GET['v']) && $_GET['v'] === 'thumb') ? 'thumb' : 'full';

$tableMap = [
    'selfie'  => 'selfies',
    'glasses' => 'glasses',
    'result'  => 'results',
];
if (!isset($tableMap[$type])) {
    fail('Unknown image type', 400);
}
$table = $tableMap[$type];
$col = $variant === 'thumb' ? 'thumb_path' : 'file_path';

$stmt = db()->prepare("SELECT {$col} AS path FROM {$table} WHERE id = ? AND user_id = ?");
$stmt->execute([$id, $userId]);
$row = $stmt->fetch();
if (!$row) {
    http_response_code(404);
    exit;
}

$full = STORAGE_DIR . '/' . $row['path'];
if (!is_file($full)) {
    http_response_code(404);
    exit;
}

$ext = strtolower(pathinfo($full, PATHINFO_EXTENSION));
$mimeMap = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp'];
$mime = isset($mimeMap[$ext]) ? $mimeMap[$ext] : 'application/octet-stream';

header('Content-Type: ' . $mime);
header('Cache-Control: private, max-age=86400');
header('Content-Length: ' . filesize($full));
readfile($full);
exit;
