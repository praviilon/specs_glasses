<?php
defined('APP_BOOTSTRAPPED') or die;

function current_user_id() {
    return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
}

function require_auth() {
    $id = current_user_id();
    if (!$id) {
        fail('Please log in to continue.', 401);
    }
    return $id;
}

function find_user_by_email($email) {
    $stmt = db()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $row = $stmt->fetch();
    return $row ? $row : null;
}

function create_user($email, $password) {
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = db()->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    $stmt->execute([$email, $hash]);
    return (int) db()->lastInsertId();
}

function login_user($userId) {
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    ensure_csrf_token();
}

function register_failed_login($user) {
    $attempts = (int) $user['failed_attempts'] + 1;
    $lockUntil = null;
    if ($attempts >= 6) {
        $lockUntil = date('Y-m-d H:i:s', time() + 300); // 5 minute lock
    }
    $stmt = db()->prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?');
    $stmt->execute([$attempts, $lockUntil, $user['id']]);
}

function reset_login_attempts($userId) {
    $stmt = db()->prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?');
    $stmt->execute([$userId]);
}
