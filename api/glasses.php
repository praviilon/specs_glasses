<?php
require_once __DIR__ . '/../includes/bootstrap.php';
$userId = require_auth();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = db()->prepare('SELECT id, lens_type, created_at FROM glasses WHERE user_id = ? ORDER BY id DESC');
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    $out = array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'lensType' => $r['lens_type'],
            'createdAt' => $r['created_at'],
            'thumbUrl' => 'api/serve.php?type=glasses&id=' . $r['id'] . '&v=thumb',
            'fullUrl'  => 'api/serve.php?type=glasses&id=' . $r['id'] . '&v=full',
        ];
    }, $rows);
    respond(['glasses' => $out]);
}

if ($method === 'POST') {
    check_csrf();
    $lensType = (isset($_POST['lensType']) && $_POST['lensType'] === 'clear') ? 'clear' : 'tint';
    $full = store_uploaded_image('image', $userId, 'glasses');
    $thumb = store_uploaded_image('thumb', $userId, 'glasses');
    if (!$full || !$thumb) {
        fail('Could not save that photo. Please try again.');
    }
    $stmt = db()->prepare('INSERT INTO glasses (user_id, file_path, thumb_path, lens_type) VALUES (?, ?, ?, ?)');
    $stmt->execute([$userId, $full, $thumb, $lensType]);
    $id = (int) db()->lastInsertId();
    respond([
        'glasses' => [
            'id' => $id,
            'lensType' => $lensType,
            'thumbUrl' => 'api/serve.php?type=glasses&id=' . $id . '&v=thumb',
            'fullUrl'  => 'api/serve.php?type=glasses&id=' . $id . '&v=full',
        ],
    ], 201);
}

if ($method === 'DELETE') {
    check_csrf();
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    $stmt = db()->prepare('SELECT * FROM glasses WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    if (!$row) fail('Not found', 404);
    delete_stored_file($row['file_path']);
    delete_stored_file($row['thumb_path']);
    $del = db()->prepare('DELETE FROM glasses WHERE id = ?');
    $del->execute([$id]);
    respond(['ok' => true]);
}

fail('Method not allowed', 405);
