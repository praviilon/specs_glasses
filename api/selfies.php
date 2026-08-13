<?php
require_once __DIR__ . '/../includes/bootstrap.php';
$userId = require_auth();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = db()->prepare('SELECT id, created_at FROM selfies WHERE user_id = ? ORDER BY id DESC');
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    $out = array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'createdAt' => $r['created_at'],
            'thumbUrl' => 'api/serve.php?type=selfie&id=' . $r['id'] . '&v=thumb',
            'fullUrl'  => 'api/serve.php?type=selfie&id=' . $r['id'] . '&v=full',
        ];
    }, $rows);
    respond(['selfies' => $out]);
}

if ($method === 'POST') {
    check_csrf();
    $full = store_uploaded_image('image', $userId, 'selfies');
    $thumb = store_uploaded_image('thumb', $userId, 'selfies');
    if (!$full || !$thumb) {
        fail('Could not save that photo. Please try again.');
    }
    $stmt = db()->prepare('INSERT INTO selfies (user_id, file_path, thumb_path) VALUES (?, ?, ?)');
    $stmt->execute([$userId, $full, $thumb]);
    $id = (int) db()->lastInsertId();
    respond([
        'selfie' => [
            'id' => $id,
            'thumbUrl' => 'api/serve.php?type=selfie&id=' . $id . '&v=thumb',
            'fullUrl'  => 'api/serve.php?type=selfie&id=' . $id . '&v=full',
        ],
    ], 201);
}

if ($method === 'DELETE') {
    check_csrf();
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    $stmt = db()->prepare('SELECT * FROM selfies WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    if (!$row) fail('Not found', 404);
    delete_stored_file($row['file_path']);
    delete_stored_file($row['thumb_path']);
    $del = db()->prepare('DELETE FROM selfies WHERE id = ?');
    $del->execute([$id]);
    respond(['ok' => true]);
}

fail('Method not allowed', 405);
