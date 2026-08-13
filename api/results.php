<?php
require_once __DIR__ . '/../includes/bootstrap.php';
$userId = require_auth();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = db()->prepare('SELECT id, created_at FROM results WHERE user_id = ? ORDER BY id DESC');
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    $out = array_map(function ($r) {
        return [
            'id' => (int) $r['id'],
            'createdAt' => $r['created_at'],
            'thumbUrl' => 'api/serve.php?type=result&id=' . $r['id'] . '&v=thumb',
            'fullUrl'  => 'api/serve.php?type=result&id=' . $r['id'] . '&v=full',
        ];
    }, $rows);
    respond(['results' => $out]);
}

if ($method === 'POST') {
    check_csrf();
    $selfieId = (isset($_POST['selfieId']) && $_POST['selfieId'] !== '') ? (int) $_POST['selfieId'] : null;
    $glassesId = (isset($_POST['glassesId']) && $_POST['glassesId'] !== '') ? (int) $_POST['glassesId'] : null;
    $full = store_uploaded_image('image', $userId, 'results');
    $thumb = store_uploaded_image('thumb', $userId, 'results');
    if (!$full || !$thumb) {
        fail('Could not save that image. Please try again.');
    }
    $stmt = db()->prepare('INSERT INTO results (user_id, file_path, thumb_path, selfie_id, glasses_id) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$userId, $full, $thumb, $selfieId, $glassesId]);
    $id = (int) db()->lastInsertId();
    respond([
        'result' => [
            'id' => $id,
            'thumbUrl' => 'api/serve.php?type=result&id=' . $id . '&v=thumb',
            'fullUrl'  => 'api/serve.php?type=result&id=' . $id . '&v=full',
        ],
    ], 201);
}

if ($method === 'DELETE') {
    check_csrf();
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    $stmt = db()->prepare('SELECT * FROM results WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    if (!$row) fail('Not found', 404);
    delete_stored_file($row['file_path']);
    delete_stored_file($row['thumb_path']);
    $del = db()->prepare('DELETE FROM results WHERE id = ?');
    $del->execute([$id]);
    respond(['ok' => true]);
}

fail('Method not allowed', 405);
