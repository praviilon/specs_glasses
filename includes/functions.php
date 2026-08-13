<?php
defined('APP_BOOTSTRAPPED') or die;

function json_input() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function respond($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function fail($message, $status = 400) {
    respond(['error' => $message], $status);
}

function require_method($method) {
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        fail('Method not allowed', 405);
    }
}

function ensure_csrf_token() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function check_csrf() {
    $sent = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
    $expected = isset($_SESSION['csrf_token']) ? $_SESSION['csrf_token'] : '';
    if (!$expected || !$sent || !hash_equals($expected, $sent)) {
        fail('Your session has expired. Please refresh the page and try again.', 419);
    }
}

function random_name($ext) {
    return bin2hex(random_bytes(16)) . '.' . $ext;
}

function user_dir($userId, $sub) {
    $dir = STORAGE_DIR . "/{$sub}/{$userId}";
    if (!is_dir($dir)) {
        mkdir($dir, 0750, true);
    }
    return $dir;
}

/**
 * Validates and moves an uploaded image from $_FILES[$field] into storage.
 * Returns a path relative to STORAGE_DIR on success, or null if the field
 * was empty. Calls fail() directly (and exits) for actual errors, so a
 * caller only needs to handle the "field wasn't provided" case itself.
 */
function store_uploaded_image($field, $userId, $sub) {
    global $config;

    if (!isset($_FILES[$field])) {
        return null;
    }

    $err = $_FILES[$field]['error'];
    if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
        fail('That image is too large for this server to accept. Try a smaller photo.', 413);
    }
    if ($err !== UPLOAD_ERR_OK) {
        return null;
    }

    $tmp = $_FILES[$field]['tmp_name'];
    $size = $_FILES[$field]['size'];
    if ($size <= 0 || $size > $config['max_upload_bytes']) {
        fail('That image is too large. Try a smaller photo.', 413);
    }

    $info = @getimagesize($tmp);
    if ($info === false) {
        fail('That file does not look like a valid image.', 422);
    }

    $extMap = [
        'image/png'  => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
    ];
    $mime = $info['mime'];
    if (!isset($extMap[$mime])) {
        fail('Please use a JPG, PNG, or WEBP image.', 422);
    }
    $ext = $extMap[$mime];

    $dir = user_dir($userId, $sub);
    $name = random_name($ext);
    $dest = $dir . '/' . $name;

    if (!move_uploaded_file($tmp, $dest)) {
        fail('Could not save the uploaded image. Please try again.', 500);
    }

    return "{$sub}/{$userId}/{$name}";
}

function delete_stored_file($relPath) {
    if (!$relPath) return;
    $full = STORAGE_DIR . '/' . $relPath;
    if (is_file($full)) {
        @unlink($full);
    }
}
